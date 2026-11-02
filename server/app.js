const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const { AppError, uintId, pageNumber, githubUrl } = require("./lib/errors");
const { EvaluationService } = require("./lib/evaluations");

const asyncRoute = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response)).catch(next);
};

function rateLimit({ limit, windowMs = 60_000 }) {
  const clients = new Map();
  return (request, response, next) => {
    const token = process.env.GRAPHIFY_INTERNAL_TOKEN;
    const supplied = request.get("x-hackx-internal-token");
    const expectedBytes = token ? Buffer.from(token) : null;
    const suppliedBytes = supplied ? Buffer.from(supplied) : null;
    if (request.path === "/api/analyze" && expectedBytes && suppliedBytes &&
        expectedBytes.length === suppliedBytes.length &&
        crypto.timingSafeEqual(expectedBytes, suppliedBytes)) return next();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const now = Date.now();
    let record = clients.get(key);
    if (!record || record.reset <= now) record = { count: 0, reset: now + windowMs };
    record.count++;
    clients.set(key, record);
    if (clients.size > 5000) {
      for (const [client, value] of clients) if (value.reset <= now) clients.delete(client);
      if (clients.size > 5000) return next(new AppError(503, "BUSY", "The service is busy. Please retry shortly."));
    }
    if (record.count > limit) {
      response.setHeader("Retry-After", String(Math.ceil((record.reset - now) / 1000)));
      return next(new AppError(429, "RATE_LIMIT", "Too many requests. Please retry shortly."));
    }
    next();
  };
}

