const { Octokit } = require("@octokit/rest");
const { createHash } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");
const tar = require("tar-stream");
const { githubUrl, AppError } = require("./errors");

const GRAPH_VERSION = "graph-v3";
const MAX_FILE_BYTES = 300_000;
const MAX_SOURCE_FILES = 250;
const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "go", "rb", "php", "cs",
  "cpp", "c", "h", "rs", "kt", "swift", "sol", "html", "css", "scss", "sass",
]);
const IGNORE = new Set(["node_modules", "dist", "build", ".next", "out", "coverage", ".cache", "__pycache__", ".git", "vendor", "target"]);
const MANIFESTS = new Set(["package.json", "requirements.txt", "go.mod", "Gemfile", "build.gradle", "pom.xml"]);
const metadataCache = new Map();

function gitClient() {
  return new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
    userAgent: "HackX-Evaluator/2",
    request: { timeout: 20_000 },
  });
}

function githubFailure(error) {
  if (error instanceof AppError) return error;
  if (error.status === 403 || error.status === 429) {
    return new AppError(503, "GITHUB_RATE_LIMIT", "GitHub request quota was exceeded. Configure GITHUB_TOKEN and retry later.");
  }
  if (error.status === 404 || error.status === 409) {
    return new AppError(422, "REPOSITORY_UNAVAILABLE", "The public repository or its default branch is unavailable");
  }
  return new AppError(502, "GITHUB_UNAVAILABLE", "GitHub could not provide the repository snapshot");
}

async function resolveRepository(value, options = {}) {
  const url = githubUrl(value);
  const [, owner, repo] = new URL(url).pathname.split("/");
  const octokit = options.octokit || gitClient();
  try {
    const cached = metadataCache.get(url.toLowerCase());
    const metadata = cached && cached.until > Date.now() ? cached.metadata
      : (await octokit.repos.get({ owner, repo })).data;
    if (metadata.private) throw new AppError(422, "PRIVATE_REPOSITORY", "Only public repositories can be evaluated");
    if (metadata.size > 50 * 1024) {
      throw new AppError(422, "REPOSITORY_TOO_LARGE", "Repository exceeds the 50 MB analysis limit");
    }
    metadataCache.set(url.toLowerCase(), { until: Date.now() + 60_000, metadata });
    if (metadataCache.size > 100) metadataCache.delete(metadataCache.keys().next().value);
    const defaultBranch = metadata.default_branch || "main";
    const { data: branch } = await octokit.repos.getBranch({ owner, repo, branch: defaultBranch });
    const commitSha = branch.commit.sha;
    if (!/^[a-f0-9]{40,64}$/i.test(commitSha)) throw new Error("Invalid GitHub snapshot");
    const repoId = createHash("sha256").update([GRAPH_VERSION, url.toLowerCase(), commitSha].join(":")).digest("hex").slice(0, 32);
    return { owner, repo, defaultBranch, commitSha, metadata, repoId, octokit, url };
  } catch (error) { throw githubFailure(error); }
}

async function validateRepository(value) {
  const snapshot = await resolveRepository(value);
  return { githubUrl: snapshot.url, commitSha: snapshot.commitSha };
}

function byteLimit(maximum, label) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _, callback) {
      bytes += chunk.length;
      callback(bytes > maximum ? new AppError(422, "ARCHIVE_LIMIT", label + " exceeded the analysis size limit") : null, chunk);
    },
  });
}

