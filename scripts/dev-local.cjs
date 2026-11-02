const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { HDNodeWallet } = require("ethers");
const { randomBytes } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const ports = {
  rpc: Number(process.env.LOCAL_RPC_PORT || 8545),
  api: Number(process.env.LOCAL_API_PORT || 4000),
  scorer: Number(process.env.LOCAL_SCORER_PORT || 8000),
  client: Number(process.env.LOCAL_CLIENT_PORT || 3000),
};
const urls = Object.fromEntries(Object.entries(ports).map(([name, port]) => [name, "http://127.0.0.1:" + port]));
const children = [];
const recordPath = path.join(root, ".local", "dev-stack.json");
let stopping = false;

function saveProcesses() {
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  const temporary = recordPath + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify({
    root, managerPid: process.pid, ports,
    children: children.filter((child) => child.pid).map((child) => ({
      pid: child.pid, name: child.hackxName, cwd: child.hackxCwd, args: child.spawnargs.slice(1),
    })),
  }, null, 2));
  fs.renameSync(temporary, recordPath);
}

async function available(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Local ports must be integers from 1024 to 65535");
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error("Port " + port + " is occupied. Choose another LOCAL_*_PORT value.")));
    server.listen(port, () => server.close(resolve));
  });
}

function launch(name, command, args, directory, env, persistent = true) {
  const child = spawn(command, args, {
    cwd: directory, env: { ...process.env, ...env },
    stdio: ["ignore", name === "chain" ? "ignore" : "inherit", "inherit"],
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.hackxName = name;
  child.hackxCwd = directory;
  saveProcesses();
  child.once("error", (error) => { console.error(name + ": " + error.message); shutdown(1); });
  if (persistent) child.once("exit", (code) => {
    if (!stopping) { console.error(name + " exited (" + code + ")"); shutdown(1); }
  });
  return child;
}

async function waitFor(url, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (!stopping && Date.now() < end) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* dependency is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Service did not become ready: " + url);
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch { /* already exited */ }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try { process.platform !== "win32" ? process.kill(-child.pid, "SIGKILL") : child.kill("SIGKILL"); } catch {}
    }
  }, 3000);
  timer.unref();
  process.exitCode = code;
}
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

async function main() {
  if (new Set(Object.values(ports)).size !== 4) throw new Error("Each local service needs a distinct port");
  await Promise.all(Object.values(ports).map(available));
  const python = path.join(root, "server/computer-use/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (!fs.existsSync(python)) throw new Error("Set up the Python virtual environment first; see README.md");
  const hardhat = path.join(root, "node_modules/hardhat/internal/cli/cli.js");
  const next = path.join(root, "client/node_modules/next/dist/bin/next");
  if (![hardhat, next, path.join(root, "server/node_modules/express")].every(fs.existsSync)) {
    throw new Error("Install root, server and client Node dependencies first");
  }
  // This is Hardhat's public development mnemonic. Local mode never uses an
  // owner/agent key from the user's environment and never connects to Sepolia.
  const localWallet = HDNodeWallet.fromPhrase("test test test test test test test test test test test junk");
  const localEnv = {
    LOCAL_RPC_URL: urls.rpc, CHAIN_ID: "31337", RPC_URL: urls.rpc, SEPOLIA_RPC_URL: urls.rpc,
    OWNER_PRIVATE_KEY: localWallet.privateKey, AGENT_PRIVATE_KEY: localWallet.privateKey,
    AGENT_ADDRESS: localWallet.address, CONTRACT_OWNER: localWallet.address, CREATE_ROUND: "true",
  };
  launch("chain", process.execPath, [hardhat, "node", "--hostname", "127.0.0.1", "--port", String(ports.rpc)], root, localEnv);
  // Hardhat responds to HTTP JSON-RPC POST, so use a read-only RPC probe.
  const rpcDeadline = Date.now() + 60_000;
  while (true) {
    try {
      const response = await fetch(urls.rpc, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1000),
      });
      const result = await response.json();
      if (Number(BigInt(result.result)) !== 31337) throw new Error("Local RPC must be Hardhat chain 31337");
      break;
    } catch (error) {
      if (Date.now() > rpcDeadline || stopping) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  const deployment = launch("deployment", process.execPath,
    [hardhat, "run", "scripts/deploy.cjs", "--network", "localhost"], root, localEnv, false);
  await new Promise((resolve, reject) => deployment.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Local contract deployment failed"))));
  const deployed = JSON.parse(fs.readFileSync(path.join(root, "deployments/31337.json"), "utf8"));
  const runDirectory = path.join(root, ".local", String(Date.now()));
  fs.mkdirSync(runDirectory, { recursive: true });
  const env = {
    ...localEnv, GAME_CONTRACT_ADDRESS: deployed.address,
    DATA_DIR: path.join(runDirectory, "data"), HOST: "127.0.0.1", PORT: String(ports.api),
    GRAPHIFY_API_URL: urls.api, SCORING_API_URL: urls.scorer, NEO4J_URI: "",
    CORS_ALLOW_ORIGINS: urls.client + ",http://localhost:" + ports.client,
    ALLOW_PRIVATE_TARGETS: "true",
    SCORING_API_TOKEN: randomBytes(24).toString("hex"),
    GRAPHIFY_INTERNAL_TOKEN: randomBytes(24).toString("hex"),
    TRUST_PROXY_HOPS: "1",
  };
  launch("API", process.execPath, [path.join(root, "server/index.js")], path.join(root, "server"), env);
  launch("scorer", python, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(ports.scorer)],
    path.join(root, "server/computer-use"), env);
  await waitFor(urls.api + "/ready");
  launch("client", process.execPath, [next, "dev", "--hostname", "127.0.0.1", "--port", String(ports.client)],
    path.join(root, "client"), {
      ...env, SERVER_API_URL: urls.api, NEXT_PUBLIC_SERVER_URL: "/api/backend",
      NEXT_PUBLIC_GAME_CONTRACT_ADDRESS: deployed.address,
      NEXT_PUBLIC_CHAIN_ID: "31337", NEXT_PUBLIC_RPC_URL: urls.rpc,
      NEXT_PUBLIC_LOCAL_RUN_ID: path.basename(runDirectory),
    });
  console.log("\nHackX local stack: " + urls.client);
  console.log("Local contract: " + deployed.address);
  console.log("Use a Hardhat development account for local wallet transactions.");
}

main().catch((error) => { console.error(error.message); shutdown(1); });