function createApp(options = {}) {
  const blockchain = options.blockchain || require("./blockchain");
  const graph = options.graph || require("./lib/graph-service");
  const evaluations = options.evaluations || new EvaluationService({ blockchain });
  const fetchImpl = options.fetchImpl || fetch;
  const app = express();
  app.disable("x-powered-by");
  // Forwarded IP headers are not trusted by default; deployments can explicitly
  // configure their reverse proxy hop count using TRUST_PROXY_HOPS.
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(hops) && hops > 0 && hops <= 3) app.set("trust proxy", hops);
  const origins = (process.env.CORS_ALLOW_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001")
    .split(",").map((value) => value.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, done) => !origin || origins.includes(origin)
      ? done(null, true) : done(new AppError(403, "ORIGIN_NOT_ALLOWED", "This client origin is not allowed")),
  }));
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use((_, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", (_, response) => response.json({ status: "ok", service: "hackx-api", version: 2 }));
  app.get("/api/config", asyncRoute(async (_, response) => response.json({
    chainId: blockchain.CHAIN_ID, contractAddress: blockchain.CONTRACT_ADDRESS,
    contractVersion: await blockchain.getVersion(),
    explorerUrl: blockchain.CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : null,
  })));

  app.get("/ready", asyncRoute(async (_, response) => {
    let chain;
    let round = null;
    let scorer = false;
    try {
      [chain, round] = await Promise.all([blockchain.getReadiness(), blockchain.getCurrentRound()]);
    } catch {
      chain = { ready: false, reason: "The configured chain or contract is unavailable" };
    }
    try {
      const result = await fetchImpl(evaluations.scoringUrl + "/health", { signal: AbortSignal.timeout(5000) });
      scorer = result.ok && (await result.json()).status === "ok";
    } catch { /* readiness below describes the unavailable dependency */ }
    const ready = chain.ready && scorer && !!round?.isOpen;
    const reason = !chain.ready ? chain.reason : !scorer ? "The evaluation service is unavailable"
      : !round?.isOpen ? "There is no open submission round" : "";
    response.status(ready ? 200 : 503).json({ ready, reason, chain, scorer, round });
  }));

  app.get("/api/graphs", (_, response, next) => {
    try { response.json({ graphs: graph.listCachedGraphs() }); } catch (error) { next(error); }
  });
  app.get("/api/graph/:repoId", (request, response, next) => {
    try {
      const id = request.params.repoId;
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError(400, "INVALID_GRAPH_ID", "Invalid graph identifier");
      const data = graph.loadCachedGraph(id);
      if (!data) throw new AppError(404, "GRAPH_NOT_FOUND", "Graph was not found");
      response.json(data);
    } catch (error) { next(error); }
  });
  let analyses = 0;
  app.post("/api/analyze", rateLimit({ limit: 20, windowMs: 600_000 }), asyncRoute(async (request, response) => {
    const url = githubUrl(request.body?.githubUrl);
    if (analyses >= 2) throw new AppError(503, "ANALYSIS_BUSY", "Repository analysis is busy; retry shortly");
    analyses++;
    try {
      const result = await graph.runPipeline(url);
      response.json({ status: "done", repoId: result.repoId, stats: result.stats });
    } finally { analyses--; }
  }));

  app.post("/api/validate", rateLimit({ limit: 60 }), asyncRoute(async (request, response) => {
      const repository = githubUrl(request.body?.githubUrl);
      await graph.validateRepository(repository);
      let website = typeof request.body?.hostedUrl === "string" ? request.body.hostedUrl.trim() : "";
      if (website) {
        let url;
        try { url = new URL(website); } catch { throw new AppError(400, "INVALID_WEBSITE", "Enter a valid website URL"); }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || website.length > 2048) {
          throw new AppError(400, "INVALID_WEBSITE", "Enter a public HTTP or HTTPS website URL");
        }
        website = url.toString();
        const check = await fetchImpl(evaluations.scoringUrl + "/validate-url", {
          method: "POST", headers: {
            "Content-Type": "application/json",
            ...(process.env.SCORING_API_TOKEN ? { Authorization: "Bearer " + process.env.SCORING_API_TOKEN } : {}),
          },
          body: JSON.stringify({ url: website }), signal: AbortSignal.timeout(30_000),
        });
        const validation = await check.json();
        if (!check.ok) throw new AppError(400, "INVALID_WEBSITE", validation.detail || "The hosted website could not be validated");
      }
      response.json({ githubUrl: repository, hostedUrl: website });
  }));

  app.get("/api/blockchain/round", asyncRoute(async (_, response) => {
    const round = await blockchain.getCurrentRound();
    response.json({ round, message: round?.isOpen ? "Submissions open" : "No active round" });
  }));
  app.get("/api/blockchain/rounds", asyncRoute(async (request, response) => {
    const limit = Math.max(1, pageNumber(request.query.limit, 20, 50));
    response.json({ rounds: await blockchain.getRounds(limit) });
  }));
  app.get("/api/blockchain/round/:roundId", asyncRoute(async (request, response) => {
    response.json({ round: await blockchain.getRound(uintId(request.params.roundId, "roundId")) });
  }));
  app.get("/api/blockchain/entries", asyncRoute(async (request, response) => {
    const roundId = uintId(request.query.roundId, "roundId");
    const offset = pageNumber(request.query.offset, 0, 1_000_000);
    const limit = pageNumber(request.query.limit, 20, 100);
    if (limit === 0) throw new AppError(400, "INVALID_PAGE", "Page size must be at least one");
    const participant = request.query.participant;
    if (participant !== undefined && typeof participant !== "string") {
      throw new AppError(400, "INVALID_ADDRESS", "Invalid participant address");
    }
    response.json(await blockchain.getEntries(roundId, { offset, limit, participant }));
  }));
  app.get("/api/blockchain/entry/:entryId", asyncRoute(async (request, response) => {
    response.json(await blockchain.getEntryState(uintId(request.params.entryId)));
  }));
  app.get("/api/blockchain/leaderboard", asyncRoute(async (request, response) => {
    const roundId = uintId(request.query.roundId, "roundId");
    const offset = pageNumber(request.query.offset, 0, 1_000_000);
    const limit = pageNumber(request.query.limit, 20, 100);
    if (limit === 0) throw new AppError(400, "INVALID_PAGE", "Page size must be at least one");
    response.json(await blockchain.getLeaderboard(roundId, { offset, limit }));
  }));
  app.get("/api/blockchain/entry-for/:roundId/:address", asyncRoute(async (request, response) => {
    response.json({ entryId: await blockchain.getEntryIdForParticipant(
      uintId(request.params.roundId, "roundId"), request.params.address
    ) });
  }));
  app.get("/api/blockchain/agent-info", asyncRoute(async (_, response) => {
    response.json(await blockchain.getReadiness());
  }));

  app.post("/api/evaluations", rateLimit({ limit: 20, windowMs: 600_000 }), (request, response, next) => {
    try {
      const entryId = uintId(request.body?.entryId);
      const job = evaluations.start(entryId, request.body?.retry === true);
      response.setHeader("Location", "/api/evaluations/" + entryId);
      response.status(job.status === "succeeded" ? 200 : 202).json(job);
    } catch (error) { next(error); }
  });
  app.get("/api/evaluations/:entryId", asyncRoute(async (request, response) => {
    const entryId = uintId(request.params.entryId);
    let job = evaluations.get(entryId);
    if (!job) {
      const entry = await blockchain.getEntry(entryId);
      if (!entry.scored) throw new AppError(404, "EVALUATION_NOT_FOUND", "This entry has not been evaluated yet");
      job = { status: "succeeded", entryId, result: evaluations.recoverResult(entry), logs: [] };
    }
    if (job.status === "succeeded") {
      const entry = await blockchain.getEntry(entryId);
      job = { ...job, result: {
        ...job.result, chain: { ...job.result.chain, claimed: entry.claimed, isWinnerOnChain: entry.isWinner },
      } };
    }
    response.json(job);
  }));
  app.get("/api/reports/:digest", (request, response, next) => {
    try {
      const report = evaluations.store.getReport(request.params.digest);
      if (!report) throw new AppError(404, "REPORT_NOT_FOUND", "Evaluation report was not found");
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("ETag", '"' + request.params.digest + '"');
      response.json(report);
    } catch (error) { next(error); }
  });

  // Existing clients can finish a submission against the durable job service.
  app.post("/api/blockchain/evaluate-entry", rateLimit({ limit: 20, windowMs: 600_000 }),
    asyncRoute(async (request, response) => {
      const id = uintId(request.body?.entryId);
      evaluations.start(id, request.body?.retry === true);
      response.json(await evaluations.wait(id));
    }));

  app.use((_, __, next) => next(new AppError(404, "NOT_FOUND", "API endpoint was not found")));
  app.use((error, _, response, __) => {
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "Request body is too large", code: "BODY_TOO_LARGE" });
    }
    if (error.type === "entity.parse.failed") {
      return response.status(400).json({ error: "Request body must be valid JSON", code: "INVALID_JSON" });
    }
    const known = error instanceof AppError;
    if (!known) console.error("[api]", error.shortMessage || error.message);
    response.status(known ? error.status : 502).json({
      error: known ? error.message : "A required service could not complete the request",
      code: known ? error.code : "DEPENDENCY_ERROR",
    });
  });
  return { app, evaluations, blockchain };
}

module.exports = { createApp, rateLimit };
