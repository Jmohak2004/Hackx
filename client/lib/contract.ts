import { type Address } from "viem";
import { sepolia } from "viem/chains";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT ADDRESS & CHAIN CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const GAME_CONTRACT_ADDRESS: Address =
  "0x13a8638041b2825937756e19b775536c0150f429";

export const SUPPORTED_CHAIN = sepolia;

// ─────────────────────────────────────────────────────────────────────────────
// ABI — Extracted from LatentStyleGame.sol
// ─────────────────────────────────────────────────────────────────────────────

export const GAME_ABI = [
  // ── CONSTANTS ──────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "PLATFORM_FEE_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "BPS_DENOMINATOR",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_SCORE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_STAKE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_STAKE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },

  // ── STATE VARIABLES ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "currentRoundId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entryCounter",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "trustedAgents",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },

  // ── MAPPINGS ───────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "rounds",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "judgingDeadline", type: "uint256" },
      { name: "stakeAmount", type: "uint256" },
      { name: "scoreTolerance", type: "uint256" },
      { name: "totalPool", type: "uint256" },
      { name: "platformFeePool", type: "uint256" },
      { name: "winnersCount", type: "uint256" },
      { name: "isActive", type: "bool" },
      { name: "feesWithdrawn", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entries",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "participant", type: "address" },
      { name: "roundId", type: "uint256" },
      { name: "selfScore", type: "uint256" },
      { name: "verifiedScore", type: "uint256" },
      { name: "githubUrl", type: "string" },
      { name: "websiteUrl", type: "string" },
      { name: "proofIpfsHash", type: "string" },
      { name: "scored", type: "bool" },
      { name: "claimed", type: "bool" },
      { name: "isWinner", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "roundParticipant",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },

  // ── VIEW FUNCTIONS ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getRound",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "judgingDeadline", type: "uint256" },
          { name: "stakeAmount", type: "uint256" },
          { name: "scoreTolerance", type: "uint256" },
          { name: "totalPool", type: "uint256" },
          { name: "platformFeePool", type: "uint256" },
          { name: "winnersCount", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "feesWithdrawn", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEntry",
    inputs: [{ name: "entryId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "participant", type: "address" },
          { name: "roundId", type: "uint256" },
          { name: "selfScore", type: "uint256" },
          { name: "verifiedScore", type: "uint256" },
          { name: "githubUrl", type: "string" },
          { name: "websiteUrl", type: "string" },
          { name: "proofIpfsHash", type: "string" },
          { name: "scored", type: "bool" },
          { name: "claimed", type: "bool" },
          { name: "isWinner", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundEntries",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMyEntry",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPrizePool",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "gross", type: "uint256" },
      { name: "net", type: "uint256" },
      { name: "fee", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getWinnerShare",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },

  // ── WRITE FUNCTIONS ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "createRound",
    inputs: [
      { name: "stakeAmount", type: "uint256" },
      { name: "scoreTolerance", type: "uint256" },
      { name: "durationSecs", type: "uint256" },
      { name: "judgingBuffer", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "enterGame",
    inputs: [
      { name: "selfScore", type: "uint256" },
      { name: "githubUrl", type: "string" },
      { name: "websiteUrl", type: "string" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "submitVerifiedScore",
    inputs: [
      { name: "entryId", type: "uint256" },
      { name: "verifiedScore", type: "uint256" },
      { name: "proofIpfsHash", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimPrize",
    inputs: [{ name: "entryId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimRefund",
    inputs: [{ name: "entryId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawPlatformFees",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setTrustedAgent",
    inputs: [
      { name: "agent", type: "address" },
      { name: "trusted", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ── EVENTS ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "RoundCreated",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "stakeAmount", type: "uint256", indexed: false },
      { name: "tolerance", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EntrySubmitted",
    inputs: [
      { name: "entryId", type: "uint256", indexed: true },
      { name: "roundId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "selfScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ScoreVerified",
    inputs: [
      { name: "entryId", type: "uint256", indexed: true },
      { name: "verifiedScore", type: "uint256", indexed: false },
      { name: "isWinner", type: "bool", indexed: false },
      { name: "proofHash", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PrizeClaimed",
    inputs: [
      { name: "entryId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "entryId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentUpdated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "trusted", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PlatformFeesWithdrawn",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // ── ERRORS ─────────────────────────────────────────────────────────────────
  { type: "error", name: "RoundNotActive", inputs: [] },
  { type: "error", name: "RoundStillOpen", inputs: [] },
  { type: "error", name: "SubmissionClosed", inputs: [] },
  { type: "error", name: "InvalidScore", inputs: [] },
  {
    type: "error",
    name: "WrongStakeAmount",
    inputs: [
      { name: "required", type: "uint256" },
      { name: "sent", type: "uint256" },
    ],
  },
  { type: "error", name: "AlreadyEntered", inputs: [] },
  { type: "error", name: "NotScored", inputs: [] },
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "NotWinner", inputs: [] },
  { type: "error", name: "NotTrustedAgent", inputs: [] },
  { type: "error", name: "EntryAlreadyScored", inputs: [] },
  { type: "error", name: "JudgingNotExpired", inputs: [] },
  { type: "error", name: "InvalidUrl", inputs: [] },
  { type: "error", name: "FeesAlreadyWithdrawn", inputs: [] },
  { type: "error", name: "InvalidRoundTiming", inputs: [] },
  { type: "error", name: "NoWinnersInRound", inputs: [] },

  // ── CONSTRUCTOR ────────────────────────────────────────────────────────────
  {
    type: "constructor",
    inputs: [{ name: "initialOwner", type: "address" }],
    stateMutability: "nonpayable",
  },

  // ── RECEIVE ────────────────────────────────────────────────────────────────
  { type: "receive", stateMutability: "payable" },
] as const;
