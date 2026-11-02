const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const recordPath = path.join(root, ".local/dev-stack.json");

function belongsToStack(record) {
  try {
    const command = execFileSync("ps", ["-p", String(record.pid), "-o", "command="], { encoding: "utf8" }).trim();
    if (command.includes(root)) return true;
    if (record.name !== "scorer" || !command.includes("-m uvicorn main:app")) return false;
    const cwd = process.platform === "linux"
      ? fs.readlinkSync("/proc/" + record.pid + "/cwd")
      : execFileSync("lsof", ["-a", "-p", String(record.pid), "-d", "cwd", "-Fn"], { encoding: "utf8" })
        .split("\n").find((line) => line.startsWith("n"))?.slice(1);
    return cwd === path.join(root, "server/computer-use");
  } catch { return false; }
}

async function main() {
  if (!fs.existsSync(recordPath)) { console.log("No recorded HackX local stack."); return; }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  if (record.root !== root || !Array.isArray(record.children)) throw new Error("Invalid local process record");
  const owned = record.children.filter((child) => Number.isInteger(child.pid) && belongsToStack(child));
  for (const child of owned.reverse()) {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else process.kill(child.pid, "SIGTERM");
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const child of owned) {
    if (!belongsToStack(child)) continue;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
      else process.kill(child.pid, "SIGKILL");
    } catch {}
  }
  fs.rmSync(recordPath, { force: true });
  console.log("Stopped " + owned.length + " recorded HackX processes.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
