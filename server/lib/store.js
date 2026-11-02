const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { AppError } = require("./errors");

function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

class FileStore {
  constructor(directory) {
    this.directory = path.resolve(directory);
    for (const name of ["jobs", "reports"]) {
      fs.mkdirSync(path.join(this.directory, name), { recursive: true, mode: 0o700 });
    }
  }

  file(category, id) {
    if (!["jobs", "reports"].includes(category) || !/^[a-zA-Z0-9_-]{1,180}$/.test(id)) {
      throw new AppError(400, "INVALID_STORAGE_ID", "Invalid record identifier");
    }
    return path.join(this.directory, category, id + ".json");
  }

  getJob(id) {
    const file = this.file("jobs", id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  saveJob(job) {
    const file = this.file("jobs", job.id);
    const temporary = file + "." + crypto.randomUUID() + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(job, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, file);
    return job;
  }

  listJobs() {
    return fs.readdirSync(path.join(this.directory, "jobs"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => this.getJob(file.slice(0, -5)));
  }

  saveReport(report) {
    const json = canonicalJson(report);
    const hash = crypto.createHash("sha256").update(json).digest("hex");
    const file = this.file("reports", hash);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, json + "\n", { flag: "wx", mode: 0o600 });
    }
    return hash;
  }

  getReport(hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new AppError(400, "INVALID_REPORT", "Invalid report digest");
    const file = this.file("reports", hash);
    if (!fs.existsSync(file)) return null;
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const actual = crypto.createHash("sha256").update(canonicalJson(report)).digest("hex");
    if (actual !== hash) throw new AppError(500, "REPORT_INTEGRITY", "Stored report failed its integrity check");
    return report;
  }
}

module.exports = { FileStore, canonicalJson };
