/** Configure an existing version 2 contest. Read-only unless --apply is passed. */
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ethers } = require("ethers");
const { abi } = require("./game-artifact.json");

async function main() {
  const address = process.env.GAME_CONTRACT_ADDRESS;
  if (!ethers.isAddress(address)) throw new Error("Set GAME_CONTRACT_ADDRESS to the deployed version 2 contract");
  const chainId = Number(process.env.CHAIN_ID || 11155111);
  if (![11155111, 31337].includes(chainId)) throw new Error("Only Sepolia and local Hardhat are supported");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  try {
    if (Number((await provider.getNetwork()).chainId) !== chainId) throw new Error("RPC chain does not match CHAIN_ID");
    const contract = new ethers.Contract(address, abi, provider);
    if (await contract.VERSION() !== 2n) throw new Error("Configure a version 2 deployment");
    const agent = process.env.AGENT_ADDRESS || (process.env.AGENT_PRIVATE_KEY ? new ethers.Wallet(process.env.AGENT_PRIVATE_KEY).address : "");
    if (!ethers.isAddress(agent) || agent === ethers.ZeroAddress) throw new Error("Set the evaluator's AGENT_ADDRESS or AGENT_PRIVATE_KEY");
    const stake = ethers.parseEther(process.env.ROUND_STAKE_ETH || "0.001");
    const tolerance = Number(process.env.ROUND_TOLERANCE || 10);
    const duration = Number(process.env.ROUND_DURATION_SECONDS || 86400);
    const buffer = Number(process.env.ROUND_JUDGING_SECONDS || 7200);
    if (stake < ethers.parseEther("0.001") || stake > ethers.parseEther("10")) throw new Error("Stake must be 0.001–10 ETH");
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 20) throw new Error("Tolerance must be 0–20 on the contract scale");
    if (![duration, buffer].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Round durations must be positive whole seconds");
    const owner = await contract.owner();
    const roundId = await contract.currentRoundId();
    const round = roundId ? await contract.getRound(roundId) : null;
    const now = (await provider.getBlock("latest")).timestamp;
    const open = round && now < Number(round.endTime);
    const trusted = await contract.trustedAgents(agent);
    const createRound = process.env.CREATE_ROUND === "true" && !open;
    console.log(JSON.stringify({ chainId, contractAddress: address, owner, agent, trusted, currentRound: roundId.toString(),
      open: !!open, actions: { trustAgent: !trusted, createRound: !!createRound },
      roundParameters: { stakeEth: ethers.formatEther(stake), tolerance, duration, buffer } }, null, 2));
    if (!process.argv.includes("--apply")) {
      console.log("Read-only check complete. Add --apply to sign the listed owner actions.");
      return;
    }
    if (!process.env.OWNER_PRIVATE_KEY) throw new Error("Set OWNER_PRIVATE_KEY locally to sign owner actions");
    const signer = new ethers.NonceManager(new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider));
    if ((await signer.getAddress()).toLowerCase() !== owner.toLowerCase()) throw new Error("The signing wallet is not the contract owner");
    const writer = contract.connect(signer);
    if (!trusted) {
      await writer.setTrustedAgent.staticCall(agent, true);
      const transaction = await writer.setTrustedAgent(agent, true);
      console.log("Trust evaluator transaction: " + transaction.hash);
      await transaction.wait();
    }
    if (createRound) {
      await writer.createRound.staticCall(stake, tolerance, duration, buffer);
      const transaction = await writer.createRound(stake, tolerance, duration, buffer);
      console.log("Create round transaction: " + transaction.hash);
      await transaction.wait();
    }
    if (open) console.log("The current submission window is still open.");
  } finally { provider.destroy(); }
}
main().catch((error) => { console.error(error.shortMessage || error.message); process.exitCode = 1; });
