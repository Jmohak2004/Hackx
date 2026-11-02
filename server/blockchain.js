const { ethers } = require("ethers");
const { abi: GAME_ABI } = require("./game-artifact.json");
const { AppError, uintId } = require("./lib/errors");

function createBlockchain(options = {}) {
  const CHAIN_ID = Number(options.chainId || process.env.CHAIN_ID || 11155111);
  if (![11155111, 31337].includes(CHAIN_ID)) throw new Error("Only Sepolia or a local development chain is supported");
  const configuredAddress = options.address || process.env.GAME_CONTRACT_ADDRESS ||
    "0xc2df02602efd8e4459064bb752c8bd1da0f8d6a8";
  if (!ethers.isAddress(configuredAddress)) throw new Error("GAME_CONTRACT_ADDRESS is invalid");
  const CONTRACT_ADDRESS = configuredAddress.toLowerCase();
  const rpcUrl = options.rpcUrl || process.env.RPC_URL || process.env.SEPOLIA_RPC_URL ||
    (CHAIN_ID === 31337 ? "http://127.0.0.1:8545" : "https://ethereum-sepolia-rpc.publicnode.com");
  let provider = options.provider;
  let readContract;
  let wallet;
  let nonceManager;
  let versionPromise;
  let transactionQueue = Promise.resolve();
  const leaderboardCache = new Map();

  function getProvider() {
    provider ||= new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 20 });
    return provider;
  }

  function contract() {
    readContract ||= new ethers.Contract(CONTRACT_ADDRESS, GAME_ABI, getProvider());
    return readContract;
  }

  function agentWallet() {
    const key = options.privateKey || process.env.AGENT_PRIVATE_KEY;
    if (!key) throw new AppError(503, "AGENT_NOT_CONFIGURED", "The scoring wallet is not configured");
    wallet ||= new ethers.Wallet(key, getProvider());
    return wallet;
  }

  async function getVersion() {
    versionPromise ||= contract().VERSION().then(Number).catch((error) => {
      if (error.code === "CALL_EXCEPTION" || error.code === "BAD_DATA") return 1;
      versionPromise = undefined;
      throw error;
    });
    return versionPromise;
  }

  async function chainTimestamp() {
    const block = await getProvider().getBlock("latest");
    if (!block) throw new AppError(502, "RPC_UNAVAILABLE", "Latest chain block was not found");
    return block.timestamp;
  }

  async function getRound(roundId) {
    roundId = uintId(String(roundId), "roundId");
    let round;
    try { round = await contract().getRound(BigInt(roundId)); } catch (error) {
      if (error.code === "CALL_EXCEPTION") throw new AppError(404, "ROUND_NOT_FOUND", "Round was not found");
      throw error;
    }
    const [now, paused] = await Promise.all([chainTimestamp(), contract().paused()]);
    if (round.id === 0n) throw new AppError(404, "ROUND_NOT_FOUND", "Round was not found");
    const endTime = Number(round.endTime);
    const judgingDeadline = Number(round.judgingDeadline);
    return {
      id: round.id.toString(), startTime: Number(round.startTime), endTime, judgingDeadline,
      stakeAmount: round.stakeAmount.toString(), stakeAmountEth: ethers.formatEther(round.stakeAmount),
      scoreTolerance: Number(round.scoreTolerance), totalPool: round.totalPool.toString(),
      totalPoolEth: ethers.formatEther(round.totalPool),
      platformFeePool: round.platformFeePool.toString(),
      winnersCount: Number(round.winnersCount), isActive: round.isActive,
      feesWithdrawn: round.feesWithdrawn, chainTimestamp: now,
      paused, isOpen: round.isActive && now < endTime && !paused,
      phase: now < endTime && round.isActive ? (paused ? "paused" : "open") : now <= judgingDeadline && round.isActive ? "judging" : "complete",
    };
  }

  async function getCurrentRound() {
    const id = await contract().currentRoundId();
    return id === 0n ? null : getRound(id);
  }

  async function getRounds(limit = 20) {
    const current = await contract().currentRoundId();
    const ids = [];
    for (let id = current; id > 0n && ids.length < limit; id--) ids.push(id);
    return Promise.all(ids.map(getRound));
  }

  async function getEntry(entryId) {
    entryId = uintId(String(entryId));
    let entry;
    try { entry = await contract().getEntry(BigInt(entryId)); } catch (error) {
      if (error.code === "CALL_EXCEPTION") throw new AppError(404, "ENTRY_NOT_FOUND", "Entry was not found");
      throw error;
    }
    if (entry.participant === ethers.ZeroAddress) throw new AppError(404, "ENTRY_NOT_FOUND", "Entry was not found");
    return {
      id: entryId, participant: entry.participant, roundId: entry.roundId.toString(),
      selfScore: Number(entry.selfScore), verifiedScore: Number(entry.verifiedScore),
      githubUrl: entry.githubUrl, websiteUrl: entry.websiteUrl, proofIpfsHash: entry.proofIpfsHash,
      scored: entry.scored, claimed: entry.claimed, isWinner: entry.isWinner,
      contractVersion: await getVersion(),
    };
  }

  async function getEntryState(entryId) {
    const entry = await getEntry(entryId);
    const round = await getRound(entry.roundId);
    let settlement = null;
    let canClaimPrize = false;
    let canClaimRefund = false;
    let claimAmount = "0";
    if (entry.contractVersion >= 2) {
      const preview = await contract().previewSettlement(BigInt(entry.roundId));
      settlement = {
        ready: preview.ready, winnerShare: preview.winnerShare.toString(),
        platformFee: preview.fee.toString(), refundAll: preview.refundAll,
      };
      canClaimPrize = !entry.claimed && preview.ready && entry.scored && entry.isWinner;
      canClaimRefund = !entry.claimed && preview.ready && (preview.refundAll || !entry.scored);
      claimAmount = canClaimPrize ? preview.winnerShare.toString() : canClaimRefund ? round.stakeAmount : "0";
    } else {
      // Legacy deployments remain readable. They do not enforce safe prize
      // settlement, so this app only offers their expired unjudged refunds.
      canClaimRefund = !entry.claimed && !entry.scored && round.chainTimestamp > round.judgingDeadline;
      if (canClaimRefund) claimAmount = round.stakeAmount;
    }
    return { entry, round, settlement, canClaimPrize, canClaimRefund, claimAmount };
  }

  async function getEntries(roundId, { offset = 0, limit = 20, participant } = {}) {
    roundId = uintId(String(roundId), "roundId");
    let ids;
    let total;
    if (participant) {
      if (!ethers.isAddress(participant)) throw new AppError(400, "INVALID_ADDRESS", "Participant address is invalid");
      const all = await contract().getMyEntries(BigInt(roundId), participant);
      total = all.length;
      ids = [...all].reverse().slice(offset, offset + limit);
    } else if (await getVersion() >= 2) {
      // Contract pages are ascending. The UI can paginate without fetching the
      // complete entry array or making an unbounded batch of RPC requests.
      const page = await contract().getRoundEntriesPage(BigInt(roundId), BigInt(offset), BigInt(limit));
      ids = page.page;
      total = Number(page.total);
    } else {
      const all = await contract().getRoundEntries(BigInt(roundId));
      total = all.length;
      ids = all.slice(offset, offset + limit);
    }
    const entries = [];
    for (let index = 0; index < ids.length; index += 6) {
      entries.push(...await Promise.all(ids.slice(index, index + 6).map(getEntry)));
    }
    return { entries, total, offset, limit };
  }

  async function getEntryIdForParticipant(roundId, participant) {
    if (!ethers.isAddress(participant)) throw new AppError(400, "INVALID_ADDRESS", "Participant address is invalid");
    return (await contract().getMyEntry(BigInt(uintId(String(roundId), "roundId")), participant)).toString();
  }

  async function getLeaderboard(roundId, { offset = 0, limit = 20 } = {}) {
    roundId = uintId(String(roundId), "roundId");
    let cached = leaderboardCache.get(roundId);
    if (!cached || cached.expiresAt < Date.now()) {
      const first = await getEntries(roundId, { offset: 0, limit: 100 });
      if (first.total > 5000) {
        throw new AppError(422, "LEADERBOARD_LIMIT", "This round exceeds the 5,000-entry leaderboard limit");
      }
      const entries = [...first.entries];
      for (let start = 100; start < first.total; start += 300) {
        const pages = [];
        for (let page = start; page < Math.min(start + 300, first.total); page += 100) {
          pages.push(getEntries(roundId, { offset: page, limit: 100 }));
        }
        for (const page of await Promise.all(pages)) entries.push(...page.entries);
      }
      entries.sort((a, b) => Number(b.scored) - Number(a.scored) ||
        b.verifiedScore - a.verifiedScore ||
        Math.abs(a.selfScore - a.verifiedScore) - Math.abs(b.selfScore - b.verifiedScore) ||
        (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      cached = { expiresAt: Date.now() + 10_000, entries };
      leaderboardCache.set(roundId, cached);
      if (leaderboardCache.size > 50) leaderboardCache.delete(leaderboardCache.keys().next().value);
    }
    return {
      total: cached.entries.length, offset, limit,
      entries: cached.entries.slice(offset, offset + limit).map((entry, index) => ({
        ...entry, rank: entry.scored ? offset + index + 1 : null,
      })),
    };
  }

  async function getAgentAddress() { return agentWallet().address; }
  async function isAgentTrusted() { return contract().trustedAgents(agentWallet().address); }

  async function getReadiness() {
    const [network, code, version] = await Promise.all([
      getProvider().getNetwork(), getProvider().getCode(CONTRACT_ADDRESS), getVersion(),
    ]);
    const details = {
      chainId: Number(network.chainId), expectedChainId: CHAIN_ID,
      contractAddress: CONTRACT_ADDRESS, contractVersion: version, ready: false, reason: "",
    };
    if (Number(network.chainId) !== CHAIN_ID) return { ...details, reason: "The RPC endpoint is on the wrong chain" };
    if (code === "0x") return { ...details, reason: "No contract is deployed at the configured address" };
    if (version < 2) return { ...details, reason: "Deploy the version 2 contract before accepting new stakes" };
    if (!(options.privateKey || process.env.AGENT_PRIVATE_KEY)) {
      return { ...details, reason: "The trusted scoring wallet is not configured" };
    }
    const address = agentWallet().address;
    const [trusted, balance] = await Promise.all([
      contract().trustedAgents(address), getProvider().getBalance(address),
    ]);
    if (!trusted) return { ...details, agentAddress: address, reason: "The scoring wallet is not trusted by this contract" };
    if (balance === 0n) return { ...details, agentAddress: address, reason: "The scoring wallet needs test ETH for transaction gas" };
    return { ...details, agentAddress: address, ready: true, reason: "" };
  }

  function parseScoreReceipt(receipt) {
    if (!receipt || receipt.status !== 1) throw new AppError(502, "SCORE_REVERTED", "Score transaction failed");
    const event = receipt.logs.map((log) => {
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS) return null;
      try { return contract().interface.parseLog(log); } catch { return null; }
    }).find((log) => log?.name === "ScoreVerified");
    if (!event) throw new AppError(502, "MISSING_SCORE_EVENT", "Score transaction contained no verification event");
    return {
      txHash: receipt.hash, blockNumber: receipt.blockNumber,
      entryId: event.args.entryId.toString(), verifiedScore: Number(event.args.verifiedScore),
      isWinner: event.args.isWinner,
    };
  }

  async function waitForScoreTransaction(hash) {
    if (!ethers.isHexString(hash, 32)) throw new AppError(400, "INVALID_TRANSACTION", "Invalid score transaction hash");
    const receipt = await getProvider().waitForTransaction(hash, 1, 180_000);
    return parseScoreReceipt(receipt);
  }

  function submitVerifiedScore(entryId, verifiedScore, proofHash, onBroadcast = async () => {}) {
    const work = async () => {
      entryId = uintId(String(entryId));
      if (!Number.isInteger(verifiedScore) || verifiedScore < 0 || verifiedScore > 100) {
        throw new AppError(400, "INVALID_SCORE", "Verified score must be an integer from 0 to 100");
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(proofHash)) throw new AppError(400, "INVALID_PROOF", "A report digest is required");
      nonceManager ||= new ethers.NonceManager(agentWallet());
      const writer = new ethers.Contract(CONTRACT_ADDRESS, GAME_ABI, nonceManager);
      try {
        await writer.submitVerifiedScore.staticCall(BigInt(entryId), verifiedScore, proofHash);
        const transaction = await writer.submitVerifiedScore(BigInt(entryId), verifiedScore, proofHash);
        await onBroadcast(transaction.hash);
        return parseScoreReceipt(await transaction.wait(1, 180_000));
      } catch (error) {
        nonceManager.reset();
        throw error;
      }
    };
    // Serial signing avoids nonce collisions when separate evaluations finish
    // simultaneously. Evaluation itself remains bounded and concurrent.
    const result = transactionQueue.then(work);
    transactionQueue = result.catch(() => {});
    return result;
  }

  return {
    CHAIN_ID, CONTRACT_ADDRESS, getVersion, getReadiness, getRounds, getRound, getCurrentRound,
    getEntry, getEntryState, getEntries, getLeaderboard, getEntryIdForParticipant, getAgentAddress,
    isAgentTrusted, submitVerifiedScore, waitForScoreTransaction,
    close: () => provider?.destroy?.(),
  };
}

module.exports = { ...createBlockchain(), createBlockchain };
