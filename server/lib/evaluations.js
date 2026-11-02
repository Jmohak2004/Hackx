const path = require("node:path");
const { FileStore } = require("./store");
const { AppError, uintId } = require("./errors");

const ACTIVE = new Set(["queued", "validating", "evaluating", "submitting", "confirming"]);

class EvaluationService {
  constructor({ blockchain, store, fetchImpl = fetch, scoringUrl, concurrency = 2 }) {
    this.blockchain = blockchain;
    this.store = store || new FileStore(process.env.DATA_DIR || path.resolve(__dirname, "../data"));
    this.fetch = fetchImpl;
    this.scoringUrl = (scoringUrl || process.env.SCORING_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    this.concurrency = Math.max(1, Math.min(4, Number(concurrency) || 2));
    this.queue = [];
    this.active = new Set();
    this.stopped = false;
    this.scope = blockchain.CHAIN_ID + "-" + blockchain.CONTRACT_ADDRESS.toLowerCase();
  }

  id(entryId) { return this.scope + "-" + uintId(entryId); }

  get(entryId) { return this.store.getJob(this.id(entryId)); }

  update(id, changes, log) {
    const job = this.store.getJob(id);
    if (!job) throw new Error("Evaluation record disappeared");
    const logs = [...(job.logs || [])];
    if (log) logs.push(log);
    return this.store.saveJob({
      ...job, ...changes, logs: logs.slice(-100), updatedAt: new Date().toISOString(),
    });
  }

  start(entryId, retry = false) {
    entryId = uintId(entryId);
    const id = this.id(entryId);
    const previous = this.store.getJob(id);
    if (previous && (previous.status === "succeeded" || ACTIVE.has(previous.status))) return previous;
    if (previous && !retry) return previous;
    if (previous && previous.attempts >= 5) {
      throw new AppError(429, "RETRY_LIMIT", "This entry reached the evaluation retry limit");
    }
    const now = new Date().toISOString();
    const job = this.store.saveJob({
      ...previous, id, entryId, chainId: this.blockchain.CHAIN_ID,
      contractAddress: this.blockchain.CONTRACT_ADDRESS,
      status: "queued", attempts: (previous?.attempts || 0) + 1,
      createdAt: previous?.createdAt || now, updatedAt: now,
      error: null, logs: [...(previous?.logs || []), "[Pipeline] Evaluation queued"],
    });
    this.enqueue(id);
    return job;
  }

  enqueue(id) {
    if (!this.queue.includes(id) && !this.active.has(id)) this.queue.push(id);
    queueMicrotask(() => this.drain());
  }

  resume() {
    for (const job of this.store.listJobs()) {
      if (job.id.startsWith(this.scope + "-") && ACTIVE.has(job.status)) this.enqueue(job.id);
    }
  }

  drain() {
    while (!this.stopped && this.active.size < this.concurrency && this.queue.length) {
      const id = this.queue.shift();
      this.active.add(id);
      this.run(id).catch((error) => {
        const message = error instanceof AppError ? error.message :
          error.shortMessage || "Evaluation failed because a required service was unavailable";
        this.update(id, {
          status: "failed",
          error: { code: error instanceof AppError ? error.code : "EVALUATION_FAILED", message },
        }, "[Error] " + message);
      }).finally(() => { this.active.delete(id); this.drain(); });
    }
  }

  resultFromEntry(entry, result, txHash = null) {
    return {
      ...result,
      user_score: entry.selfScore / 10,
      ai_score: entry.verifiedScore / 10,
      honest: entry.isWinner,
      user_wins: entry.isWinner,
      chain: {
        entryId: entry.id, roundId: entry.roundId, participant: entry.participant,
        chainId: this.blockchain.CHAIN_ID, contractAddress: this.blockchain.CONTRACT_ADDRESS,
        proofHash: entry.proofIpfsHash, scoreTxHash: txHash,
        isWinnerOnChain: entry.isWinner, claimed: entry.claimed,
        claimTxHash: null, contractVersion: entry.contractVersion,
      },
    };
  }

  recoverResult(entry, txHash) {
    const hash = /^sha256:([a-f0-9]{64})$/.exec(entry.proofIpfsHash)?.[1];
    let report = hash ? this.store.getReport(hash) : null;
    if (report && (report.entryId !== entry.id || report.chainId !== this.blockchain.CHAIN_ID ||
        report.contractAddress.toLowerCase() !== this.blockchain.CONTRACT_ADDRESS.toLowerCase())) {
      report = null;
    }
    const fallback = {
      github_url: entry.githubUrl, hosted_url: entry.websiteUrl,
      page_title: "", github_score: null, avg_score: entry.verifiedScore / 10,
      breakdown: {}, lighthouse: {}, errors: [], logs: [],
      delta: Math.abs(entry.selfScore - entry.verifiedScore) / 10,
      summary: "Verified score recovered from the contract. The original analysis report is unavailable.",
    };
    return this.resultFromEntry(entry, report?.result || fallback, txHash);
  }

  async run(id) {
    let job = this.update(id, { status: "validating", error: null }, "[Chain] Loading the recorded submission");
    let entry = await this.blockchain.getEntry(job.entryId);
    if (entry.scored) {
      this.update(id, { status: "succeeded", result: this.recoverResult(entry, job.scoreTxHash) },
        "[Chain] Existing verified score recovered");
      return;
    }
    if (job.scoreTxHash) {
      this.update(id, { status: "confirming" }, "[Chain] Resuming transaction confirmation");
      await this.blockchain.waitForScoreTransaction(job.scoreTxHash);
      entry = await this.blockchain.getEntry(job.entryId);
      if (!entry.scored) throw new AppError(502, "MISSING_SCORE", "Confirmed transaction did not verify the entry");
      this.update(id, { status: "succeeded", result: this.recoverResult(entry, job.scoreTxHash) });
      return;
    }
    if (entry.claimed) throw new AppError(409, "ENTRY_REFUNDED", "This entry has already been refunded");
    const round = await this.blockchain.getRound(entry.roundId);
    if (round.chainTimestamp > round.judgingDeadline) {
      throw new AppError(409, "SCORING_CLOSED", "The judging deadline passed. Check the entry's refund eligibility.");
    }
    const readiness = await this.blockchain.getReadiness();
    if (!readiness.ready) throw new AppError(503, "AGENT_NOT_READY", readiness.reason);

    // A report saved before a failed broadcast can be reused without evaluating
    // mutable remote URLs again. It remains bound to this exact chain entry.
    let report = job.reportHash ? this.store.getReport(job.reportHash) : null;
    if (!report) {
      this.update(id, { status: "evaluating" }, "[Pipeline] Auditing the submitted repository and deployment");
      const response = await this.fetch(this.scoringUrl + "/score", {
        method: "POST", headers: {
          "Content-Type": "application/json",
          ...(process.env.SCORING_API_TOKEN ? { Authorization: "Bearer " + process.env.SCORING_API_TOKEN } : {}),
        },
        body: JSON.stringify({
          github_url: entry.githubUrl,
          hosted_url: entry.websiteUrl && entry.websiteUrl !== entry.githubUrl ? entry.websiteUrl : null,
          self_score: entry.selfScore / 10,
          strict: true,
        }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 800);
        throw new AppError(502, "SCORER_FAILED", "Scoring service failed: " + detail);
      }
      const result = await response.json();
      if (typeof result.ai_score !== "number" || !Number.isFinite(result.ai_score) ||
          result.ai_score < 0 || result.ai_score > 10) {
        throw new AppError(502, "INVALID_SCORE", "Scoring service returned an invalid score");
      }
      if (result.degraded === true) {
        throw new AppError(502, "INCOMPLETE_EVALUATION", "A required evaluation pipeline did not complete");
      }
      // Do not accept any signing/claim fields from the external scoring service.
      delete result.chain;
      report = {
        schemaVersion: 1, rubricVersion: result.rubric_version || "hackx-deterministic-v1",
        evaluatedAt: new Date().toISOString(),
        chainId: this.blockchain.CHAIN_ID, contractAddress: this.blockchain.CONTRACT_ADDRESS,
        entryId: job.entryId, participant: entry.participant,
        githubUrl: entry.githubUrl, websiteUrl: entry.websiteUrl, selfScore: entry.selfScore,
        verifiedScore: Math.round(result.ai_score * 10), result,
      };
      const reportHash = this.store.saveReport(report);
      job = this.update(id, { reportHash, result }, "[Report] Evaluation evidence saved");
    }
    this.update(id, { status: "submitting" }, "[Chain] Submitting the report digest and verified score");
    const transaction = await this.blockchain.submitVerifiedScore(
      job.entryId, report.verifiedScore, "sha256:" + job.reportHash,
      async (hash) => this.update(id, { status: "confirming", scoreTxHash: hash }, "[Chain] Waiting for confirmation")
    );
    entry = await this.blockchain.getEntry(job.entryId);
    if (!entry.scored) throw new AppError(502, "MISSING_SCORE", "The entry is not verified after confirmation");
    this.update(id, {
      status: "succeeded", scoreTxHash: transaction.txHash,
      result: this.resultFromEntry(entry, report.result, transaction.txHash),
    }, "[Result] Score verified on-chain");
  }

  async wait(entryId, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = this.get(entryId);
      if (!job) throw new AppError(404, "JOB_NOT_FOUND", "Evaluation was not found");
      if (job.status === "succeeded") return job.result;
      if (job.status === "failed") throw new AppError(502, job.error.code, job.error.message);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new AppError(504, "EVALUATION_PENDING", "Evaluation is still running; reopen this entry to resume.");
  }

  stop() { this.stopped = true; }
}

module.exports = { EvaluationService, ACTIVE };
