require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { listCachedGraphs, loadCachedGraph, runPipeline } = require("./githubPipeline");
const blockchain = require("./blockchain");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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

// POST /api/blockchain/submit-score — submit AI verified score on-chain
// Body: { entryId, verifiedScore (0-100), proofHash }
app.post("/api/blockchain/submit-score", async (req, res) => {
  const { entryId, verifiedScore, proofHash } = req.body;

  if (entryId === undefined || verifiedScore === undefined) {
    return res.status(400).json({ error: "entryId and verifiedScore are required" });
  }
  if (verifiedScore < 0 || verifiedScore > 100) {
    return res.status(400).json({ error: "verifiedScore must be 0-100" });
  }

  try {
    const result = await blockchain.submitVerifiedScore(
      entryId,
      Math.round(verifiedScore),
      proofHash || ""
    );
    res.json(result);
  } catch (err) {
    console.error("[blockchain] Error submitting score:", err.message);
    res.status(500).json({ error: err.message });
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
  console.log(`   POST /api/blockchain/submit-score  { entryId, verifiedScore, proofHash }`);
  console.log(`   GET  /api/blockchain/agent-info\n`);
});
