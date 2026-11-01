require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { listCachedGraphs, loadCachedGraph, runPipeline } = require("./githubPipeline");
const blockchain = require("./blockchain");

const app = express();
const PORT = process.env.PORT || 4000;
const SCORING_API_URL = (process.env.SCORING_API_URL || "http://localhost:8000").replace(/\/+$/, "");
const evaluationsInProgress = new Set();

const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "64kb" }));

// GET /api/graphs — list all cached graphs
app.get("/api/graphs", (req, res) => {
  try {
    const graphs = listCachedGraphs();
    res.json({ graphs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/:repoId — return full graph data for visualization
app.get("/api/graph/:repoId", (req, res) => {
  try {
    const data = loadCachedGraph(req.params.repoId);
    if (!data) return res.status(404).json({ error: "Graph not found. Run the pipeline first." });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analyze — trigger pipeline for a new repo URL
app.post("/api/analyze", async (req, res) => {
  const { githubUrl } = req.body;
  if (!githubUrl) return res.status(400).json({ error: "githubUrl is required" });
  try {
    const result = await runPipeline(githubUrl);
    res.json({ status: "done", repoId: result.repoId, stats: result.stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKCHAIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/blockchain/round — get current active round info
app.get("/api/blockchain/round", async (req, res) => {
  try {
    const round = await blockchain.getCurrentRound();
    if (!round) return res.json({ round: null, message: "No active round" });
    res.json({ round });
  } catch (err) {
    console.error("[blockchain] Error fetching round:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blockchain/entry/:entryId — get entry details
app.get("/api/blockchain/entry/:entryId", async (req, res) => {
  try {
    const entry = await blockchain.getEntry(req.params.entryId);
    res.json({ entry });
  } catch (err) {
    console.error("[blockchain] Error fetching entry:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blockchain/entry-for/:roundId/:address — get entry ID for a participant
app.get("/api/blockchain/entry-for/:roundId/:address", async (req, res) => {
  try {
    const entryId = await blockchain.getEntryIdForParticipant(
      req.params.roundId,
      req.params.address
    );
    res.json({ entryId });
  } catch (err) {
    console.error("[blockchain] Error fetching entry ID:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Evaluate the immutable links and self-score stored in the entry itself.
// The browser cannot choose an arbitrary score for the trusted server wallet.
app.post("/api/blockchain/evaluate-entry", async (req, res) => {
  const { entryId } = req.body || {};
  if (typeof entryId !== "string" || !/^\d{1,78}$/.test(entryId) || BigInt(entryId) === 0n) {
    return res.status(400).json({ error: "A positive integer entryId is required" });
  }
  if (evaluationsInProgress.has(entryId)) {
    return res.status(409).json({ error: "This entry is already being evaluated" });
  }

  evaluationsInProgress.add(entryId);
  try {
    const entry = await blockchain.getEntry(entryId);
    if (!entry || /^0x0{40}$/i.test(entry.participant)) {
      return res.status(404).json({ error: "Entry was not found on Sepolia" });
    }
    if (entry.scored) {
      return res.status(409).json({ error: "This entry already has a verified score" });
    }

    const hostedUrl = entry.websiteUrl && entry.websiteUrl !== entry.githubUrl
      ? entry.websiteUrl
      : null;
    const scoringResponse = await fetch(`${SCORING_API_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        github_url: entry.githubUrl,
        hosted_url: hostedUrl,
        self_score: entry.selfScore / 10,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const responseText = await scoringResponse.text();
    if (!scoringResponse.ok) {
      return res.status(502).json({
        error: `Scoring service returned ${scoringResponse.status}: ${responseText.slice(0, 500)}`,
      });
    }

    let scoreResult;
    try {
      scoreResult = JSON.parse(responseText);
    } catch {
      return res.status(502).json({ error: "Scoring service returned invalid JSON" });
    }
    const aiScore = Number(scoreResult.ai_score);
    if (!Number.isFinite(aiScore) || aiScore < 0 || aiScore > 10) {
      return res.status(502).json({ error: "Scoring service returned an invalid score" });
    }

    const verifiedScore = Math.round(aiScore * 10);
    const chainResult = await blockchain.submitVerifiedScore(
      entryId,
      verifiedScore,
      `score-${verifiedScore}-${Date.now()}`
    );
    res.json({
      ...scoreResult,
      chain: {
        entryId: entryId.toString(),
        roundId: entry.roundId,
        claimableAfter: entry.judgingDeadline,
        scoreTxHash: chainResult.txHash,
        isWinnerOnChain: chainResult.isWinner,
        claimTxHash: null,
      },
    });
  } catch (err) {
    console.error(`[blockchain] Failed to evaluate entry ${entryId}:`, err.message);
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    res.status(timedOut ? 504 : 502).json({ error: err.message || "Entry evaluation failed" });
  } finally {
    evaluationsInProgress.delete(entryId);
  }
});

// GET /api/blockchain/agent-info — check server agent wallet status
app.get("/api/blockchain/agent-info", async (req, res) => {
  try {
    const address = await blockchain.getAgentAddress();
    const trusted = await blockchain.isAgentTrusted();
    res.json({ address, trusted });
  } catch (err) {
    console.error("[blockchain] Error checking agent:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`\n🚀 Graphify API running at http://localhost:${PORT}`);
  console.log(`   GET  /api/graphs`);
  console.log(`   GET  /api/graph/:repoId`);
  console.log(`   POST /api/analyze          { "githubUrl": "..." }`);
  console.log(`   GET  /api/blockchain/round`);
  console.log(`   GET  /api/blockchain/entry/:entryId`);
  console.log(`   POST /api/blockchain/evaluate-entry  { entryId }`);
  console.log(`   GET  /api/blockchain/agent-info\n`);
});
