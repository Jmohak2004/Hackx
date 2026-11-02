const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
const { exportContract } = require("./export-contract.cjs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signing wallet configured. Set OWNER_PRIVATE_KEY for Sepolia.");
  const { chainId } = await hre.ethers.provider.getNetwork();
  if (![31337n, 11155111n].includes(chainId)) throw new Error("Deployment is restricted to local Hardhat or Sepolia.");
  const owner = process.env.CONTRACT_OWNER || deployer.address;
  if (!hre.ethers.isAddress(owner) || owner === hre.ethers.ZeroAddress) throw new Error("Invalid contract owner");
  let agentAddress = process.env.AGENT_ADDRESS;
  if (!agentAddress && process.env.AGENT_PRIVATE_KEY) {
    agentAddress = new hre.ethers.Wallet(process.env.AGENT_PRIVATE_KEY).address;
  }
  agentAddress ||= deployer.address;
  if (!hre.ethers.isAddress(agentAddress) || agentAddress === hre.ethers.ZeroAddress) throw new Error("Invalid evaluator address");
  const stake = hre.ethers.parseEther(process.env.ROUND_STAKE_ETH || "0.001");
  const tolerance = Number(process.env.ROUND_TOLERANCE || 10);
  const duration = Number(process.env.ROUND_DURATION_SECONDS || 3600);
  const judging = Number(process.env.ROUND_JUDGING_SECONDS || 600);
  if (stake < hre.ethers.parseEther("0.001") || stake > hre.ethers.parseEther("10")) throw new Error("Stake must be 0.001–10 ETH");
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 20) throw new Error("Tolerance must be an integer from 0–20");
  if (![duration, judging].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Round durations must be positive whole seconds");
  const game = await hre.ethers.deployContract("LatentStyleGame", [owner], { gasLimit: 8_000_000 });
  await game.waitForDeployment();
  const receipt = await game.deploymentTransaction().wait();
  if (owner.toLowerCase() === deployer.address.toLowerCase()) {
    if (!(await game.trustedAgents(agentAddress))) {
      await (await game.setTrustedAgent(agentAddress, true)).wait();
    }
    const createRound = process.env.CREATE_ROUND === "true" || chainId === 31337n;
    if (createRound) {
      await (await game.createRound(
        stake, tolerance, duration, judging
      )).wait();
    }
  }
  const deployment = {
    version: Number(await game.VERSION()),
    chainId: Number(chainId),
    address: await game.getAddress(),
    owner,
    agentAddress,
    deploymentTxHash: receipt.hash,
    deploymentBlock: receipt.blockNumber,
    createdAt: new Date().toISOString(),
    roundId: (await game.currentRoundId()).toString(),
  };
  const directory = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, chainId.toString() + ".json"), JSON.stringify(deployment, null, 2) + "\n");
  exportContract();
  console.log(JSON.stringify(deployment, null, 2));
  console.log("Use the same address and RPC URL in client and server environments.");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
