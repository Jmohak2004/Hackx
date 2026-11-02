const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FileStore, canonicalJson } = require("../lib/store");
const { EvaluationService } = require("../lib/evaluations");
const { uintId, githubUrl } = require("../lib/errors");

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hackx-jobs-"));
  const store = new FileStore(directory);
  const entry = {
    id: "1", roundId: "1", participant: "0x1111111111111111111111111111111111111111",
    githubUrl: "https://github.com/user/repo", websiteUrl: "", selfScore: 70,
    verifiedScore: 0, scored: false, claimed: false, isWinner: false,
    proofIpfsHash: "", contractVersion: 2,
  };
  const counts = { fetch: 0, submit: 0, wait: 0 };
  const hash = "0x" + "a".repeat(64);
  const blockchain = {
    CHAIN_ID: 31337, CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222",
    getEntry: async () => ({ ...entry }),
    getRound: async () => ({ judgingDeadline: 1000, chainTimestamp: 10 }),
    getReadiness: async () => ({ ready: true }),
    submitVerifiedScore: async (_, score, proof, onBroadcast) => {
      counts.submit++;
      await onBroadcast(hash);
      Object.assign(entry, { scored: true, verifiedScore: score, proofIpfsHash: proof, isWinner: true });
      return { txHash: hash };
    },
    waitForScoreTransaction: async () => { counts.wait++; entry.scored = true; return { txHash: hash }; },
    ...overrides,
  };
  const fetchImpl = async () => {
    counts.fetch++;
    return new Response(JSON.stringify({
      ai_score: 7.3, user_score: 7, github_score: 7.3, avg_score: 7.3,
      logs: [], errors: [], degraded: false, github_url: entry.githubUrl,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const service = new EvaluationService({ blockchain, store, fetchImpl });
  t.after(() => { service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { service, store, blockchain, entry, counts, hash, directory };
}

test("normalizes uint256 identifiers and blocks overflow/aliases in storage", () => {
  assert.equal(uintId("0001"), "1");
  for (const value of ["0", "-1", "1.1", "../1", "1e3", (2n ** 256n).toString(), {}, undefined]) {
    assert.throws(() => uintId(value));
  }
});

test("repository normalization does not accept lookalike hosts or profiles", () => {
  assert.equal(githubUrl("https://github.com/user/repo.git/"), "https://github.com/user/repo");
  for (const url of [
    "https://evilgithub.com/user/repo", "https://github.com.evil.test/user/repo",
    "https://github.com/user", "https://user:password@github.com/u/r",
    "https://github.com/u/r?token=secret", "file:///u/r", "https://github.com/u/r/tree/main",
  ]) assert.throws(() => githubUrl(url));
});

test("reports have stable digests independent of property insertion order", (t) => {
  const { store } = fixture(t);
  const a = store.saveReport({ b: { d: 2, c: 1 }, a: [3, 4] });
  const b = store.saveReport({ a: [3, 4], b: { c: 1, d: 2 } });
  assert.equal(a, b);
  assert.equal(canonicalJson(store.getReport(a)), canonicalJson({ a: [3, 4], b: { c: 1, d: 2 } }));
  assert.throws(() => store.getReport("../secret"));
});

test("report tampering is detected before evidence is served", (t) => {
  const { store } = fixture(t);
  const hash = store.saveReport({ score: 7 });
  fs.writeFileSync(store.file("reports", hash), '{"score":10}');
  assert.throws(() => store.getReport(hash), /integrity/);
});

test("duplicate requests and numeric aliases produce one evaluation and transaction", async (t) => {
  const { service, counts, store, entry } = fixture(t);
  const first = service.start("001");
  const second = service.start("1");
  assert.equal(first.id, second.id);
  const result = await service.wait("1", 2000);
  assert.equal(result.ai_score, 7.3);
  assert.equal(result.chain.isWinnerOnChain, true);
  assert.equal(counts.fetch, 1);
  assert.equal(counts.submit, 1);
  assert.match(entry.proofIpfsHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(store.getReport(entry.proofIpfsHash.slice(7)).entryId, "1");
  service.start("1", true);
  assert.equal(counts.submit, 1);
});

test("degraded evaluations never reach the trusted signing wallet", async (t) => {
  const { service, counts } = fixture(t);
  service.fetch = async () => new Response('{"ai_score":8,"degraded":true}');
  service.start("1");
  await assert.rejects(service.wait("1", 2000), /required evaluation pipeline/);
  assert.equal(counts.submit, 0);
});

test("invalid and out-of-range scoring responses cannot be written on-chain", async (t) => {
  for (const ai_score of ["9", null, 100, -1]) {
    const { service, counts } = fixture(t);
    service.fetch = async () => new Response(JSON.stringify({ ai_score }));
    service.start("1");
    await assert.rejects(service.wait("1", 2000), /invalid score/);
    assert.equal(counts.submit, 0);
  }
});

test("refunded entries and expired judging windows do not consume scoring resources", async (t) => {
  const refunded = fixture(t);
  refunded.entry.claimed = true;
  refunded.service.start("1");
  await assert.rejects(refunded.service.wait("1", 2000), /refunded/);
  assert.equal(refunded.counts.fetch, 0);
  const expired = fixture(t, { getRound: async () => ({ judgingDeadline: 10, chainTimestamp: 11 }) });
  expired.service.start("1");
  await assert.rejects(expired.service.wait("1", 2000), /judging deadline/);
  assert.equal(expired.counts.fetch, 0);
});

test("resumes a broadcast transaction after restart without scoring or sending again", async (t) => {
  const { service, store, entry, counts, hash } = fixture(t);
  const result = { ai_score: 7, github_url: entry.githubUrl };
  const reportHash = store.saveReport({
    entryId: "1", chainId: 31337, contractAddress: service.blockchain.CONTRACT_ADDRESS, result,
  });
  entry.proofIpfsHash = "sha256:" + reportHash;
  entry.verifiedScore = 70;
  entry.isWinner = true;
  store.saveJob({
    id: service.id("1"), entryId: "1", status: "confirming",
    scoreTxHash: hash, reportHash, attempts: 1, logs: [],
  });
  service.resume();
  const recovered = await service.wait("1", 2000);
  assert.equal(recovered.chain.scoreTxHash, hash);
  assert.equal(counts.wait, 1);
  assert.equal(counts.fetch, 0);
  assert.equal(counts.submit, 0);
});

test("reuses persisted evidence when a pre-broadcast failure is retried", async (t) => {
  const { service, blockchain, counts } = fixture(t);
  const submit = blockchain.submitVerifiedScore;
  blockchain.submitVerifiedScore = async () => { throw new Error("RPC disconnected"); };
  service.start("1");
  await assert.rejects(service.wait("1", 2000));
  const reportHash = service.get("1").reportHash;
  blockchain.submitVerifiedScore = submit;
  service.start("1", true);
  await service.wait("1", 2000);
  assert.equal(service.get("1").reportHash, reportHash);
  assert.equal(counts.fetch, 1);
});

test("a recorded chain score can be recovered even if its original report is unavailable", async (t) => {
  const { service, entry, counts } = fixture(t);
  Object.assign(entry, { scored: true, verifiedScore: 67, proofIpfsHash: "legacy-proof", isWinner: true });
  service.start("1");
  const result = await service.wait("1", 2000);
  assert.equal(result.ai_score, 6.7);
  assert.match(result.summary, /report is unavailable/);
  assert.equal(counts.fetch, 0);
  assert.equal(counts.submit, 0);
});
