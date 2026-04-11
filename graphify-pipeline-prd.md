# 📄 Product Requirements Document (PRD)

## Project: GitHub → Knowledge Graph Pipeline (Graphify Integration)

---

## 1. 🎯 Objective

Build a backend system that:

1. Accepts a GitHub repository URL
2. Fetches and processes the repository data
3. Converts the entire codebase into a structured **knowledge graph**
4. Stores the graph for querying by AI agents (future steps)

This system will serve as the **foundation layer** for an AI-powered code evaluation engine used in a decentralized scoring game.

---

## 2. 🧩 Scope (MVP – Up to Step 4)

### Included:

* GitHub repo ingestion
* Code preprocessing
* Knowledge graph construction
* Graph storage (Neo4j or equivalent)

### Excluded (future phases):

* AI scoring agents
* Browser automation
* Smart contract integration
* Prize distribution

---

## 3. 👤 User Flow

1. User submits:

   * GitHub repo URL

2. System:

   * Validates repo
   * Fetches repo data
   * Processes code
   * Builds knowledge graph
   * Stores graph
   * Returns success + graph ID

---

## 4. 🏗️ System Architecture

### Components:

#### 4.1 API Layer

* Accepts requests
* Triggers pipeline

#### 4.2 GitHub Ingestion Service

* Fetches repo data via GitHub API

#### 4.3 Preprocessing Engine

* Cleans and structures code

#### 4.4 Graph Builder (Graphify Layer)

* Converts structured code → graph

#### 4.5 Graph Database

* Stores nodes and relationships

---

## 5. ⚙️ Functional Requirements

---

### 5.1 Input API

**Endpoint:**

```
POST /analyze-repo
```

**Request Body:**

```json
{
  "githubUrl": "https://github.com/user/repo"
}
```

**Response:**

```json
{
  "status": "processing",
  "repoId": "uuid"
}
```

---

### 5.2 GitHub Data Fetching

Use:

* GitHub REST API

**Must Fetch:**

* Repository metadata
* File tree (recursive)
* File contents (filtered)
* README
* Dependencies
* Last 20 commits

**Constraints:**

* Max repo size: 50MB (configurable)
* Ignore:

  * node_modules
  * build/dist folders
  * binaries

---

### 5.3 Code Preprocessing

Transform raw repo into structured format:

**Output Schema:**

```json
{
  "files": [
    {
      "path": "src/auth.js",
      "language": "javascript",
      "functions": ["login", "logout"],
      "imports": ["jsonwebtoken"],
      "content": "..."
    }
  ]
}
```

**Requirements:**

* Detect programming language
* Extract:

  * functions
  * classes
  * imports
* Chunk large files

---

### 5.4 Knowledge Graph Construction

Use:

* Neo4j (recommended)

---

#### Node Types:

* File
* Function
* Class
* Dependency

---

#### Relationships:

* `CONTAINS` (File → Function/Class)
* `IMPORTS` (File → Dependency)
* `CALLS` (Function → Function)

---

#### Example Graph:

```
(File: auth.js)
   └── CONTAINS → (Function: login)
(Function: login)
   └── CALLS → (Function: verifyToken)
(File: auth.js)
   └── IMPORTS → (Dependency: jsonwebtoken)
```

---

### 5.5 Graph Storage

Each repo must:

* Have unique graph ID
* Be stored independently

**Metadata stored:**

* repoId
* githubUrl
* timestamp
* processing status

---

## 6. 📊 Non-Functional Requirements

---

### Performance

* Repo processing < 60 seconds (MVP target)
* Async processing required

---

### Scalability

* Queue-based system (BullMQ / RabbitMQ)
* Horizontal worker scaling

---

### Security

* Sandbox execution (Docker)
* No code execution from repo
* Rate limiting GitHub API

---

### Reliability

* Retry failed jobs
* Logging for each stage

---

## 7. 🧪 Edge Cases

* Private repos (handle auth or reject)
* Extremely large repos
* Unsupported languages
* Empty or malformed repos

---

## 8. 🧰 Tech Stack

**Backend:**

* Node.js / Python

**Graph Layer:**

* Neo4j

**Queue:**

* BullMQ / Redis

**Storage:**

* S3 / local temp storage

---

## 9. 📦 Deliverables

* API endpoint working
* GitHub ingestion pipeline
* Preprocessing module
* Graph builder
* Graph database integration

---

## 10. 🚀 Success Criteria

* Successfully process a public GitHub repo
* Graph correctly represents:

  * files
  * functions
  * imports
* Graph can be queried (basic queries working)

---

## 11. 🔮 Future Extensions (Not in Scope)

* AI scoring agents
* Security analysis
* UI/UX evaluation
* Blockchain integration
* Prize logic

---

## 12. 🧠 Key Design Principle

> Convert unstructured code into structured relationships so AI can reason efficiently.

---

## 13. 🗺️ Milestones

| Milestone | Description              |
| --------- | ------------------------ |
| M1        | GitHub fetch working     |
| M2        | Preprocessing complete   |
| M3        | Graph schema implemented |
| M4        | Graph stored + queryable |

---

## 14. 🔚 Summary

This phase builds the **data intelligence layer** of the system:

* Raw GitHub repo → structured graph

This enables future AI agents to:

* Analyze code efficiently
* Detect patterns and relationships
* Generate accurate scores

---
