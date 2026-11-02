const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const STAKE = ethers.parseEther("0.001");
const REPO = "https://github.com/octocat/Hello-World";
const SITE = "https://example.com";
const PROOF = "sha256:0123456789abcdef";

describe("LatentStyleGame settlement and custody", function () {
  async function fixture() {
    const [owner, alice, bob, carol, agent, outsider] = await ethers.getSigners();
    const game = await ethers.deployContract("LatentStyleGame", [owner.address]);
    await game.setTrustedAgent(agent.address, true);
    await game.createRound(STAKE, 10, 600, 300);
    return { game, owner, alice, bob, carol, agent, outsider };
  }

  async function enter(game, signer, score = 70, liveUrl = SITE) {
    await game.connect(signer).enterGame(score, REPO, liveUrl, { value: STAKE });
    return game.entryCounter();
  }

  async function judge(game, agent, id, score = 70) {
    return game.connect(agent).submitVerifiedScore(id, score, PROOF);
  }

  async function close(game, roundId = 1n, expireJudging = false) {
    const round = await game.getRound(roundId);
    await time.increaseTo((expireJudging ? round.judgingDeadline : round.endTime) + 1n);
  }

  it("keeps payouts closed while new participants can still enter", async function () {
    const { game, alice, agent } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await judge(game, agent, id);
    await expect(game.connect(alice).claimPrize(id)).to.be.revertedWithCustomError(game, "RoundStillOpen");
    expect(await ethers.provider.getBalance(game.target)).to.equal(STAKE);
    expect((await game.getEntry(id)).claimed).to.equal(false);
  });

  it("settles immediately after submissions close if every entry has a score", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const aliceId = await enter(game, alice);
    const bobId = await enter(game, bob);
    await judge(game, agent, aliceId);
    await judge(game, agent, bobId, 0);
    await close(game);
    const share = STAKE * 2n * 95n / 100n;
    await expect(game.connect(alice).claimPrize(aliceId)).to.changeEtherBalances(
      [game, alice], [-share, share]
    );
    expect((await game.getSettlement(1)).finalized).to.equal(true);
    expect((await game.getRound(1)).isActive).to.equal(false);
  });

  it("does not finalize while outstanding evaluations still have time", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await enter(game, bob);
    await judge(game, agent, id);
    await close(game);
    await expect(game.finalizeRound(1)).to.be.revertedWithCustomError(game, "JudgingNotExpired");
    await expect(game.connect(alice).claimPrize(id)).to.be.revertedWithCustomError(game, "JudgingNotExpired");
  });

  for (const refundFirst of [false, true]) {
    it("reserves unjudged stakes regardless of refund/prize ordering: refundFirst=" + refundFirst, async function () {
      const { game, owner, alice, bob, carol, agent } = await loadFixture(fixture);
      const winner = await enter(game, alice);
      const loser = await enter(game, bob);
      const unjudged = await enter(game, carol);
      await judge(game, agent, winner);
      await judge(game, agent, loser, 10);
      await close(game, 1n, true);
      const share = STAKE * 2n * 95n / 100n;
      const fee = STAKE * 2n - share;
      if (refundFirst) {
        await expect(game.connect(carol).claimRefund(unjudged)).to.changeEtherBalances([game, carol], [-STAKE, STAKE]);
      }
      await expect(game.connect(alice).claimPrize(winner)).to.changeEtherBalances([game, alice], [-share, share]);
      await expect(game.withdrawPlatformFees(1)).to.changeEtherBalances([game, owner], [-fee, fee]);
      if (!refundFirst) {
        await expect(game.connect(carol).claimRefund(unjudged)).to.changeEtherBalances([game, carol], [-STAKE, STAKE]);
      }
      expect(await ethers.provider.getBalance(game.target)).to.equal(0);
    });
  }

  it("never scores a refunded entry or changes the winner denominator after finalization", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const a = await enter(game, alice);
    const b = await enter(game, bob);
    await judge(game, agent, a);
    await close(game, 1n, true);
    await game.connect(bob).claimRefund(b);
    await expect(judge(game, agent, b)).to.be.revertedWithCustomError(game, "AlreadyClaimed");
    expect((await game.getRound(1)).winnersCount).to.equal(1);
    await expect(game.connect(alice).claimPrize(a)).to.changeEtherBalance(alice, STAKE * 95n / 100n);
  });

  it("rejects scoring after the deadline even before anyone finalizes", async function () {
    const { game, alice, agent } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await close(game, 1n, true);
    await expect(judge(game, agent, id)).to.be.revertedWithCustomError(game, "ScoringClosed");
  });

  it("returns all stakes without fees when nobody wins", async function () {
    const { game, alice, bob, carol, agent } = await loadFixture(fixture);
    const a = await enter(game, alice);
    const b = await enter(game, bob);
    const c = await enter(game, carol);
    await judge(game, agent, a, 0);
    await judge(game, agent, b, 0);
    await close(game, 1n, true);
    for (const [signer, id] of [[alice, a], [bob, b], [carol, c]]) {
      await expect(game.connect(signer).claimRefund(id)).to.changeEtherBalances([game, signer], [-STAKE, STAKE]);
    }
    expect((await game.getSettlement(1)).refundAll).to.equal(true);
    expect((await game.getRound(1)).platformFeePool).to.equal(0);
    expect(await ethers.provider.getBalance(game.target)).to.equal(0);
  });

  it("returns a single losing entrant's stake after the completed contest", async function () {
    const { game, alice, agent } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await judge(game, agent, id, 0);
    await close(game);
    await expect(game.connect(alice).claimRefund(id)).to.changeEtherBalance(alice, STAKE);
  });

  it("allows exits while paused but blocks new entries and rounds", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await judge(game, agent, id);
    await game.pause();
    await expect(enter(game, bob)).to.be.revertedWithCustomError(game, "EnforcedPause");
    await close(game);
    await expect(game.createRound(STAKE, 10, 100, 100)).to.be.revertedWithCustomError(game, "EnforcedPause");
    await expect(game.connect(alice).claimPrize(id)).to.changeEtherBalance(alice, STAKE * 95n / 100n);
  });

  it("does not let an owner silently replace an open round", async function () {
    const { game } = await loadFixture(fixture);
    await expect(game.createRound(STAKE, 10, 600, 300)).to.be.revertedWithCustomError(game, "RoundStillOpen");
    expect(await game.currentRoundId()).to.equal(1);
  });

  it("keeps overlapping judging windows and round balances independent", async function () {
    const { game, owner, alice, bob, agent } = await loadFixture(fixture);
    const oldWinner = await enter(game, alice);
    await close(game);
    await game.createRound(STAKE, 10, 600, 300);
    const newWinner = await enter(game, bob);
    await judge(game, agent, oldWinner);
    await game.connect(alice).claimPrize(oldWinner);
    await game.withdrawPlatformFees(1);
    expect(await ethers.provider.getBalance(game.target)).to.equal(STAKE);
    await judge(game, agent, newWinner);
    await close(game, 2n);
    await game.connect(bob).claimPrize(newWinner);
    await game.connect(owner).withdrawPlatformFees(2);
    expect(await ethers.provider.getBalance(game.target)).to.equal(0);
  });

  it("finalization is public and idempotent", async function () {
    const { game, outsider } = await loadFixture(fixture);
    await close(game);
    await expect(game.connect(outsider).finalizeRound(1)).to.emit(game, "RoundFinalized");
    await expect(game.connect(outsider).finalizeRound(1)).not.to.emit(game, "RoundFinalized");
  });

  it("rejects double payouts, another participant's claims, and scored loser refunds", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const a = await enter(game, alice);
    const b = await enter(game, bob);
    await judge(game, agent, a);
    await judge(game, agent, b, 0);
    await close(game);
    await expect(game.connect(bob).claimPrize(a)).to.be.revertedWithCustomError(game, "NotParticipant");
    await expect(game.connect(bob).claimPrize(b)).to.be.revertedWithCustomError(game, "NotWinner");
    await expect(game.connect(bob).claimRefund(b)).to.be.revertedWithCustomError(game, "EntryAlreadyScored");
    await game.connect(alice).claimPrize(a);
    await expect(game.connect(alice).claimPrize(a)).to.be.revertedWithCustomError(game, "AlreadyClaimed");
    await expect(game.connect(alice).claimRefund(a)).to.be.revertedWithCustomError(game, "AlreadyClaimed");
    await game.withdrawPlatformFees(1);
    await expect(game.withdrawPlatformFees(1)).to.be.revertedWithCustomError(game, "FeesAlreadyWithdrawn");
  });

  it("enforces trusted agents, score bounds, evidence, and one score per entry", async function () {
    const { game, alice, agent, outsider } = await loadFixture(fixture);
    const id = await enter(game, alice);
    await expect(judge(game, outsider, id)).to.be.revertedWithCustomError(game, "NotTrustedAgent");
    await expect(judge(game, agent, id, 101)).to.be.revertedWithCustomError(game, "InvalidScore");
    await expect(game.connect(agent).submitVerifiedScore(id, 70, "")).to.be.revertedWithCustomError(game, "InvalidProof");
    await judge(game, agent, id);
    await expect(judge(game, agent, id)).to.be.revertedWithCustomError(game, "EntryAlreadyScored");
    await expect(judge(game, agent, 999)).to.be.revertedWithCustomError(game, "EntryNotFound");
  });

  it("keeps scores at exactly the declared tolerance eligible", async function () {
    const { game, alice, bob, agent } = await loadFixture(fixture);
    const a = await enter(game, alice, 70);
    const b = await enter(game, bob, 70);
    await judge(game, agent, a, 60);
    await judge(game, agent, b, 81);
    expect((await game.getEntry(a)).isWinner).to.equal(true);
    expect((await game.getEntry(b)).isWinner).to.equal(false);
  });

  it("supports multiple projects per wallet and deterministic paginated history", async function () {
    const { game, alice, bob } = await loadFixture(fixture);
    const a = await enter(game, alice, 60, "");
    const b = await enter(game, bob);
    const c = await enter(game, alice);
    expect(await game.getMyEntry(1, alice.address)).to.equal(c);
    expect(await game.getMyEntries(1, alice.address)).to.deep.equal([a, c]);
    const [page, total] = await game.getRoundEntriesPage(1, 1, 1);
    expect(page).to.deep.equal([b]);
    expect(total).to.equal(3);
    expect((await game.getRoundEntriesPage(1, 99, 10))[0]).to.deep.equal([]);
    await expect(game.getRoundEntriesPage(1, 0, 101)).to.be.revertedWithCustomError(game, "InvalidPageSize");
  });

  it("rejects invalid stake amounts, empty repositories, and invalid rounds", async function () {
    const { game, alice } = await loadFixture(fixture);
    await expect(game.connect(alice).enterGame(70, REPO, SITE, { value: STAKE - 1n }))
      .to.be.revertedWithCustomError(game, "WrongStakeAmount").withArgs(STAKE, STAKE - 1n);
    await expect(game.connect(alice).enterGame(70, "", SITE, { value: STAKE }))
      .to.be.revertedWithCustomError(game, "InvalidUrl");
    await expect(game.getEntry(0)).to.be.revertedWithCustomError(game, "EntryNotFound");
    await expect(game.getRound(0)).to.be.revertedWithCustomError(game, "RoundNotFound");
    await expect(game.setTrustedAgent(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(game, "InvalidAgent");
    await expect(alice.sendTransaction({ to: game.target, value: STAKE })).to.be.revertedWith("Use enterGame()");
  });

  it("does not transfer reserved funds from another round when fees are withdrawn first", async function () {
    const { game, owner, alice, bob, agent } = await loadFixture(fixture);
    const a = await enter(game, alice);
    const b = await enter(game, bob);
    await judge(game, agent, a);
    await close(game, 1n, true);
    const fee = STAKE / 20n;
    await expect(game.withdrawPlatformFees(1)).to.changeEtherBalance(owner, fee);
    await expect(game.connect(alice).claimPrize(a)).to.changeEtherBalance(alice, STAKE - fee);
    await expect(game.connect(bob).claimRefund(b)).to.changeEtherBalance(bob, STAKE);
    expect(await ethers.provider.getBalance(game.target)).to.equal(0);
  });

  it("accounts for rounding dust without locking residual ether", async function () {
    const { game, owner, alice, bob, carol, agent } = await loadFixture(fixture);
    await close(game);
    const stake = STAKE + 7n;
    await game.createRound(stake, 10, 100, 100);
    const ids = [];
    for (const signer of [alice, bob, carol]) {
      await game.connect(signer).enterGame(70, REPO, SITE, { value: stake });
      ids.push(await game.entryCounter());
    }
    for (const id of ids) await judge(game, agent, id);
    await close(game, 2n);
    const [ready, share, fee] = await game.previewSettlement(2);
    expect(ready).to.equal(true);
    expect(share * 3n + fee).to.equal(stake * 3n);
    for (const [index, signer] of [alice, bob, carol].entries()) {
      await game.connect(signer).claimPrize(ids[index]);
    }
    await game.connect(owner).withdrawPlatformFees(2);
    expect(await ethers.provider.getBalance(game.target)).to.equal(0);
  });

  it("rolls back failed prize transfers so the receiver can retry", async function () {
    const { game, agent } = await loadFixture(fixture);
    const receiver = await ethers.deployContract("PaymentReceiver", [game.target]);
    await receiver.enter({ value: STAKE });
    const id = await game.entryCounter();
    await judge(game, agent, id);
    await close(game);
    await receiver.configure(true, false);
    await expect(receiver.claim(id)).to.be.revertedWithCustomError(game, "TransferFailed");
    expect((await game.getEntry(id)).claimed).to.equal(false);
    expect((await game.getSettlement(1)).finalized).to.equal(false);
    expect(await ethers.provider.getBalance(game.target)).to.equal(STAKE);
    await receiver.configure(false, false);
    await expect(receiver.claim(id)).to.changeEtherBalance(receiver, STAKE * 95n / 100n);
    expect((await game.getEntry(id)).claimed).to.equal(true);
  });

  it("blocks recursive prize claims from a receiver without blocking its valid payout", async function () {
    const { game, agent } = await loadFixture(fixture);
    const receiver = await ethers.deployContract("PaymentReceiver", [game.target]);
    await receiver.enter({ value: STAKE });
    const id = await game.entryCounter();
    await judge(game, agent, id);
    await close(game);
    await receiver.configure(false, true);
    await expect(receiver.claim(id)).to.changeEtherBalance(receiver, STAKE * 95n / 100n);
    expect(await receiver.reentryBlocked()).to.equal(true);
    expect((await game.getSettlement(1)).claimedWinners).to.equal(1);
    expect(await ethers.provider.getBalance(game.target)).to.equal(STAKE / 20n);
  });

  it("rolls back rejected refunds and permits the full refund on retry", async function () {
    const { game } = await loadFixture(fixture);
    const receiver = await ethers.deployContract("PaymentReceiver", [game.target]);
    await receiver.enter({ value: STAKE });
    const id = await game.entryCounter();
    await close(game, 1n, true);
    await receiver.configure(true, false);
    await expect(receiver.refund(id)).to.be.revertedWithCustomError(game, "TransferFailed");
    expect((await game.getEntry(id)).claimed).to.equal(false);
    expect((await game.getRound(1)).totalPool).to.equal(STAKE);
    await receiver.configure(false, false);
    await expect(receiver.refund(id)).to.changeEtherBalance(receiver, STAKE);
    expect(await ethers.provider.getBalance(game.target)).to.equal(0);
  });

});
