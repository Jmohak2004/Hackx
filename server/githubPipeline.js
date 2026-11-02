/**
 * Graphify Pipeline — Manual Runner
 * ──────────────────────────────────
 * Steps:
 *   2. Fetch data from GitHub API
 *   3. Preprocess code (extract functions / classes / imports)
 *   4. Build Knowledge Graph in Neo4j
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx REPO_URL=https://github.com/owner/repo node githubPipeline.js
 *   or configure .env and run: node githubPipeline.js
 */

if (process.env.HACKX_GRAPH_WORKER !== "true") require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { fetchGitHubData, resolveRepository, validateRepository } = require("./lib/github");
const neo4j = require("neo4j-driver");
const { randomUUID: uuidv4 } = require("node:crypto");
const { githubUrl: normalizeGithubUrl, AppError } = require("./lib/errors");
const { analyzeJavaScript, inferFunctionCalls } = require("./lib/call-graph");

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
const REPO_URL = process.env.REPO_URL || "https://github.com/octocat/Hello-World";
const NEO4J_URI = process.env.NEO4J_URI || "";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "";
/**
 * Returns the lowercase extension of a file path, or "" if none.
 */
function getExtension(filePath) {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return "";
  return filePath.slice(dot + 1).toLowerCase();
}

// ─────────────────────────────────────────────
// STEP 3 — Code Preprocessing
// ─────────────────────────────────────────────

const LANGUAGE_MAP = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python",
  java: "java",
  go: "go",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp", c: "c", h: "c",
  rs: "rust",
  kt: "kotlin",
  swift: "swift",
  sol: "solidity",
  html: "html", css: "css", scss: "css", sass: "css",
};

/**
 * Extracts import statements depending on language.
 * Returns an array of module/path strings.
 */
function extractImports(content, language) {
  const imports = new Set();
  if (language === "solidity" || language === "css") {
    const statements = content.matchAll(/(?:import|@import)\s+(?:[^;\n]*?\sfrom\s+)?(?:url\()?["']([^"']+)["']/g);
    for (const statement of statements) imports.add(statement[1]);
  }

  if (language === "javascript" || language === "typescript") {
    // ES modules: import ... from '...'
    const esModuleRe = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = esModuleRe.exec(content)) !== null) imports.add(m[1]);

    // CommonJS: require('...')
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRe.exec(content)) !== null) imports.add(m[1]);
  }

  if (language === "python") {
    const pyImportRe = /^\s*(?:import|from)\s+([\w.]+)/gm;
    let m;
    while ((m = pyImportRe.exec(content)) !== null) imports.add(m[1]);
  }

  if (language === "java") {
    const javaImportRe = /^import\s+([\w.]+);/gm;
    let m;
    while ((m = javaImportRe.exec(content)) !== null) imports.add(m[1]);
  }

  if (language === "go") {
    const goImportRe = /"([\w./]+)"/g;
    let m;
    while ((m = goImportRe.exec(content)) !== null) imports.add(m[1]);
  }

  if (language === "rust") {
    const rustUseRe = /^use\s+([\w:]+)/gm;
    let m;
    while ((m = rustUseRe.exec(content)) !== null) imports.add(m[1]);
  }

  return [...imports];
}

/**
 * Extracts function names depending on language.
 */
