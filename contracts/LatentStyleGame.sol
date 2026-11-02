// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LatentStyleGame
 * @notice Stake ETH against a self-score and let a trusted evaluator judge it.
 * @dev Version 2 freezes settlement before the first payout. Unjudged stakes are
 *      reserved in full and never enter the prize pool or platform fee.
 */
contract LatentStyleGame is ReentrancyGuard, Ownable, Pausable {
    uint256 public constant VERSION = 2;
    uint256 public constant PLATFORM_FEE_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_SCORE = 100;
    uint256 public constant MIN_STAKE = 0.001 ether;
    uint256 public constant MAX_STAKE = 10 ether;
    uint256 public constant MAX_URL_BYTES = 2048;
    uint256 public constant MAX_PROOF_BYTES = 256;
    uint256 public constant MAX_PAGE_SIZE = 100;

    // Keep the existing round/entry tuple shapes stable for readers.
    struct Round {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 judgingDeadline;
        uint256 stakeAmount;
        uint256 scoreTolerance;
        uint256 totalPool;
        uint256 platformFeePool;
        uint256 winnersCount;
        bool isActive;
        bool feesWithdrawn;
    }

    struct Entry {
        address participant;
        uint256 roundId;
        uint256 selfScore;
        uint256 verifiedScore;
        string githubUrl;
        string websiteUrl;
        string proofIpfsHash;
        bool scored;
        bool claimed;
        bool isWinner;
    }

    struct Settlement {
        uint256 scoredEntries;
        uint256 scoredPool;
        uint256 winnerShare;
        uint256 claimedWinners;
        bool finalized;
        bool refundAll;
    }

    uint256 public currentRoundId;
    uint256 public entryCounter;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Entry) public entries;
    mapping(uint256 => Settlement) public settlements;
    mapping(uint256 => uint256[]) public roundEntries;
    mapping(uint256 => mapping(address => uint256)) public roundParticipant;
    mapping(uint256 => mapping(address => uint256[])) private participantEntries;
    mapping(address => bool) public trustedAgents;

    event RoundCreated(uint256 indexed roundId, uint256 stakeAmount, uint256 tolerance, uint256 endTime);
    event EntrySubmitted(uint256 indexed entryId, uint256 indexed roundId, address indexed participant, uint256 selfScore);
    event ScoreVerified(uint256 indexed entryId, uint256 verifiedScore, bool isWinner, string proofHash);
    event RoundFinalized(uint256 indexed roundId, uint256 scoredPool, uint256 winnerShare, bool refundAll);
    event PrizeClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event RefundClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event AgentUpdated(address indexed agent, bool trusted);
    event PlatformFeesWithdrawn(uint256 indexed roundId, uint256 amount);

    error RoundNotActive();
    error RoundStillOpen();
    error RoundNotFound();
    error EntryNotFound();
    error SubmissionClosed();
    error ScoringClosed();
    error InvalidScore();
    error WrongStakeAmount(uint256 required, uint256 sent);
    error NotScored();
    error AlreadyClaimed();
    error NotWinner();
    error NotParticipant();
    error NotTrustedAgent();
    error EntryAlreadyScored();
    error JudgingNotExpired();
    error InvalidUrl();
    error InvalidProof();
    error InvalidAgent();
    error FeesAlreadyWithdrawn();
    error InvalidRoundTiming();
    error NoWinnersInRound();
    error InvalidPageSize();
    error TransferFailed();

    modifier onlyTrustedAgent() {
        if (!trustedAgents[msg.sender]) revert NotTrustedAgent();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        trustedAgents[initialOwner] = true;
        emit AgentUpdated(initialOwner, true);
    }

    function createRound(
        uint256 stakeAmount,
        uint256 scoreTolerance,
        uint256 durationSecs,
        uint256 judgingBuffer
    ) external onlyOwner whenNotPaused {
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) {
            revert WrongStakeAmount(MIN_STAKE, stakeAmount);
        }
        if (scoreTolerance > 20) revert InvalidScore();
        if (durationSecs == 0 || judgingBuffer == 0) revert InvalidRoundTiming();
        // An owner cannot silently end an open submission window by replacing it.
        if (currentRoundId != 0) {
            if (block.timestamp < rounds[currentRoundId].endTime) revert RoundStillOpen();
            rounds[currentRoundId].isActive = false;
        }
        uint256 roundId = ++currentRoundId;
        uint256 endTime = block.timestamp + durationSecs;
        rounds[roundId] = Round({
            id: roundId,
            startTime: block.timestamp,
            endTime: endTime,
            judgingDeadline: endTime + judgingBuffer,
            stakeAmount: stakeAmount,
            scoreTolerance: scoreTolerance,
            totalPool: 0,
            platformFeePool: 0,
            winnersCount: 0,
            isActive: true,
            feesWithdrawn: false
        });
        emit RoundCreated(roundId, stakeAmount, scoreTolerance, endTime);
    }

    function enterGame(
        uint256 selfScore,
        string calldata githubUrl,
        string calldata websiteUrl
    ) external payable nonReentrant whenNotPaused {
        Round storage round = rounds[currentRoundId];
        if (!round.isActive) revert RoundNotActive();
        if (block.timestamp >= round.endTime) revert SubmissionClosed();
        if (selfScore > MAX_SCORE) revert InvalidScore();
        if (msg.value != round.stakeAmount) revert WrongStakeAmount(round.stakeAmount, msg.value);
        if (
            bytes(githubUrl).length == 0 ||
            bytes(githubUrl).length > MAX_URL_BYTES ||
            bytes(websiteUrl).length > MAX_URL_BYTES
        ) revert InvalidUrl();

        uint256 entryId = ++entryCounter;
        entries[entryId] = Entry({
            participant: msg.sender,
            roundId: round.id,
            selfScore: selfScore,
            verifiedScore: 0,
            githubUrl: githubUrl,
            websiteUrl: websiteUrl,
            proofIpfsHash: "",
            scored: false,
            claimed: false,
            isWinner: false
        });
        roundEntries[round.id].push(entryId);
        roundParticipant[round.id][msg.sender] = entryId;
        participantEntries[round.id][msg.sender].push(entryId);
        round.totalPool += msg.value;
        emit EntrySubmitted(entryId, round.id, msg.sender, selfScore);
    }

    function submitVerifiedScore(
        uint256 entryId,
        uint256 verifiedScore,
        string calldata proofIpfsHash
    ) external onlyTrustedAgent nonReentrant {
        Entry storage entry = _entry(entryId);
        Round storage round = rounds[entry.roundId];
        if (entry.claimed) revert AlreadyClaimed();
        if (entry.scored) revert EntryAlreadyScored();
        if (settlements[round.id].finalized || block.timestamp > round.judgingDeadline) {
            revert ScoringClosed();
        }
        if (verifiedScore > MAX_SCORE) revert InvalidScore();
        if (bytes(proofIpfsHash).length == 0 || bytes(proofIpfsHash).length > MAX_PROOF_BYTES) {
            revert InvalidProof();
        }
        entry.verifiedScore = verifiedScore;
        entry.proofIpfsHash = proofIpfsHash;
        entry.scored = true;
        uint256 diff = entry.selfScore > verifiedScore
            ? entry.selfScore - verifiedScore
            : verifiedScore - entry.selfScore;
        entry.isWinner = diff <= round.scoreTolerance;
        settlements[round.id].scoredEntries++;
        if (entry.isWinner) round.winnersCount++;
        emit ScoreVerified(entryId, verifiedScore, entry.isWinner, proofIpfsHash);
    }

    /**
     * @notice Anyone can finalize after submissions close and all entries are
     * judged, or after the judging deadline. Repeated calls are harmless.
     */
    function finalizeRound(uint256 roundId) external nonReentrant {
        _finalize(roundId);
    }

    function _finalize(uint256 roundId) private {
        Round storage round = _round(roundId);
        Settlement storage settlement = settlements[roundId];
        if (settlement.finalized) return;
        if (block.timestamp < round.endTime) revert RoundStillOpen();
        if (
            settlement.scoredEntries != roundEntries[roundId].length &&
            block.timestamp <= round.judgingDeadline
        ) revert JudgingNotExpired();

        settlement.finalized = true;
        round.isActive = false;
        settlement.scoredPool = settlement.scoredEntries * round.stakeAmount;
        settlement.refundAll = round.winnersCount == 0;
        if (!settlement.refundAll) {
            uint256 fee = settlement.scoredPool * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
            uint256 net = settlement.scoredPool - fee;
            settlement.winnerShare = net / round.winnersCount;
            // Division dust is less than one wei per winner and is accounted
            // with the fee so it cannot remain permanently locked.
            round.platformFeePool = fee + net % round.winnersCount;
        }
        emit RoundFinalized(roundId, settlement.scoredPool, settlement.winnerShare, settlement.refundAll);
    }

    // Exits deliberately remain available while new entries are paused.
    function claimPrize(uint256 entryId) external nonReentrant {
        Entry storage entry = _entry(entryId);
        if (entry.participant != msg.sender) revert NotParticipant();
        if (entry.claimed) revert AlreadyClaimed();
        if (!entry.scored) revert NotScored();
        if (!entry.isWinner) revert NotWinner();
        _finalize(entry.roundId);
        entry.claimed = true;
        Settlement storage settlement = settlements[entry.roundId];
        settlement.claimedWinners++;
        uint256 amount = settlement.winnerShare;
        _send(msg.sender, amount);
        emit PrizeClaimed(entryId, msg.sender, amount);
    }

    /**
     * @notice Unjudged entries reclaim their whole stake after the judging
     * deadline. If nobody won, every entry reclaims its whole stake without fee.
     */
    function claimRefund(uint256 entryId) external nonReentrant {
        Entry storage entry = _entry(entryId);
        if (entry.participant != msg.sender) revert NotParticipant();
        if (entry.claimed) revert AlreadyClaimed();
        _finalize(entry.roundId);
        Settlement storage settlement = settlements[entry.roundId];
        if (!settlement.refundAll && entry.scored) revert EntryAlreadyScored();
        entry.claimed = true;
        Round storage round = rounds[entry.roundId];
        round.totalPool -= round.stakeAmount;
        _send(msg.sender, round.stakeAmount);
        emit RefundClaimed(entryId, msg.sender, round.stakeAmount);
    }

    function withdrawPlatformFees(uint256 roundId) external onlyOwner nonReentrant {
        _finalize(roundId);
        Round storage round = rounds[roundId];
        if (round.feesWithdrawn) revert FeesAlreadyWithdrawn();
        if (round.platformFeePool == 0) revert NoWinnersInRound();
        round.feesWithdrawn = true;
        _send(owner(), round.platformFeePool);
        emit PlatformFeesWithdrawn(roundId, round.platformFeePool);
    }

    function setTrustedAgent(address agent, bool trusted) external onlyOwner {
        if (agent == address(0)) revert InvalidAgent();
        trustedAgents[agent] = trusted;
        emit AgentUpdated(agent, trusted);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return _round(roundId);
    }

    function getEntry(uint256 entryId) external view returns (Entry memory) {
        return _entry(entryId);
    }

    function getSettlement(uint256 roundId) external view returns (Settlement memory) {
        _round(roundId);
        return settlements[roundId];
    }

    function getRoundEntries(uint256 roundId) external view returns (uint256[] memory) {
        _round(roundId);
        return roundEntries[roundId];
    }

    function getRoundEntriesPage(
        uint256 roundId, uint256 offset, uint256 limit
    ) external view returns (uint256[] memory page, uint256 total) {
        _round(roundId);
        if (limit == 0 || limit > MAX_PAGE_SIZE) revert InvalidPageSize();
        uint256[] storage ids = roundEntries[roundId];
        total = ids.length;
        if (offset >= total) return (new uint256[](0), total);
        uint256 length = total - offset;
        if (length > limit) length = limit;
        page = new uint256[](length);
        for (uint256 i; i < length; ++i) page[i] = ids[offset + i];
    }

    function getMyEntry(uint256 roundId, address participant) external view returns (uint256) {
        return roundParticipant[roundId][participant];
    }

    function getMyEntries(uint256 roundId, address participant) external view returns (uint256[] memory) {
        return participantEntries[roundId][participant];
    }

    function previewSettlement(uint256 roundId) public view returns (
        bool ready, uint256 winnerShare, uint256 fee, bool refundAll
    ) {
        Round storage round = _round(roundId);
        Settlement storage settlement = settlements[roundId];
        if (settlement.finalized) {
            return (true, settlement.winnerShare, round.platformFeePool, settlement.refundAll);
        }
        ready = block.timestamp >= round.endTime && (
            settlement.scoredEntries == roundEntries[roundId].length ||
            block.timestamp > round.judgingDeadline
        );
        refundAll = round.winnersCount == 0;
        if (!refundAll) {
            uint256 pool = settlement.scoredEntries * round.stakeAmount;
            fee = pool * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
            uint256 net = pool - fee;
            winnerShare = net / round.winnersCount;
            fee += net % round.winnersCount;
        }
    }

    function getPrizePool(uint256 roundId) external view returns (uint256 gross, uint256 net, uint256 fee) {
        Round storage round = _round(roundId);
        gross = round.totalPool;
        (, , fee, ) = previewSettlement(roundId);
        uint256 pool = settlements[roundId].scoredEntries * round.stakeAmount;
        net = round.winnersCount == 0 ? 0 : pool - fee;
    }

    function getWinnerShare(uint256 roundId) external view returns (uint256) {
        (bool ready, uint256 share, , ) = previewSettlement(roundId);
        return ready ? share : 0;
    }

    function _entry(uint256 entryId) private view returns (Entry storage entry) {
        entry = entries[entryId];
        if (entry.participant == address(0)) revert EntryNotFound();
    }

    function _round(uint256 roundId) private view returns (Round storage round) {
        round = rounds[roundId];
        if (round.id == 0) revert RoundNotFound();
    }

    function _send(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable { revert("Use enterGame()"); }
}
