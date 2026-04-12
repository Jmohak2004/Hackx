// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LatentStyleGame
 * @notice Trustless AI-verified skill contest: stake ETH, self-declare a score,
 *         submit proof links, and let an off-chain AI agent verify. Winners claim prizes.
 */
contract LatentStyleGame is ReentrancyGuard, Ownable, Pausable {

    // ─────────────────────────────────────────────────────────────────────────────
    // CONSTANTS & CONFIG
    // ─────────────────────────────────────────────────────────────────────────────

    uint256 public constant PLATFORM_FEE_BPS = 500;       // 5% platform fee (basis points)
    uint256 public constant BPS_DENOMINATOR   = 10_000;
    uint256 public constant MAX_SCORE         = 100;
    uint256 public constant MIN_STAKE         = 0.001 ether;
    uint256 public constant MAX_STAKE         = 10 ether;

    // ─────────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────────

    struct Round {
        uint256 id;
        uint256 startTime;
        uint256 endTime;           // submission deadline
        uint256 judgingDeadline;   // after this, unclaimed stakes refundable
        uint256 stakeAmount;       // fixed stake per round
        uint256 scoreTolerance;    // e.g. 5 means ±5 points
        uint256 totalPool;
        uint256 platformFeePool;
        uint256 winnersCount;
        bool    isActive;
        bool    feesWithdrawn;
    }

    struct Entry {
        address participant;
        uint256 roundId;
        uint256 selfScore;         // 0–100 declared by user
        uint256 verifiedScore;     // set by trusted agent
        string  githubUrl;
        string  websiteUrl;
        string  proofIpfsHash;     // IPFS hash of agent report
        bool    scored;
        bool    claimed;
        bool    isWinner;
    }

    // Round storage
    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;

    // Entry storage
    uint256 public entryCounter;
    mapping(uint256 => Entry) public entries;                                // entryId => Entry
    mapping(uint256 => uint256[]) public roundEntries;                       // roundId => entryIds[]
    mapping(uint256 => mapping(address => uint256)) public roundParticipant; // roundId => addr => latest entryId
    mapping(uint256 => mapping(address => uint256[])) private roundParticipantEntries; // roundId => addr => all entryIds

    // Trusted agent addresses (can submit verified scores)
    mapping(address => bool) public trustedAgents;

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────────────────────

    event RoundCreated(uint256 indexed roundId, uint256 stakeAmount, uint256 tolerance, uint256 endTime);
    event EntrySubmitted(uint256 indexed entryId, uint256 indexed roundId, address indexed participant, uint256 selfScore);
    event ScoreVerified(uint256 indexed entryId, uint256 verifiedScore, bool isWinner, string proofHash);
    event PrizeClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event RefundClaimed(uint256 indexed entryId, address indexed participant, uint256 amount);
    event AgentUpdated(address indexed agent, bool trusted);
    event PlatformFeesWithdrawn(uint256 indexed roundId, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────────
    // ERRORS
    // ─────────────────────────────────────────────────────────────────────────────

    error RoundNotActive();
    error RoundStillOpen();
    error SubmissionClosed();
    error InvalidScore();
    error WrongStakeAmount(uint256 required, uint256 sent);
    error NotScored();
    error AlreadyClaimed();
    error NotWinner();
    error NotTrustedAgent();
    error EntryAlreadyScored();
    error JudgingNotExpired();
    error InvalidUrl();
    error FeesAlreadyWithdrawn();
    error InvalidRoundTiming();
    error NoWinnersInRound();

    // ─────────────────────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────────────────────

    modifier onlyTrustedAgent() {
        if (!trustedAgents[msg.sender]) revert NotTrustedAgent();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────────────────────

    constructor(address initialOwner) Ownable(initialOwner) {
        // Owner is also a trusted agent by default
        trustedAgents[initialOwner] = true;
        emit AgentUpdated(initialOwner, true);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ADMIN: ROUND MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new game round
     * @param stakeAmount   ETH each participant must stake (in wei)
     * @param scoreTolerance Points window for a "win" (e.g. 5 = ±5)
     * @param durationSecs  How long submissions are open (seconds)
     * @param judgingBuffer Extra seconds after close before refunds unlock
     */
    function createRound(
        uint256 stakeAmount,
        uint256 scoreTolerance,
        uint256 durationSecs,
        uint256 judgingBuffer
    ) external onlyOwner whenNotPaused {
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) revert WrongStakeAmount(MIN_STAKE, stakeAmount);
        if (scoreTolerance > 20) revert InvalidScore();  // cap tolerance at 20 pts
        if (durationSecs == 0 || judgingBuffer == 0) revert InvalidRoundTiming();

        // Mark previous round inactive
        if (currentRoundId > 0) {
            rounds[currentRoundId].isActive = false;
        }

        currentRoundId++;
        uint256 endTime       = block.timestamp + durationSecs;
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

    // ─────────────────────────────────────────────────────────────────────────────
    // PLAYER: ENTER GAME
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Enter the current active round
     * @param selfScore  Your declared score (0–100)
     * @param githubUrl  Link to your GitHub repo
     * @param websiteUrl Link to your live website
     */
    function enterGame(
        uint256 selfScore,
        string calldata githubUrl,
        string calldata websiteUrl
    ) external payable nonReentrant whenNotPaused {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (!round.isActive)                           revert RoundNotActive();
        if (block.timestamp > round.endTime)           revert SubmissionClosed();
        if (selfScore > MAX_SCORE)                     revert InvalidScore();
        if (msg.value != round.stakeAmount)            revert WrongStakeAmount(round.stakeAmount, msg.value);
        if (bytes(githubUrl).length == 0 || bytes(websiteUrl).length == 0) revert InvalidUrl();

        entryCounter++;
        uint256 entryId = entryCounter;

        entries[entryId] = Entry({
            participant:    msg.sender,
            roundId:        roundId,
            selfScore:      selfScore,
            verifiedScore:  0,
            githubUrl:      githubUrl,
            websiteUrl:     websiteUrl,
            proofIpfsHash:  "",
            scored:         false,
            claimed:        false,
            isWinner:       false
        });

        roundEntries[roundId].push(entryId);
        roundParticipant[roundId][msg.sender] = entryId; // keep latest for backward compatibility
        roundParticipantEntries[roundId][msg.sender].push(entryId);

        // Platform fee is deducted from pool at scoring time; track gross for now
        round.totalPool += msg.value;

        emit EntrySubmitted(entryId, roundId, msg.sender, selfScore);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // AGENT: SUBMIT VERIFIED SCORE
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit AI agent's verified score for an entry
     * @param entryId       The entry being judged
     * @param verifiedScore Score computed by the agent (0–100)
     * @param proofIpfsHash IPFS hash of the full agent report
     */
    function submitVerifiedScore(
        uint256 entryId,
        uint256 verifiedScore,
        string calldata proofIpfsHash
    ) external onlyTrustedAgent nonReentrant {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        if (entry.participant == address(0)) revert NotScored(); // entry doesn't exist
        if (entry.scored)                    revert EntryAlreadyScored();
        if (verifiedScore > MAX_SCORE)       revert InvalidScore();

        entry.verifiedScore  = verifiedScore;
        entry.proofIpfsHash  = proofIpfsHash;
        entry.scored         = true;

        // Determine winner: |selfScore - verifiedScore| <= tolerance
        uint256 diff = entry.selfScore > verifiedScore
            ? entry.selfScore - verifiedScore
            : verifiedScore - entry.selfScore;

        bool isWinner = diff <= round.scoreTolerance;
        entry.isWinner = isWinner;

        if (isWinner) {
            round.winnersCount++;
        }

        emit ScoreVerified(entryId, verifiedScore, isWinner, proofIpfsHash);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PLAYER: CLAIM PRIZE
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Winners call this to receive their share of the prize pool
     * @param entryId The winning entry ID
     */
    function claimPrize(uint256 entryId) external nonReentrant whenNotPaused {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        if (entry.participant != msg.sender)  revert NotTrustedAgent(); // wrong caller
        if (!entry.scored)                    revert NotScored();
        if (entry.claimed)                    revert AlreadyClaimed();
        if (!entry.isWinner)                  revert NotWinner();
        if (round.winnersCount == 0)          revert NoWinnersInRound();

        entry.claimed = true;

        // Calculate prize: total pool minus platform fee, split equally among winners
        uint256 fee       = (round.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 prizePool = round.totalPool - fee;
        uint256 share     = prizePool / round.winnersCount;

        // Track fees (only first winner triggers fee accounting, rest just split)
        if (round.platformFeePool == 0) {
            round.platformFeePool = fee;
        }

        (bool success, ) = payable(msg.sender).call{value: share}("");
        require(success, "Transfer failed");

        emit PrizeClaimed(entryId, msg.sender, share);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PLAYER: CLAIM REFUND (if not scored before judging deadline)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice If agent hasn't scored your entry before judgingDeadline, reclaim your stake
     */
    function claimRefund(uint256 entryId) external nonReentrant {
        Entry storage entry = entries[entryId];
        Round storage round = rounds[entry.roundId];

        if (entry.participant != msg.sender) revert NotTrustedAgent();
        if (entry.claimed)                   revert AlreadyClaimed();
        if (entry.scored)                    revert EntryAlreadyScored(); // scored = no refund path
        if (block.timestamp <= round.judgingDeadline) revert JudgingNotExpired();

        entry.claimed = true;
        round.totalPool -= round.stakeAmount;

        (bool success, ) = payable(msg.sender).call{value: round.stakeAmount}("");
        require(success, "Refund failed");

        emit RefundClaimed(entryId, msg.sender, round.stakeAmount);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ADMIN: WITHDRAW PLATFORM FEES
    // ─────────────────────────────────────────────────────────────────────────────

    function withdrawPlatformFees(uint256 roundId) external onlyOwner nonReentrant {
        Round storage round = rounds[roundId];
        if (round.feesWithdrawn) revert FeesAlreadyWithdrawn();
        if (round.platformFeePool == 0) revert NoWinnersInRound();

        round.feesWithdrawn = true;
        uint256 amount = round.platformFeePool;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Fee withdrawal failed");

        emit PlatformFeesWithdrawn(roundId, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ADMIN: AGENT MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    function setTrustedAgent(address agent, bool trusted) external onlyOwner {
        trustedAgents[agent] = trusted;
        emit AgentUpdated(agent, trusted);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────────────────────

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getEntry(uint256 entryId) external view returns (Entry memory) {
        return entries[entryId];
    }

    function getRoundEntries(uint256 roundId) external view returns (uint256[] memory) {
        return roundEntries[roundId];
    }

    // Backward-compatible: returns latest entry for a participant in a round.
    function getMyEntry(uint256 roundId, address participant) external view returns (uint256) {
        return roundParticipant[roundId][participant];
    }

    // New helper: returns all entries by a participant in a round.
    function getMyEntries(uint256 roundId, address participant) external view returns (uint256[] memory) {
        return roundParticipantEntries[roundId][participant];
    }

    function getPrizePool(uint256 roundId) external view returns (uint256 gross, uint256 net, uint256 fee) {
        Round memory r = rounds[roundId];
        fee  = (r.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        net  = r.totalPool - fee;
        gross = r.totalPool;
    }

    function getWinnerShare(uint256 roundId) external view returns (uint256) {
        Round memory r = rounds[roundId];
        if (r.winnersCount == 0) return 0;
        uint256 fee      = (r.totalPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 prizePool = r.totalPool - fee;
        return prizePool / r.winnersCount;
    }

    // Safety: reject accidental ETH sends
    receive() external payable { revert("Use enterGame()"); }
}