function extractFunctions(content, language) {
  const functions = new Set();
  if (language === "solidity" || language === "php") {
    for (const match of content.matchAll(/\bfunction\s+(\w+)\s*\(/g)) functions.add(match[1]);
  }
  if (language === "swift") {
    for (const match of content.matchAll(/\bfunc\s+(\w+)\s*[(<]/g)) functions.add(match[1]);
  }
  if (language === "ruby") {
    for (const match of content.matchAll(/^\s*def\s+(?:self\.)?(\w+)/gm)) functions.add(match[1]);
  }
  if (language === "c" || language === "cpp") {
    for (const match of content.matchAll(/^[\w\s*&:<>]+\s+(\w+)\s*\([^;{}]*\)\s*(?:const\s*)?\{/gm)) {
      if (!["if", "while", "switch", "for"].includes(match[1])) functions.add(match[1]);
    }
  }

  if (language === "javascript" || language === "typescript") {
    const patterns = [
      /function\s+(\w+)\s*\(/g,                         // function foo(
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g, // const foo = (
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function/g, // const foo = function
      /(\w+)\s*\(.*?\)\s*\{/g,                          // method shorthand in objects/classes
      /async\s+(\w+)\s*\(/g,                            // async foo(
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(content)) !== null) {
        if (m[1] && !["if", "for", "while", "switch", "catch"].includes(m[1])) {
          functions.add(m[1]);
        }
      }
    }
  }

  if (language === "python") {
    const pyFnRe = /^\s*(?:async\s+)?def\s+(\w+)\s*\(/gm;
    let m;
    while ((m = pyFnRe.exec(content)) !== null) functions.add(m[1]);
  }

  if (language === "java" || language === "csharp" || language === "kotlin") {
    const javaFnRe = /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(/g;
    let m;
    while ((m = javaFnRe.exec(content)) !== null) {
      if (!["if", "for", "while", "class", "interface"].includes(m[1])) {
        functions.add(m[1]);
      }
    }
  }

  if (language === "go") {
    const goFnRe = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/gm;
    let m;
    while ((m = goFnRe.exec(content)) !== null) functions.add(m[1]);
  }

  if (language === "rust") {
    const rustFnRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*[(<]/gm;
    let m;
    while ((m = rustFnRe.exec(content)) !== null) functions.add(m[1]);
  }

  return [...functions];
}

/**
 * Extracts class names depending on language.
 */
function extractClasses(content, language) {
  const classes = new Set();
  const classRe = language === "solidity" ? /\b(?:contract|interface|library)\s+(\w+)/g
    : language === "rust" || language === "swift" ? /\b(?:class|struct|enum)\s+(\w+)/g : /\bclass\s+(\w+)/g;
  let m;
  while ((m = classRe.exec(content)) !== null) classes.add(m[1]);
  return [...classes];
}

/**
 * Detects API endpoints (Express / FastAPI / Spring style).
 */
function extractApiEndpoints(content, language) {
  const endpoints = [];

  if (language === "javascript" || language === "typescript") {
    const expressRe = /(?:app|router)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = expressRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }

  if (language === "python") {
    const fastapiRe = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = fastapiRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }

  return endpoints;
}

/**
 * Splits large content into ≤ 200-line chunks.
 */
function chunkContent(content, chunkSize = 200) {
  const lines = content.split("\n");
  if (lines.length <= chunkSize) return [content];
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize).join("\n"));
  }
  return chunks;
}

/**
 * Transforms raw file contents → structured preprocessed format.
 */
function preprocessCode(rawData) {
  console.log("🔧 [STEP 3] Preprocessing code…");

  const processedFiles = [];

  for (const { path, content } of rawData.fileContents) {
    const ext = getExtension(path);
    const language = LANGUAGE_MAP[ext] || "unknown";

    const analysis = ["javascript", "typescript"].includes(language) ? analyzeJavaScript(content, path) : null;
    const imports = analysis?.imports || extractImports(content, language);
    const functions = analysis?.functions || extractFunctions(content, language);
    const classes = analysis?.classes || extractClasses(content, language);
    const apiEndpoints = extractApiEndpoints(content, language);
    const chunks = chunkContent(content);

    const structured = {
      file: path,
      language,
      imports,
      functions,
      classes,
      apiEndpoints,
      chunkCount: chunks.length,
      code: content,
      chunks,
      ...(analysis || {}),
    };

    processedFiles.push(structured);
  }

  // Parse package.json for dependency names
  const extractedDeps = [];
  if (rawData.dependencies["package.json"]) {
    try {
      const pkg = JSON.parse(rawData.dependencies["package.json"]);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };
      extractedDeps.push(...Object.keys(allDeps));
    } catch {
      // malformed package.json
    }
  }
  if (rawData.dependencies["requirements.txt"]) {
    const lines = rawData.dependencies["requirements.txt"].split("\n");
    for (const line of lines) {
      const pkg = line.split(/[=><]/)[0].trim();
      if (pkg) extractedDeps.push(pkg);
    }
  }

  console.log(
    `  ↳ Processed ${processedFiles.length} files | ` +
    `${extractedDeps.length} top-level dependencies detected`
  );
  console.log("✅ [STEP 3] Preprocessing complete\n");

  return {
    repoId: rawData.repoId,
    owner: rawData.owner,
    repo: rawData.repo,
    metadata: rawData.metadata,
    processedFiles,
    callEdges: inferFunctionCalls(processedFiles),
    topLevelDependencies: extractedDeps,
    recentCommits: rawData.recentCommits,
    readme: rawData.readme,
    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// STEP 4 — Knowledge Graph (Neo4j)
// ─────────────────────────────────────────────

/**
 * Escapes a string for safe use inside Cypher string literals.
 */
function esc(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Connects to Neo4j and builds the knowledge graph from preprocessed data.
 * Uses batched UNWIND queries — one transaction per file — to minimise
 * round-trips to Aura and avoid timeouts on large repos.
 */
async function buildKnowledgeGraph(preprocessed) {
  if (!NEO4J_URI) {
    return { repoId: preprocessed.repoId, owner: preprocessed.owner, repo: preprocessed.repo, stats: {} };
  }
  console.log("🧩 [STEP 4] Building Knowledge Graph in Neo4j…");
  console.log(`  ↳ Connecting to ${NEO4J_URI}…`);

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    { connectionTimeout: 5000, maxConnectionPoolSize: 4, connectionAcquisitionTimeout: 5000 }
  );

  let session;
  try {
    session = driver.session();

    await driver.verifyConnectivity();
    console.log("  ↳ Neo4j connected");

    const { repoId, owner, repo, processedFiles, topLevelDependencies, metadata } = preprocessed;

    // ── Constraints (idempotent, fire-and-forget errors) ──────────────────
    console.log("  ↳ Creating constraints…");
    const constraints = [
      "CREATE CONSTRAINT repo_id   IF NOT EXISTS FOR (r:Repo)        REQUIRE r.repoId IS UNIQUE",
      "CREATE CONSTRAINT file_id   IF NOT EXISTS FOR (f:File)        REQUIRE f.id IS UNIQUE",
      "CREATE CONSTRAINT fn_id     IF NOT EXISTS FOR (fn:Function)   REQUIRE fn.id IS UNIQUE",
      "CREATE CONSTRAINT cls_id    IF NOT EXISTS FOR (c:Class)       REQUIRE c.id IS UNIQUE",
      "CREATE CONSTRAINT dep_id    IF NOT EXISTS FOR (d:Dependency)  REQUIRE d.id IS UNIQUE",
      "CREATE CONSTRAINT ep_id     IF NOT EXISTS FOR (e:ApiEndpoint) REQUIRE e.id IS UNIQUE",
    ];
    for (const cypher of constraints) {
      try { await session.run(cypher); } catch { /* already exists */ }
    }

    // ── Repo node ─────────────────────────────────────────────────────────
    console.log("  ↳ Creating Repo node…");
    await session.run(
      `MERGE (r:Repo {repoId: $repoId})
       SET r.owner       = $owner,
           r.name        = $name,
           r.description = $description,
           r.language    = $language,
           r.stars       = $stars,
           r.processedAt = $processedAt`,
      {
        repoId, owner,
        name: repo,
        description: metadata.description || "",
        language: metadata.language || "",
        stars: neo4j.int(metadata.stars || 0),
        processedAt: preprocessed.fetchedAt,
      }
    );

    // ── Top-level dependencies (batch) ────────────────────────────────────
    if (topLevelDependencies.length > 0) {
      console.log(`  ↳ Writing ${topLevelDependencies.length} top-level dependencies…`);
      const depRows = topLevelDependencies.map((d) => ({
        id: `${repoId}:dep:${d}`,
        name: d,
      }));
      await session.run(
        `UNWIND $rows AS row
         MERGE (d:Dependency {id: row.id}) SET d.name = row.name
         WITH d
         MATCH (r:Repo {repoId: $repoId})
         MERGE (r)-[:HAS_DEPENDENCY]->(d)`,
        { rows: depRows, repoId }
      );
    }

    // ── Files, Functions, Classes, Imports, Endpoints ─────────────────────
    let filesCreated = 0, functionsCreated = 0, classesCreated = 0;
    let importsCreated = 0, endpointsCreated = 0;

    console.log(`  ↳ Writing ${processedFiles.length} files to graph…`);
    for (let i = 0; i < processedFiles.length; i++) {
      const file = processedFiles[i];
      const fileId = `${repoId}:file:${file.file}`;

      // Progress indicator every 20 files
      if (i % 20 === 0) {
        process.stdout.write(`    📄 [${i + 1}/${processedFiles.length}] ${file.file}\n`);
      }

      await session.executeWrite(async (tx) => {
        // File node + link to Repo
        await tx.run(
          `MERGE (f:File {id: $fileId})
           SET f.path = $path, f.language = $language, f.chunks = $chunks
           WITH f
           MATCH (r:Repo {repoId: $repoId})
           MERGE (r)-[:CONTAINS_FILE]->(f)`,
          {
            fileId, path: file.file, language: file.language,
            chunks: neo4j.int(file.chunkCount), repoId
          }
        );

        // Functions batch
        if (file.functions.length > 0) {
          const fnRows = file.functions.map((fn) => ({
            id: `${fileId}:fn:${fn}`, name: fn,
          }));
          await tx.run(
            `UNWIND $rows AS row
             MERGE (fn:Function {id: row.id}) SET fn.name = row.name, fn.file = $filePath
             WITH fn
             MATCH (f:File {id: $fileId})
             MERGE (f)-[:CONTAINS]->(fn)`,
            { rows: fnRows, filePath: file.file, fileId }
          );
        }

        // Classes batch
        if (file.classes.length > 0) {
          const clsRows = file.classes.map((cls) => ({
            id: `${fileId}:cls:${cls}`, name: cls,
          }));
          await tx.run(
            `UNWIND $rows AS row
             MERGE (c:Class {id: row.id}) SET c.name = row.name, c.file = $filePath
             WITH c
             MATCH (f:File {id: $fileId})
             MERGE (f)-[:CONTAINS]->(c)`,
            { rows: clsRows, filePath: file.file, fileId }
          );
        }

        // Imports batch
        if (file.imports.length > 0) {
          const impRows = file.imports.map((imp) => ({
            id: `${repoId}:dep:${imp}`, name: imp,
          }));
          await tx.run(
            `UNWIND $rows AS row
             MERGE (d:Dependency {id: row.id}) SET d.name = row.name
             WITH d
             MATCH (f:File {id: $fileId})
             MERGE (f)-[:IMPORTS]->(d)`,
            { rows: impRows, fileId }
          );
        }

        // API Endpoints batch
        if (file.apiEndpoints.length > 0) {
          const epRows = file.apiEndpoints.map((ep) => ({
            id: `${fileId}:ep:${ep.method}:${ep.path}`,
            method: ep.method, path: ep.path,
          }));
          await tx.run(
            `UNWIND $rows AS row
             MERGE (e:ApiEndpoint {id: row.id})
             SET e.method = row.method, e.path = row.path
             WITH e
             MATCH (f:File {id: $fileId})
             MERGE (f)-[:ROUTES_TO]->(e)`,
            { rows: epRows, fileId }
          );
        }
      });

      filesCreated++;
      functionsCreated += file.functions.length;
      classesCreated += file.classes.length;
      importsCreated += file.imports.length;
      endpointsCreated += file.apiEndpoints.length;
    }

    const callsPairs = preprocessed.callEdges.map((edge) => ({
      callerId: repoId + ":file:" + edge.callerFile + ":fn:" + edge.caller,
      calleeId: repoId + ":file:" + edge.calleeFile + ":fn:" + edge.callee,
    }));

    // Write CALLS in chunks of 500
    let callsEdges = 0;
    const CHUNK = 500;
    for (let i = 0; i < callsPairs.length; i += CHUNK) {
      const batch = callsPairs.slice(i, i + CHUNK);
      await session.run(
        `UNWIND $pairs AS pair
         MATCH (caller:Function {id: pair.callerId}), (callee:Function {id: pair.calleeId})
         MERGE (caller)-[:CALLS]->(callee)`,
        { pairs: batch }
      );
      callsEdges += batch.length;
    }

    const auraConsole = NEO4J_URI.includes("neo4j.io")
      ? "https://console.neo4j.io"
      : "http://localhost:7474";

    console.log(`
  ──────────────────────────────────
  📊 Graph Summary for ${owner}/${repo}
  ──────────────────────────────────
  🗂  Files            : ${filesCreated}
  ⚙️  Functions        : ${functionsCreated}
  🏛  Classes          : ${classesCreated}
  📦  Import edges     : ${importsCreated}
  🌐  API endpoints    : ${endpointsCreated}
  🔗  CALLS edges      : ${callsEdges}
  ──────────────────────────────────`);

    console.log("\n✅ [STEP 4] Knowledge Graph built successfully");
    console.log(`\n🔍 Inspect your graph at: ${auraConsole}`);
    console.log(`   Cypher: MATCH (r:Repo {repoId: '${repoId}'})-[*1..2]->(n) RETURN r,n LIMIT 50\n`);

    return {
      repoId, owner, repo,
      stats: { filesCreated, functionsCreated, classesCreated, importsCreated, endpointsCreated, callsEdges },
    };
  } finally {
    if (session) await session.close();
    await driver.close();
  }
}

// ─────────────────────────────────────────────
// Graph Cache — persist to disk so the pipeline
// doesn't need to re-run for the same repo
// ─────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, "graph-cache");

function saveGraphCache(preprocessed, graphResult) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const { repoId, owner, repo, processedFiles, topLevelDependencies, metadata, fetchedAt } = preprocessed;

  // Build a compact graph payload that the frontend can consume directly
  const nodes = [];
  const edges = [];

  // Repo node
  nodes.push({ id: `repo:${repoId}`, type: "Repo", label: `${owner}/${repo}`, data: metadata });

  // File + child nodes
  for (const file of processedFiles) {
    const fileId = `file:${file.file}`;
    nodes.push({ id: fileId, type: "File", label: file.file.split("/").pop(), data: { path: file.file, language: file.language } });
    edges.push({ source: `repo:${repoId}`, target: fileId, type: "CONTAINS_FILE" });

    for (const fn of file.functions) {
      const fnId = `fn:${file.file}:${fn}`;
      nodes.push({ id: fnId, type: "Function", label: fn, data: { file: file.file } });
      edges.push({ source: fileId, target: fnId, type: "CONTAINS" });
    }

    for (const cls of file.classes) {
      const clsId = `cls:${file.file}:${cls}`;
      nodes.push({ id: clsId, type: "Class", label: cls, data: { file: file.file } });
      edges.push({ source: fileId, target: clsId, type: "CONTAINS" });
    }

    for (const imp of file.imports) {
      const depId = `dep:${imp}`;
      if (!nodes.find((n) => n.id === depId)) {
        nodes.push({ id: depId, type: "Dependency", label: imp, data: {} });
      }
      edges.push({ source: fileId, target: depId, type: "IMPORTS" });
    }

    for (const ep of file.apiEndpoints) {
      const epId = `ep:${file.file}:${ep.method}:${ep.path}`;
      nodes.push({ id: epId, type: "ApiEndpoint", label: `${ep.method} ${ep.path}`, data: ep });
      edges.push({ source: fileId, target: epId, type: "ROUTES_TO" });
    }
  }

  for (const edge of preprocessed.callEdges) {
    edges.push({
      source: "fn:" + edge.callerFile + ":" + edge.caller,
      target: "fn:" + edge.calleeFile + ":" + edge.callee,
      type: "CALLS",
    });
  }

  const stats = {
    filesCreated: nodes.filter((node) => node.type === "File").length,
    functionsCreated: nodes.filter((node) => node.type === "Function").length,
    classesCreated: nodes.filter((node) => node.type === "Class").length,
    importsCreated: edges.filter((edge) => edge.type === "IMPORTS").length,
    endpointsCreated: nodes.filter((node) => node.type === "ApiEndpoint").length,
    callsEdges: edges.filter((edge) => edge.type === "CALLS").length,
  };
  graphResult.stats = stats;
  const payload = {
    repoId,
    owner,
    repo,
    githubUrl: `https://github.com/${owner}/${repo}`,
    metadata,
    fetchedAt,
    stats,
    nodes,
    edges,
  };

  const filePath = path.join(CACHE_DIR, `${repoId}.json`);
  const temporary = filePath + "." + uuidv4() + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2));
  fs.renameSync(temporary, filePath);
  console.log(`  💾 Graph cache saved → graph-cache/${repoId}.json`);
  return filePath;
}

const summaryCache = new Map();
function listCachedGraphs() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs.readdirSync(CACHE_DIR).filter((name) => name.endsWith(".json")).flatMap((name) => {
    try {
      const file = path.join(CACHE_DIR, name);
      const modified = fs.statSync(file).mtimeMs;
      const cached = summaryCache.get(name);
      if (cached?.modified === modified) return [cached.summary];
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const summary = { repoId: data.repoId, owner: data.owner, repo: data.repo, fetchedAt: data.fetchedAt, stats: data.stats };
      summaryCache.set(name, { modified, summary });
      return [summary];
    } catch { return []; }
  }).sort((a, b) => String(b.fetchedAt).localeCompare(String(a.fetchedAt)));
}

function loadCachedGraph(repoId) {
  if (typeof repoId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(repoId)) {
    throw new AppError(400, "INVALID_GRAPH_ID", "Invalid graph identifier");
  }
  const filePath = path.join(CACHE_DIR, `${repoId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ─────────────────────────────────────────────
// Main — orchestrate all steps
// ─────────────────────────────────────────────
async function buildRepository(repoUrl) {
  console.log("═══════════════════════════════════════════");
  console.log("  🚀 Graphify Pipeline — Manual Run");
  console.log(`  🔗 Repo: ${repoUrl}`);
  console.log("═══════════════════════════════════════════\n");

  const startTime = Date.now();

  // Step 2: Fetch
  const snapshot = await resolveRepository(repoUrl);
  const cached = loadCachedGraph(snapshot.repoId);
  if (cached) return {
    repoId: cached.repoId, owner: cached.owner, repo: cached.repo, stats: cached.stats, cached: true,
  };
  const rawData = await fetchGitHubData(repoUrl, { snapshot });

  // Step 3: Preprocess
  const preprocessed = preprocessCode(rawData);
  const functionCount = preprocessed.processedFiles.reduce((count, file) => count + file.functions.length, 0);
  if (functionCount > 2000) throw new AppError(422, "FUNCTION_LIMIT", "Repository exceeds the 2,000-function analysis limit");

  // Step 4: Graph
  let result;
  try {
    result = await buildKnowledgeGraph(preprocessed);
  } catch (error) {
    // Neo4j is an optional index. The deterministic JSON graph remains the
    // authoritative input for scoring when the database is unavailable.
    console.warn("Neo4j index unavailable; retaining the file graph.");
    result = { repoId: preprocessed.repoId, owner: preprocessed.owner, repo: preprocessed.repo, stats: {} };
  }

  // Save graph to disk cache
  saveGraphCache(preprocessed, result);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🏁 Pipeline complete in ${elapsed}s`);
  console.log(`   repoId: ${result.repoId}`);
  console.log("═══════════════════════════════════════════\n");

  return result;
}

const running = new Map();
function runPipeline(value) {
  const url = normalizeGithubUrl(value);
  if (running.has(url)) return running.get(url);
  const task = buildRepository(url).finally(() => running.delete(url));
  running.set(url, task);
  return task;
}

// ─────────────────────────────────────────────
// Entry point (run directly or import)
// ─────────────────────────────────────────────
if (require.main === module) {
  const repoUrl = process.env.REPO_URL || process.argv[2] || REPO_URL;
  runPipeline(repoUrl).catch((err) => {
    console.error("\n❌ Pipeline failed:", err.message);
    process.exit(1);
  });
}

module.exports = { validateRepository, runPipeline, fetchGitHubData, preprocessCode, buildKnowledgeGraph, saveGraphCache, listCachedGraphs, loadCachedGraph };
