# HackX — Development Notes

## What This App Really Does

HackX is a **deterministic hackathon project evaluation engine** that combines browser automation, web performance auditing, and code knowledge-graph analysis to score submissions without any LLM hallucination. Instead of subjective judging, it uses Lighthouse metrics and code structure analysis to produce repeatable, formula-driven scores on a 0–10 scale.

### The Core Idea

When a hackathon team submits their project (a live URL, a GitHub repo, or both), the platform kicks off a multi-agent evaluation pipeline:

1. **Browser Agent**: Playwright launches headless Chromium and captures full-page screenshots across 3 viewports (Desktop 1920×1080, Tablet 768×1024, Mobile 375×812), scrolling to trigger lazy-loaded content.
2. **Lighthouse Agent**: Google Lighthouse CLI audits the live site, returning performance, accessibility, best practices, and SEO scores (each 0–100).
3. **Code Agent**: The Graphify pipeline (Node.js + Neo4j) clones the GitHub repo, extracts imports/functions/classes/endpoints via language-aware regex, builds a knowledge graph, and returns structural metrics.
4. **Deterministic Scoring**: Pure math formulas in `rubric.py` convert raw metrics into a 0–10 score — no LLM, no randomness, no hallucination.
5. **Honesty Check**: The AI score is compared against the participant's self-reported score. If the delta exceeds 1.0 point, the submission is flagged as dishonest.

### Three Evaluation Modes

