const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBlockchain } = require("../server/blockchain");
const { FileStore } = require("../server/lib/store");
const { EvaluationService } = require("../server/lib/evaluations");
const { createApp } = require("../server/app");

describe("HTTP API with the real local contract", function () {
  let server, directory, service;
  afterEach(async function () {
    service?.stop();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  async function setup() {
    const [owner, alice] = await ethers.getSigners();
    const game = await ethers.deployContract("LatentStyleGame", [owner.address]);
    const stake = ethers.parseEther("0.001");
    await game.createRound(stake, 10, 600, 300);
    await game.connect(alice).enterGame(70, "https://github.com/user/repo", "", { value: stake });
    const signer = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk");
    const blockchain = createBlockchain({
      chainId: 31337, address: game.target, privateKey: signer.privateKey, provider: ethers.provider,
    });
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "hackx-api-integration-"));
    let calls = 0;
    service = new EvaluationService({
      blockchain, store: new FileStore(directory),
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({
          ai_score: 7.2, user_score: 7, github_score: 7.2, avg_score: 7.2,
          github_url: "https://github.com/user/repo", hosted_url: "",
          errors: [], logs: [], degraded: false, summary: "Local deterministic fixture",
        }));
      },
    });
    const { app } = createApp({
      blockchain, evaluations: service, graph: {
        listCachedGraphs: () => [], loadCachedGraph: () => null,
        runPipeline: async () => ({ repoId: "graph", stats: {} }),
      },
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    async function request(url, body) {
      const response = await fetch(base + url, body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      } : {});
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    return { game, owner, alice, stake, blockchain, request, calls: () => calls, base };
  }

  it("evaluates once, publishes verifiable evidence, and exposes settled claim eligibility", async function () {
    const { game, alice, stake, request, calls } = await setup();
    const start = await request("/api/evaluations", { entryId: "1", verifiedScore: 100 });
    expect(start.status).to.equal(202);
    expect((await request("/api/evaluations", { entryId: "001" })).body.id).to.equal(start.body.id);
    const result = await service.wait("1", 15_000);
    expect(result.ai_score).to.equal(7.2);
    expect((await game.getEntry(1)).verifiedScore).to.equal(72);
    expect(calls()).to.equal(1);
    const digest = result.chain.proofHash.slice(7);
    const evidence = await request("/api/reports/" + digest);
    expect(evidence.status).to.equal(200);
    expect(evidence.body.entryId).to.equal("1");
    expect(evidence.body.verifiedScore).to.equal(72);
    expect(evidence.headers.get("etag")).to.equal('"' + digest + '"');
    expect((await request("/api/blockchain/entry/1")).body.canClaimPrize).to.equal(false);
    const round = await game.getRound(1);
    await time.increaseTo(round.endTime + 1n);
    const eligible = await request("/api/blockchain/entry/1");
    expect(eligible.body.canClaimPrize).to.equal(true);
    expect(eligible.body.claimAmount).to.equal((stake * 95n / 100n).toString());
    await game.connect(alice).claimPrize(1);
    const refreshed = await request("/api/evaluations/1");
    expect(refreshed.body.result.chain.claimed).to.equal(true);
    const leaderboard = await request("/api/blockchain/leaderboard?roundId=1");
    expect(leaderboard.body.entries[0].rank).to.equal(1);
    expect(leaderboard.body.entries[0].verifiedScore).to.equal(72);
    const history = await request("/api/blockchain/entries?roundId=1&participant=" + alice.address);
    expect(history.body.total).to.equal(1);
    expect(history.body.entries[0].participant).to.equal(alice.address);
  });

  it("rejects malformed IDs, unsafe graph paths, arbitrary score writes and foreign origins", async function () {
    const { request, base } = await setup();
    expect((await request("/api/evaluations", { entryId: "-1" })).status).to.equal(400);
    expect((await request("/api/evaluations", { entryId: (2n ** 256n).toString() })).status).to.equal(400);
    expect((await request("/api/blockchain/entries?roundId=1&limit=1000")).status).to.equal(400);
    expect((await request("/api/blockchain/submit-score", { entryId: "1", verifiedScore: 100 })).status).to.equal(404);
    expect((await request("/api/graph/..%2Fsecret")).status).to.equal(400);
    const denied = await fetch(base + "/health", { headers: { Origin: "https://attacker.example" } });
    expect(denied.status).to.equal(403);
    const malformed = await fetch(base + "/api/evaluations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    expect(malformed.status).to.equal(400);
    expect((await malformed.json()).code).to.equal("INVALID_JSON");
  });
});
