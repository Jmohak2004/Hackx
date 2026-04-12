// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract LatentStyleGame is ReentrancyGuard, Ownable, Pausable {

    uint256 public constant PLATFORM_FEE_BPS = 500;
    uint256 public constant BPS_DENOMINATOR   = 10_000;
    uint256 public constant MAX_SCORE         = 100;
    uint256 public constant MIN_STAKE         = 0.001 ether;
    uint256 public constant MAX_STAKE         = 10 ether;

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
        bool    isActive;
        bool    feesWithdrawn;
    }

    struct Entry {
        address participant;
        uint256 roundId;
        uint256 selfScore;
        uint256 verifiedScore;
        string  githubUrl;
        string  websiteUrl;
        string  proofIpfsHash;
        bool    scored;
        bool    claimed;
        bool    isWinner;
    }

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;

    uint256 public entryCounter;
    mapping(uint256 => Entry) public entries;
    mapping(uint256 => uint256[]) public roundEntries;

    mapping(uint256 => mapping(address => uint256[])) public roundParticipantEntries;

    mapping(address => bool) public trustedAgents;

    event RoundCreated(uint256 indexed roundId, uint256 stakeAmount, uint256 tolerance, uint256 endTime);
    event EntrySubmitted(uint256 indexed entryId, uint256 indexed roundId, address indexed participant, uint256 selfScore);
    event ScoreVerified(uint256 indexed entryId, uint256 verifiedScore, bool isWinner, string proofHash);
    event PrizeClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event RefundClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event AgentUpdated(address indexed agent, bool trusted);
    event PlatformFeesWithdrawn(uint256 indexed roundId, uint256 amount);

    error RoundNotActive();
    error RoundStillOpen();
    error SubmissionClosed();
    error InvalidScore();
    error WrongStakeAmount(uint256 required, uint256 sent);
    error NotScored();
    error AlreadyClaimed();
    error NotWinner();
    error NotTrustedAgent();
    error NotParticipant();
    error EntryAlreadyScored();
    error JudgingNotExpired();
    error InvalidUrl();
    error FeesAlreadyWithdrawn();
    error InvalidRoundTiming();
    error NoWinnersInRound();

    modifier onlyTrustedAgent() {
        if (!trustedAgents[msg.sender]) revert NotTrustedAgent();
        _;
    }

    // FIX 1: constructor registers initialOwner as trusted agent — same as before.
    // To add the server wallet, the owner must call setTrustedAgent() after deploy.
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
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) revert WrongStakeAmount(MIN_STAKE, stakeAmount);
        if (scoreTolerance > 20) revert InvalidScore();
        if (durationSecs == 0 || judgingBuffer == 0) revert InvalidRoundTiming();

        if (currentRoundId > 0) {
            rounds[currentRoundId].isActive = false;
        }

        currentRoundId++;
        uint256 endTime         = block.timestamp + durationSecs;
        uint256 judgingDeadline = endTime + judgingBuffer;

        rounds[currentRoundId] = Round({
            id:              currentRoundId,
            startTime:       block.timestamp,
            endTime:         endTime,
            judgingDeadline: judgingDeadline,
            stakeAmount:     stakeAmount,
            scoreTolerance:  scoreTolerance,
            totalPool:       0,
            platformFeePool: 0,
            winnersCount:    0,
            isActive:        true,
            feesWithdrawn:   false
        });

        emit RoundCreated(currentRoundId, stakeAmount, scoreTolerance, endTime);
    }

    function enterGame(
        uint256 selfScore,
        string calldata githubUrl,
        string calldata websiteUrl
    ) external payable nonReentrant whenNotPaused {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (!round.isActive)                 revert RoundNotActive();
        if (block.timestamp > round.endTime) revert SubmissionClosed();
        if (selfScore > MAX_SCORE)           revert InvalidScore();
        if (msg.value != round.stakeAmount)  revert WrongStakeAmount(round.stakeAmount, msg.value);
        if (bytes(githubUrl).length == 0 || bytes(websiteUrl).length == 0) revert InvalidUrl();

        entryCounter++;
        uint256 entryId = entryCounter;

        entries[entryId] = Entry({
            participant:   msg.sender,
            roundId:       roundId,
            selfScore:     selfScore,
            verifiedScore: 0,
            githubUrl:     githubUrl,
            websiteUrl:    websiteUrl,
            proofIpfsHash: "",
            scored:        false,
            claimed:       false,
            isWinner:      false
        });

        roundEntries[roundId].push(entryId);
        roundParticipantEntries[roundId][msg.sender].push(entryId);

        round.totalPool += msg.value;

        emit EntrySubmitted(entryId, roundId, msg.sender, selfScore);
    }

    function submitVerifiedScore(
        uint256 entryId,
        uint256 verifiedScore,
        string calldata proofIpfsHash
    ) external onlyTrustedAgent nonReentrant {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        // FIX 2: was reverting NotScored() when participant is zero — use correct error
        if (entry.participant == address(0)) revert InvalidScore();
        if (entry.scored)                    revert EntryAlreadyScored();
        if (verifiedScore > MAX_SCORE)       revert InvalidScore();

        entry.verifiedScore = verifiedScore;
        entry.proofIpfsHash = proofIpfsHash;
        entry.scored        = true;

        uint256 diff = entry.selfScore > verifiedScore
            ? entry.selfScore - verifiedScore
            : verifiedScore - entry.selfScore;

        bool isWinner  = diff <= round.scoreTolerance;
        entry.isWinner = isWinner;

        if (isWinner) {
            round.winnersCount++;
        }

        emit ScoreVerified(entryId, verifiedScore, isWinner, proofIpfsHash);
    }

    function claimPrize(uint256 entryId) external nonReentrant whenNotPaused {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        if (entry.participant != msg.sender) revert NotParticipant();
        if (!entry.scored)                   revert NotScored();
        if (entry.claimed)                   revert AlreadyClaimed();
        if (!entry.isWinner)                 revert NotWinner();
        if (round.winnersCount == 0)         revert NoWinnersInRound();

        entry.claimed = true;

        uint256 share;
        // Single-entrant round: return full stake, no platform fee
        if (roundEntries[entry.roundId].length == 1) {
            share = round.stakeAmount;
        } else {
            uint256 fee       = (round.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 prizePool = round.totalPool - fee;
            share             = prizePool / round.winnersCount;

            if (round.platformFeePool == 0) {
                round.platformFeePool = fee;
            }
        }

        (bool success, ) = payable(msg.sender).call{value: share}("");
        require(success, "Transfer failed");

        emit PrizeClaimed(entryId, msg.sender, share);
    }

    function claimRefund(uint256 entryId) external nonReentrant {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        if (entry.participant != msg.sender) revert NotParticipant();
        if (entry.claimed)                   revert AlreadyClaimed();

        // Single-entrant round: if scored and lost, allow immediate refund of full stake
        if (roundEntries[entry.roundId].length == 1 && entry.scored && !entry.isWinner) {
            entry.claimed    = true;
            round.totalPool -= round.stakeAmount;
            (bool ok, )      = payable(msg.sender).call{value: round.stakeAmount}("");
            require(ok, "Refund failed");
            emit RefundClaimed(entryId, msg.sender, round.stakeAmount);
            return;
        }

        // Normal path: unscored entry after judging deadline
        if (entry.scored)                             revert EntryAlreadyScored();
        if (block.timestamp <= round.judgingDeadline) revert JudgingNotExpired();

        entry.claimed    = true;
        round.totalPool -= round.stakeAmount;

        (bool success, ) = payable(msg.sender).call{value: round.stakeAmount}("");
        require(success, "Refund failed");

        emit RefundClaimed(entryId, msg.sender, round.stakeAmount);
    }

    function withdrawPlatformFees(uint256 roundId) external onlyOwner nonReentrant {
        Round storage round = rounds[roundId];
        if (round.feesWithdrawn)        revert FeesAlreadyWithdrawn();
        if (round.platformFeePool == 0) revert NoWinnersInRound();

        round.feesWithdrawn = true;
        uint256 amount = round.platformFeePool;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Fee withdrawal failed");

        emit PlatformFeesWithdrawn(roundId, amount);
    }

    function setTrustedAgent(address agent, bool trusted) external onlyOwner {
        trustedAgents[agent] = trusted;
        emit AgentUpdated(agent, trusted);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getEntry(uint256 entryId) external view returns (Entry memory) {
        return entries[entryId];
    }

    function getRoundEntries(uint256 roundId) external view returns (uint256[] memory) {
        return roundEntries[roundId];
    }

    // FIX 5: add getMyEntry (singular) that the server/ABI calls — returns the LAST entry
    // for backward compat with server/blockchain.js which calls getMyEntry(roundId, address)
    function getMyEntry(uint256 roundId, address participant) external view returns (uint256) {
        uint256[] storage ids = roundParticipantEntries[roundId][participant];
        if (ids.length == 0) return 0;
        return ids[ids.length - 1];
    }

    function getMyEntries(uint256 roundId, address participant) external view returns (uint256[] memory) {
        return roundParticipantEntries[roundId][participant];
    }

    function getPrizePool(uint256 roundId) external view returns (uint256 gross, uint256 net, uint256 fee) {
        Round memory r = rounds[roundId];
        fee   = (r.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        net   = r.totalPool - fee;
        gross = r.totalPool;
    }

    function getWinnerShare(uint256 roundId) external view returns (uint256) {
        Round memory r = rounds[roundId];
        if (r.winnersCount == 0) return 0;
        uint256 fee       = (r.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 prizePool = r.totalPool - fee;
        return prizePool / r.winnersCount;
    }

    receive() external payable { revert("Use enterGame()"); }
}
