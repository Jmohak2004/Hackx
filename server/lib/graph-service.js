const path = require("node:path");
const { fork } = require("node:child_process");
const graph = require("../githubPipeline");
const { AppError, githubUrl } = require("./errors");

const active = new Map();
function runPipeline(value) {
  const url = githubUrl(value);
  if (active.has(url)) return active.get(url);
  if (active.size >= 2) throw new AppError(503, "ANALYSIS_BUSY", "Repository analysis is busy; retry shortly");
  const task = new Promise((resolve, reject) => {
    const env = { ...process.env, HACKX_GRAPH_WORKER: "true" };
    for (const key of Object.keys(env)) {
      if (/PRIVATE_KEY|SCORING_API_TOKEN|GRAPHIFY_INTERNAL_TOKEN|RPC_URL|DATA_DIR/.test(key)) delete env[key];
    }
    const child = fork(path.resolve(__dirname, "../workers/graph.js"), [], {
      env, execArgv: ["--max-old-space-size=384"], stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let settled = false;
    const complete = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.connected) child.disconnect();
      if (error) { child.kill("SIGKILL"); reject(error); } else resolve(result);
    };
    const timer = setTimeout(() => complete(new AppError(504, "ANALYSIS_TIMEOUT", "Repository analysis exceeded its time limit")), 180_000);
    child.on("message", (message) => {
      if (message.error) complete(new AppError(message.error.status || 502, message.error.code || "ANALYSIS_FAILED", message.error.message));
      else complete(null, message.result);
    });
    child.once("error", () => complete(new AppError(502, "WORKER_UNAVAILABLE", "Repository analysis worker could not start")));
    child.once("exit", () => {
      if (!settled) complete(new AppError(502, "WORKER_EXITED", "Repository analysis worker exited before completion"));
    });
    child.send({ githubUrl: url });
  }).finally(() => active.delete(url));
  active.set(url, task);
  return task;
}

module.exports = { ...graph, runPipeline };
