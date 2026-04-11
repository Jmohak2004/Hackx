require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { listCachedGraphs, loadCachedGraph, runPipeline } = require("./githubPipeline");

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

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`\n🚀 Graphify API running at http://localhost:${PORT}`);
  console.log(`   GET  /api/graphs`);
  console.log(`   GET  /api/graph/:repoId`);
  console.log(`   POST /api/analyze  { "githubUrl": "..." }\n`);
});
