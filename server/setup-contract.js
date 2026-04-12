/**
 * One-time setup script — run from the contract OWNER wallet.
 *
 * 1. Registers the server agent wallet as a trustedAgent
 * 2. Creates a game round with configurable parameters
 *
 * Usage:
 *   OWNER_PRIVATE_KEY=0x... node setup-contract.js
 */

require("dotenv").config();
const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x13a8638041b2825937756e19b775536c0150f429";
const AGENT_ADDRESS = "0x65Fa1E64D9308435dF1E190176259d3BC74CFCEF";

const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/TLt86pNqz_12PUesDDjQG";

const ABI = [
  "function setTrustedAgent(address agent, bool trusted)",
  "function createRound(uint256 stakeAmount, uint256 scoreTolerance, uint256 durationSecs, uint256 judgingBuffer)",
  "function trustedAgents(address) view returns (bool)",
  "function currentRoundId() view returns (uint256)",
  "function owner() view returns (address)",
  "event RoundCreated(uint256 indexed roundId, uint256 stakeAmount, uint256 tolerance, uint256 endTime)",
  "event AgentUpdated(address indexed agent, bool trusted)",
];

// ── Round config ───────────���───────────────────────��──────────────────────
const STAKE_AMOUNT = ethers.parseEther("0.001"); // 0.001 ETH per entry
const SCORE_TOLERANCE = 10;                      // ±10 on 0-100 scale = ±1 on 1-10 scale
const DURATION_SECS = 7 * 24 * 60 * 60;         // 7 days submission window
const JUDGING_BUFFER = 2 * 24 * 60 * 60;         // 2 days for agent to judge

async function main() {
  const ownerPK = process.env.OWNER_PRIVATE_KEY;
  if (!ownerPK) {
    console.error("Set OWNER_PRIVATE_KEY env var (the wallet that deployed the contract)");
    console.error("  OWNER_PRIVATE_KEY=0x... node setup-contract.js");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const ownerWallet = new ethers.Wallet(ownerPK, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, ownerWallet);

  console.log(`Owner wallet:  ${ownerWallet.address}`);
  console.log(`Contract:      ${CONTRACT_ADDRESS}`);
  console.log(`Agent to trust: ${AGENT_ADDRESS}\n`);

  // Verify ownership
  const contractOwner = await contract.owner();
  if (contractOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
    console.error(`ERROR: Connected wallet ${ownerWallet.address} is not the contract owner (${contractOwner})`);
    process.exit(1);
  }

  // ── Step 1: Register trusted agent ──────────────────────────────────────
  const alreadyTrusted = await contract.trustedAgents(AGENT_ADDRESS);
  if (alreadyTrusted) {
    console.log("[1/2] Agent already trusted. Skipping.");
  } else {
    console.log("[1/2] Registering agent as trusted...");
    const tx1 = await contract.setTrustedAgent(AGENT_ADDRESS, true);
    console.log(`      tx: ${tx1.hash}`);
    await tx1.wait();
    console.log("      Confirmed.");
  }

  // ── Step 2: Create game round ───────────────────────────────────────────
  const currentRound = await contract.currentRoundId();
  console.log(`\n[2/2] Current round ID: ${currentRound}`);
  console.log(`      Creating new round...`);
  console.log(`      Stake:     ${ethers.formatEther(STAKE_AMOUNT)} ETH`);
  console.log(`      Tolerance: ±${SCORE_TOLERANCE} (on 0-100 scale)`);
  console.log(`      Duration:  ${DURATION_SECS / 86400} days`);
  console.log(`      Judging:   ${JUDGING_BUFFER / 86400} days buffer`);

  const tx2 = await contract.createRound(
    STAKE_AMOUNT,
    SCORE_TOLERANCE,
    DURATION_SECS,
    JUDGING_BUFFER
  );
  console.log(`      tx: ${tx2.hash}`);
  const receipt = await tx2.wait();
  console.log(`      Confirmed in block ${receipt.blockNumber}`);

  const newRoundId = await contract.currentRoundId();
  console.log(`\n  Round #${newRoundId} is now active!`);
  console.log("  Setup complete.\n");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
