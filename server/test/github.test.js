const test = require("node:test");
const assert = require("node:assert/strict");
const tar = require("tar-stream");
const { Readable } = require("node:stream");
const { gzipSync } = require("node:zlib");
const { readRepositoryArchive, resolveRepository } = require("../lib/github");
const { preprocessCode } = require("../githubPipeline");

async function archive(files) {
  const pack = tar.pack();
  for (const [name, text, type] of files) pack.entry({ name, type: type || "file" }, text);
  pack.finalize();
  const chunks = [];
  for await (const chunk of pack) chunks.push(chunk);
  return Readable.from([gzipSync(Buffer.concat(chunks))]);
}

test("reads source and manifests in memory and ignores generated and linked files", async () => {
  const stream = await archive([
    ["root/contracts/Game.sol", "contract Game { function enter() external {} }"],
    ["root/index.html", "<h1>Hello</h1>"],
    ["root/styles.css", "body { color: red; }"],
    ["root/package.json", '{"dependencies":{"react":"19"}}'],
    ["root/README.md", "A project"],
    ["root/node_modules/package/file.js", "function notProjectCode() {}"],
    ["root/link.py", "", "symlink"],
  ]);
  const result = await readRepositoryArchive(stream);
  assert.deepEqual(result.fileContents.map((file) => file.path), ["contracts/Game.sol", "index.html", "styles.css"]);
  assert.equal(result.dependencies["package.json"], '{"dependencies":{"react":"19"}}');
  assert.equal(result.readme, "A project");
});

test("rejects traversal paths without extracting anything to disk", async () => {
  const stream = await archive([["root/../../credentials.py", "secret"]]);
  await assert.rejects(readRepositoryArchive(stream), /unsafe path/);
});

test("rejects repositories beyond the bounded source file limit", async () => {
  const files = Array.from({ length: 251 }, (_, index) => ["root/file" + index + ".js", "const x = 1;"]);
  await assert.rejects(readRepositoryArchive(await archive(files)), /250 source/);
});

test("does not evaluate a private repository even when the server token can access it", async () => {
  const octokit = { repos: { get: async () => ({ data: { private: true } }) } };
  await assert.rejects(resolveRepository("https://github.com/private-user/private-repo", { octokit }), /Only public/);
});

test("pins source identity to the exact default-branch commit", async () => {
  const sha = "a".repeat(40);
  const octokit = { repos: {
    get: async () => ({ data: { name: "repo", private: false, size: 2, default_branch: "production" } }),
    getBranch: async ({ branch }) => { assert.equal(branch, "production"); return { data: { commit: { sha } } }; },
  } };
  const first = await resolveRepository("https://github.com/public-user/repo", { octokit });
  const second = await resolveRepository("https://github.com/public-user/repo", { octokit });
  assert.equal(first.commitSha, sha);
  assert.equal(first.repoId, second.repoId);
});

test("extracts Solidity contracts and indented Python methods from real source text", () => {
  const processed = preprocessCode({
    repoId: "test", owner: "user", repo: "repo", metadata: {}, dependencies: {}, recentCommits: [],
    fileContents: [
      { path: "Game.sol", content: 'import "@openzeppelin/contracts/access/Ownable.sol";\ncontract Game { function enter() external {} }' },
      { path: "app.py", content: "class App:\n    async def evaluate(self):\n        return 7\n" },
    ],
  });
  assert.equal(processed.processedFiles[0].language, "solidity");
  assert.deepEqual(processed.processedFiles[0].functions, ["enter"]);
  assert.deepEqual(processed.processedFiles[0].classes, ["Game"]);
  assert.deepEqual(processed.processedFiles[1].functions, ["evaluate"]);
});