| Mode | Input | Pipeline | Score Source |
|------|-------|----------|-------------|
| **Live URL** | Website URL | Browser + Lighthouse → Formula | 4 Lighthouse categories × 2.5 |
| **GitHub** | Repo URL | Graphify → Knowledge Graph → Formula | Scale + Organization + Architecture + Connectivity |
| **Combined** | Both URLs | Both pipelines in parallel | 50% live + 50% code |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16.2.3, React 19, Tailwind CSS 4, D3.js 7 |
| **Scoring API** | FastAPI, Uvicorn, Pydantic v2 |
| **Browser Automation** | Playwright (headless Chromium) |
| **Performance Audit** | Google Lighthouse CLI (via npx) |
| **Knowledge Graph API** | Express.js, Neo4j Driver 5, Octokit (GitHub API) |
| **Graph Storage** | Neo4j (bolt://localhost:7687), JSON file cache |
| **Languages Parsed** | JS, TS, Python, Java, Go, Rust, Ruby, PHP, C#, C/C++, Kotlin, Swift |

---

## Project Structure

```
Hackx/
├── client/                        # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Geist fonts, Tailwind)
│   │   ├── page.tsx               # Landing page (WIP)
│   │   └── globals.css
│   └── package.json
│
├── server/
│   ├── index.js                   # Express API (port 4000) — graph endpoints
│   ├── githubPipeline.js          # 4-step GitHub → Knowledge Graph pipeline
│   ├── graph-cache/               # Cached graph JSON files (per repoId)
│   ├── package.json
│   │
│   └── computer-use/              # Python scoring engine (port 8000)
│       ├── main.py                # FastAPI orchestrator — /evaluate endpoint
│       ├── requirements.txt
│       ├── .env                   # NVIDIA_API_KEY (legacy, not used for scoring)
│       ├── agents/
│       │   ├── browser_agent.py   # Playwright screenshot capture (3 viewports)
│       │   ├── lighthouse_agent.py# Lighthouse CLI runner
│       │   └── code_agent.py      # Graphify client (calls localhost:4000)
│       └── scoring/
│           ├── rubric.py          # Deterministic formulas (NO LLM)
│           ├── vision_scorer.py   # Live URL scorer (wraps rubric)
│           └── code_scorer.py     # Code repo scorer (wraps rubric)
│
└── .gitignore
```

---

## Scoring Formulas (Zero Hallucination)

### Live URL Score (0–10)

Each Lighthouse category (0–100) is linearly scaled to 0–2.5:

$$\text{score} = \frac{\text{performance}}{40} + \frac{\text{accessibility}}{40} + \frac{\text{best\_practices}}{40} + \frac{\text{seo}}{40}$$

| Dimension | Weight | Max |
|-----------|--------|-----|
| Performance | 2.5 | 2.5 |
| Accessibility | 2.5 | 2.5 |
| Best Practices | 2.5 | 2.5 |
| SEO | 2.5 | 2.5 |

### Code Score (0–10)

Computed from knowledge-graph structural metrics:

| Dimension | Formula | Max |
|-----------|---------|-----|
| **Project Scale** | $\min(3,\; \log_2(\text{files} + \text{functions} + 1) \times 0.45)$ | 3.0 |
| **Code Organization** | Function-to-file ratio curve + class bonus ($+\min(0.3,\; \text{classes} \times 0.06)$) | 2.5 |
| **Architecture** | $\log_2(\text{endpoints}+1) \times 0.35 + \log_2(\text{imports}+1) \times 0.18$ | 2.5 |
| **Connectivity** | $\min(2,\; \frac{\text{calls\_edges}}{\text{functions}+1} \times 0.3)$ | 2.0 |

### Honesty Check

$$\text{honest} = |\text{ai\_score} - \text{self\_reported\_score}| \leq 1.0$$

---

## How to Run

### Prerequisites
- Node.js 18+ (for Lighthouse CLI, Express server)
- Python 3.11+ (for FastAPI scoring engine)
- Neo4j (for knowledge graph storage — optional, falls back to cache)
- Chromium (installed automatically by Playwright)

### 1. Start the Graphify Server (port 4000)

```bash
cd server
npm install
# Set GITHUB_TOKEN in .env for authenticated GitHub API access
node index.js
```

### 2. Start the Scoring Engine (port 8000)

```bash
cd server/computer-use
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Start the Frontend (port 3000)

```bash
cd client
npm install
npm run dev
```

### 4. Test the API

```bash
# Live URL only
curl -s http://localhost:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{"live_url": "https://fix.dog/", "self_reported_score": 8}'

# GitHub only (requires Graphify server + GITHUB_TOKEN)
curl -s http://localhost:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/expressjs/express", "self_reported_score": 7}'

# Combined
curl -s http://localhost:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{"live_url": "https://fix.dog/", "github_url": "https://github.com/user/repo", "self_reported_score": 8}'
```

---

## Graphify Pipeline Deep Dive

The `githubPipeline.js` runs a 4-step process when `POST /api/analyze` is called:

### Step 1 — GitHub Data Ingestion (`fetchGitHubData`)
- Uses Octokit to fetch repo metadata, file tree (recursive), file contents (base64-decoded), README, dependency manifests, and last 20 commits.
- **Filters**: Ignores `node_modules`, `dist`, `build`, `.next`, `__pycache__`, `vendor`, etc. Only processes supported source file extensions. Skips files > 300KB.

### Step 2 — Code Preprocessing (`preprocessCode`)
- Language-aware regex extraction for:
  - **Imports**: ES6 `import`, CommonJS `require()`, Python `import`/`from`, Java `import`, Go package quotes, Rust `use`
  - **Functions**: JS/TS function declarations + arrow functions, Python `def`, Java/C# method signatures, Go `func`, Rust `fn`
  - **Classes**: Generic `class ClassName` pattern
  - **API Endpoints**: Express `app.get('/path')`, FastAPI `@app.get('/path')`
- Chunks large files into 200-line segments for graph building

### Step 3 — Knowledge Graph Construction (`buildKnowledgeGraph`)
- Connects to Neo4j, creates uniqueness constraints
- **Nodes**: Repo, File, Function, Class, Dependency, ApiEndpoint
- **Edges**: CONTAINS_FILE, CONTAINS, IMPORTS, ROUTES_TO, HAS_DEPENDENCY, CALLS
- **Call detection**: Regex-searches each file's source for `functionName(` patterns, linking cross-file function calls
- Batch inserts via UNWIND queries (500 per batch)

### Step 4 — Graph Caching (`saveGraphCache`)
- Serializes graph to `graph-cache/<repoId>.json` with nodes, edges, metadata, and stats
- Cached graphs are served directly on subsequent requests without re-running the pipeline

---

## Recent Changes (April 2026)

### Deterministic Scoring Engine
- **Removed all LLM calls** from the scoring pipeline. Previously used NVIDIA Gemma 4 31B for vision scoring and code scoring — caused inconsistent/hallucinated scores.
- **Replaced with pure math formulas** in `rubric.py`. Same Lighthouse input always produces the same score.
- **Simplified scorer wrappers**: `vision_scorer.py` and `code_scorer.py` are now thin wrappers around rubric formulas (removed `requests`, `json` parsing, NVIDIA API calls).

### Unified Evaluation Endpoint
- **Single `/evaluate` endpoint** handles all 3 modes (live URL, GitHub, combined) based on which URLs are provided.
- **Scores changed from 0–100 int to 0–10 float** for cleaner display and comparison.
- **Graceful degradation**: If one pipeline fails in combined mode, falls back to the surviving pipeline's score with an error message.

### Project Reorganization
- Moved `computer-use/` into `server/computer-use/` alongside the Node.js Graphify server.
- Updated `.gitignore` to properly exclude `.venv/`, `__pycache__/`, `.env`, `node_modules/`, `graph-cache/`, `package-lock.json`.

---

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `NVIDIA_API_KEY` | `server/computer-use/.env` | Legacy — no longer used for scoring |
| `GITHUB_TOKEN` | `server/.env` | GitHub API auth (avoids rate limits) |
| `NEO4J_URI` | `server/.env` | Neo4j connection (default: `bolt://localhost:7687`) |
| `NEO4J_USER` | `server/.env` | Neo4j username |
| `NEO4J_PASSWORD` | `server/.env` | Neo4j password |
| `PORT` | `server/.env` | Express server port (default: 4000) |

---

## Features We Can Add

### High Priority
- [ ] **Frontend Dashboard** — Replace the boilerplate Next.js page with a submission form, live score visualization (D3.js radar charts), and results history.
- [ ] **Knowledge Graph Visualizer** — Interactive D3 force-directed graph showing repo structure (files, functions, imports, API routes) with zoom/pan/filter.
- [ ] **Authentication** — User accounts so hackathon participants can track their submissions and scores across sessions.
- [ ] **Batch Evaluation** — Upload a CSV of team submissions and score them all in parallel, generating a leaderboard.

### Medium Priority
- [ ] **Screenshot Comparison View** — Display the 3 viewport screenshots (desktop/tablet/mobile) alongside the Lighthouse breakdown in the frontend.
- [ ] **Score History & Trends** — Track how a project's score changes over time as teams iterate during the hackathon.
- [ ] **Custom Rubric Weights** — Allow hackathon organizers to adjust the weight of each scoring dimension (e.g., prioritize accessibility over performance).
- [ ] **WebSocket Live Updates** — Stream evaluation progress (browser done → lighthouse done → scoring done) to the frontend in real-time.

### Nice to Have
- [ ] **PDF Report Export** — Generate a branded PDF with screenshots, scores, breakdowns, and the knowledge graph visualization.
- [ ] **Docker Compose** — One-command setup: `docker compose up` to run Neo4j, Express, FastAPI, and Next.js together.
- [ ] **GitHub Webhook Integration** — Auto-evaluate on push so scores update continuously during the hackathon.

---

*Last updated: April 2026*
