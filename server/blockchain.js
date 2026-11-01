/**
 * Blockchain service — trusted-agent wallet for on-chain score submission.
 *
 * Uses ethers.js v6 to interact with the LatentStyleGame contract on Sepolia.
 * The server wallet must be registered as a trustedAgent on the contract.
 */

const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS =
  process.env.GAME_CONTRACT_ADDRESS || "0xC2df02602eFD8e4459064BB752C8BD1Da0F8D6A8";

const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

// Minimal ABI — only the functions the server needs
const GAME_ABI = [
  // Views
  "function currentRoundId() view returns (uint256)",
  "function entryCounter() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (tuple(uint256 id, uint256 startTime, uint256 endTime, uint256 judgingDeadline, uint256 stakeAmount, uint256 scoreTolerance, uint256 totalPool, uint256 platformFeePool, uint256 winnersCount, bool isActive, bool feesWithdrawn))",
  "function getEntry(uint256 entryId) view returns (tuple(address participant, uint256 roundId, uint256 selfScore, uint256 verifiedScore, string githubUrl, string websiteUrl, string proofIpfsHash, bool scored, bool claimed, bool isWinner))",
  "function getMyEntry(uint256 roundId, address participant) view returns (uint256)",
  "function getWinnerShare(uint256 roundId) view returns (uint256)",
  "function trustedAgents(address) view returns (bool)",
  // Writes (trusted agent)
  "function submitVerifiedScore(uint256 entryId, uint256 verifiedScore, string proofIpfsHash)",
  // Events
  "event ScoreVerified(uint256 indexed entryId, uint256 verifiedScore, bool isWinner, string proofHash)",
  "event EntrySubmitted(uint256 indexed entryId, uint256 indexed roundId, address indexed participant, uint256 selfScore)",
];

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER & WALLET
// ─────────────────────────────────────────────────────────────────────────────

let _provider = null;
let _agentWallet = null;
let _contract = null;
let _readContract = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  }
  return _provider;
}

function getReadContract() {
  if (!_readContract) {
    _readContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      GAME_ABI,
      getProvider()
    );
  }
  return _readContract;
}

function getAgentWallet() {
  if (!_agentWallet) {
    const pk = process.env.AGENT_PRIVATE_KEY;
    if (!pk) {
      throw new Error(
        "AGENT_PRIVATE_KEY not set in .env — needed for on-chain score submission"
      );
    }
    _agentWallet = new ethers.Wallet(pk, getProvider());
  }
  return _agentWallet;
}

function getWriteContract() {
  if (!_contract) {
    _contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      GAME_ABI,
      getAgentWallet()
    );
  }
  return _contract;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function getCurrentRound() {
  const contract = getReadContract();
  const roundId = await contract.currentRoundId();
  if (roundId === 0n) return null;
  const round = await contract.getRound(roundId);
  if (!round.isActive || BigInt(Math.floor(Date.now() / 1000)) > round.endTime) {
    return null;
  }
  return {
    id: roundId.toString(),
    startTime: Number(round.startTime),
    endTime: Number(round.endTime),
    judgingDeadline: Number(round.judgingDeadline),
    stakeAmount: round.stakeAmount.toString(),
    stakeAmountEth: ethers.formatEther(round.stakeAmount),
    scoreTolerance: Number(round.scoreTolerance),
    totalPool: ethers.formatEther(round.totalPool),
    winnersCount: Number(round.winnersCount),
    isActive: round.isActive,
  };
}

async function getEntry(entryId) {
  const contract = getReadContract();
  const entry = await contract.getEntry(BigInt(entryId));
  const round = await contract.getRound(entry.roundId);
  return {
    participant: entry.participant,
    roundId: entry.roundId.toString(),
    selfScore: Number(entry.selfScore),
    verifiedScore: Number(entry.verifiedScore),
    githubUrl: entry.githubUrl,
    websiteUrl: entry.websiteUrl,
    proofIpfsHash: entry.proofIpfsHash,
    scored: entry.scored,
    claimed: entry.claimed,
    isWinner: entry.isWinner,
    judgingDeadline: Number(round.judgingDeadline),
  };
}

async function getEntryIdForParticipant(roundId, participantAddress) {
  const contract = getReadContract();
  const entryId = await contract.getMyEntry(
    BigInt(roundId),
    participantAddress
  );
  return entryId.toString();
}

async function getAgentAddress() {
  return getAgentWallet().address;
}

async function isAgentTrusted() {
  const contract = getReadContract();
  const wallet = getAgentWallet();
  return contract.trustedAgents(wallet.address);
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a verified score for an entry on-chain.
 *
 * @param {string|number} entryId  — the on-chain entry ID
 * @param {number} verifiedScore   — AI score on 0-100 scale
 * @param {string} proofHash       — IPFS hash or proof string
 * @returns {{ txHash, isWinner, verifiedScore, entryId }}
 */
async function submitVerifiedScore(entryId, verifiedScore, proofHash) {
  const contract = getWriteContract();

  // Sanity checks
  if (verifiedScore < 0 || verifiedScore > 100) {
    throw new Error(`verifiedScore must be 0-100, got ${verifiedScore}`);
  }

  console.log(
    `[blockchain] Submitting verified score: entryId=${entryId} score=${verifiedScore} proof=${proofHash}`
  );

  const tx = await contract.submitVerifiedScore(
    BigInt(entryId),
    BigInt(verifiedScore),
    proofHash || ""
  );

  console.log(`[blockchain] Tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `[blockchain] Tx confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed}`
  );

  // Parse ScoreVerified event from receipt
  let isWinner = false;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (parsed && parsed.name === "ScoreVerified") {
        isWinner = parsed.args.isWinner;
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    isWinner,
    verifiedScore,
    entryId: entryId.toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  CONTRACT_ADDRESS,
  getCurrentRound,
  getEntry,
  getEntryIdForParticipant,
  getAgentAddress,
  isAgentTrusted,
  submitVerifiedScore,
};