async function readRepositoryArchive(stream) {
  const extract = tar.extract();
  const fileContents = [];
  const dependencies = {};
  const skippedFiles = [];
  let readme = "";
  let sourceFiles = 0;
  let totalSourceBytes = 0;
  extract.on("entry", (header, entry, next) => {
    entry.on("error", (error) => { if (!extract.destroyed) extract.destroy(error); });
    const parts = header.name.split("/");
    const relative = parts.slice(1).join("/");
    if (header.name.startsWith("/") || parts.includes("..") || header.name.includes("\\")) {
      entry.resume();
      return next(new AppError(422, "INVALID_ARCHIVE_PATH", "Repository archive contains an unsafe path"));
    }
    const ignored = relative.split("/").some((part) => IGNORE.has(part));
    const extension = relative.split(".").at(-1).toLowerCase();
    const source = SOURCE_EXTENSIONS.has(extension) && !relative.endsWith(".min.js");
    const manifest = MANIFESTS.has(relative);
    const isReadme = /^readme(?:\.[a-z]+)?$/i.test(relative);
    if (header.type !== "file" || ignored || (!source && !manifest && !isReadme)) {
      entry.on("end", next); entry.resume(); return;
    }
    if (source && ++sourceFiles > MAX_SOURCE_FILES) {
      entry.resume();
      return next(new AppError(422, "TOO_MANY_FILES", "Repository exceeds the 250 source file analysis limit"));
    }
    if (header.size > MAX_FILE_BYTES) {
      skippedFiles.push(relative);
      entry.on("end", next); entry.resume(); return;
    }
    const chunks = [];
    let bytes = 0;
    entry.on("data", (chunk) => {
      bytes += chunk.length;
      totalSourceBytes += chunk.length;
      if (bytes > MAX_FILE_BYTES || totalSourceBytes > 16 * 1024 * 1024) {
        extract.destroy(new AppError(422, "SOURCE_LIMIT", "Repository source exceeds the analysis size limit"));
      } else chunks.push(chunk);
    });
    entry.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (!buffer.includes(0)) {
        const text = buffer.toString("utf8");
        if (source) fileContents.push({ path: relative, content: text });
        if (manifest) dependencies[relative] = text;
        if (isReadme) readme = text;
      }
      next();
    });
    entry.resume();
  });
  await pipeline(stream, byteLimit(MAX_COMPRESSED_BYTES, "Compressed archive"), createGunzip(),
    byteLimit(MAX_ARCHIVE_BYTES, "Expanded archive"), extract);
  fileContents.sort((a, b) => a.path.localeCompare(b.path));
  return { fileContents, dependencies, readme, skippedFiles };
}

async function fetchGitHubData(value, options = {}) {
  const snapshot = options.snapshot || await resolveRepository(value, options);
  const { owner, repo, commitSha, metadata, octokit } = snapshot;
  const fetchImpl = options.fetchImpl || fetch;
  try {
    // Public codeload requests do not receive the server's GitHub token.
    const response = await fetchImpl("https://codeload.github.com/" +
      encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/tar.gz/" + commitSha, {
      signal: AbortSignal.timeout(90_000), headers: { "User-Agent": "HackX-Evaluator/2" },
    });
    if (!response.ok || !response.body) throw new AppError(502, "ARCHIVE_UNAVAILABLE", "GitHub repository archive could not be downloaded");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_COMPRESSED_BYTES) throw new AppError(422, "ARCHIVE_LIMIT", "Repository archive is too large");
    const archive = await readRepositoryArchive(Readable.fromWeb(response.body));
    let recentCommits = [];
    try {
      const { data } = await octokit.repos.listCommits({ owner, repo, sha: commitSha, per_page: 20 });
      recentCommits = data.map((commit) => ({
        sha: commit.sha, message: commit.commit.message,
        author: commit.commit.author?.name, date: commit.commit.author?.date,
      }));
    } catch { /* Commit history is supplementary; the analyzed commit remains pinned. */ }
    return {
      repoId: snapshot.repoId, owner, repo, defaultBranch: snapshot.defaultBranch,
      metadata: {
        name: metadata.name, description: metadata.description, language: metadata.language,
        stars: metadata.stargazers_count, forks: metadata.forks_count, size: metadata.size,
        topics: metadata.topics, createdAt: metadata.created_at, updatedAt: metadata.updated_at,
        commitSha, graphVersion: GRAPH_VERSION, skippedFiles: archive.skippedFiles,
      },
      ...archive, recentCommits,
    };
  } catch (error) { throw githubFailure(error); }
}

module.exports = { fetchGitHubData, resolveRepository, validateRepository, readRepositoryArchive };
