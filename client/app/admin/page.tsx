"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "@/context/WalletContext";
import { type Address } from "viem";
import {
  Shield,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
  Bot,
  Coins,
  Pause,
  Play,
  Users,
  Hash,
} from "lucide-react";
import {
  useContractOwner,
  useCurrentRoundId,
  useRound,
  useIsPaused,
  useCreateRound,
  useSubmitVerifiedScore,
  useSetTrustedAgent,
  usePauseContract,
  useUnpauseContract,
  useWithdrawFees,
  formatEthValue,
} from "@/lib/hooks";

function TxStatus({ isPending, isConfirming, isSuccess, error }: {
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | null;
}) {
  if (isPending) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-amber)", fontSize: 13, marginTop: 12 }}>
      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Confirm in wallet...
    </div>
  );
  if (isConfirming) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-cyan)", fontSize: 13, marginTop: 12 }}>
      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Confirming on chain...
    </div>
  );
  if (isSuccess) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-emerald)", fontSize: 13, marginTop: 12 }}>
      <CheckCircle size={14} /> Transaction confirmed!
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-pink)", fontSize: 13, marginTop: 12 }}>
      <AlertCircle size={14} /> {(error as Error).message?.slice(0, 80) || "Failed"}
    </div>
  );
  return null;
}

export default function AdminPage() {
  const { address } = useWallet();
  const { data: owner } = useContractOwner();
  const { data: roundId } = useCurrentRoundId();
  const { data: round } = useRound(roundId);
  const { data: isPaused } = useIsPaused();

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase();

  // Create Round
  const [stakeEth, setStakeEth] = useState("0.01");
  const [tolerance, setTolerance] = useState("5");
  const [duration, setDuration] = useState("3600");
  const [judgingBuffer, setJudgingBuffer] = useState("7200");
  const createRound = useCreateRound();

  // Submit Score
  const [scoreEntryId, setScoreEntryId] = useState("");
  const [verifiedScore, setVerifiedScore] = useState("");
  const [proofHash, setProofHash] = useState("");
  const submitScore = useSubmitVerifiedScore();

  // Agent Management
  const [agentAddress, setAgentAddress] = useState("");
  const [agentTrusted, setAgentTrusted] = useState(true);
  const setAgent = useSetTrustedAgent();

  // Pause
  const pauseContract = usePauseContract();
  const unpauseContract = useUnpauseContract();

  // Withdraw
  const [withdrawRoundId, setWithdrawRoundId] = useState("");
  const withdrawFees = useWithdrawFees();

  if (!isOwner) {
    return (
      <div style={{ padding: "120px 24px", textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>🔒</div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
            Access <span className="gradient-text">Denied</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>
            This page is restricted to the contract owner. Connect with the owner wallet to access admin functions.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 24px 80px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Shield size={24} color="var(--accent-cyan)" />
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 5vw, 36px)", fontWeight: 800 }}>
            Admin <span className="gradient-text">Panel</span>
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
          Contract owner controls — manage rounds, scoring, agents, and platform.
        </p>

        {/* Status bar */}
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <div className="badge badge--open" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Hash size={12} /> Round: {roundId?.toString() ?? "0"}
          </div>
          <div className={`badge ${isPaused ? "badge--lost" : "badge--open"}`}>
            {isPaused ? "⏸ Paused" : "▶ Active"}
          </div>
          {round && (
            <div className="badge badge--judging" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Coins size={12} /> Pool: {formatEthValue(round.totalPool)} ETH
            </div>
          )}
        </div>
      </motion.div>

      <div style={{ display: "grid", gap: 24 }}>
        {/* ── CREATE ROUND ─────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={18} color="var(--accent-cyan)" /> Create New Round
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="cyber-label">Stake Amount (ETH) — min 0.01</label>
              <input className="cyber-input" type="number" step="0.001" min="0.01" max="10" value={stakeEth} onChange={(e) => setStakeEth(e.target.value)} placeholder="0.01" />
            </div>
            <div>
              <label className="cyber-label">Score Tolerance (±pts)</label>
              <input className="cyber-input" type="number" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="5" />
            </div>
            <div>
              <label className="cyber-label">Duration (seconds)</label>
              <input className="cyber-input" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="3600" />
            </div>
            <div>
              <label className="cyber-label">Judging Buffer (seconds)</label>
              <input className="cyber-input" type="number" value={judgingBuffer} onChange={(e) => setJudgingBuffer(e.target.value)} placeholder="7200" />
            </div>
          </div>
          <button
            className="cyber-btn"
            onClick={() => createRound.createRound(stakeEth, Number(tolerance), Number(duration), Number(judgingBuffer))}
            disabled={createRound.isPending || createRound.isConfirming}
          >
            {createRound.isPending || createRound.isConfirming ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
            Create Round
          </button>
          <TxStatus isPending={createRound.isPending} isConfirming={createRound.isConfirming} isSuccess={createRound.isSuccess} error={createRound.error} />
        </motion.div>

        {/* ── SUBMIT VERIFIED SCORE ────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={18} color="var(--accent-purple)" /> Submit Verified Score
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="cyber-label">Entry ID</label>
              <input className="cyber-input" type="number" value={scoreEntryId} onChange={(e) => setScoreEntryId(e.target.value)} placeholder="1" />
            </div>
            <div>
              <label className="cyber-label">Verified Score (0-100)</label>
              <input className="cyber-input" type="number" value={verifiedScore} onChange={(e) => setVerifiedScore(e.target.value)} placeholder="85" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="cyber-label">IPFS Proof Hash</label>
              <input className="cyber-input" type="text" value={proofHash} onChange={(e) => setProofHash(e.target.value)} placeholder="QmXyz..." />
            </div>
          </div>
          <button
            className="cyber-btn"
            style={{ background: "var(--accent-purple)" }}
            onClick={() => submitScore.submitScore(BigInt(scoreEntryId || "0"), Number(verifiedScore), proofHash)}
            disabled={submitScore.isPending || submitScore.isConfirming}
          >
            {submitScore.isPending || submitScore.isConfirming ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={16} />}
            Submit Score
          </button>
          <TxStatus isPending={submitScore.isPending} isConfirming={submitScore.isConfirming} isSuccess={submitScore.isSuccess} error={submitScore.error} />
        </motion.div>

        {/* ── AGENT MANAGEMENT ─────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={18} color="var(--accent-emerald)" /> Agent Management
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 20, alignItems: "end" }}>
            <div>
              <label className="cyber-label">Agent Wallet Address</label>
              <input className="cyber-input" type="text" value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} placeholder="0x..." />
            </div>
            <div style={{ display: "flex", gap: 8, paddingBottom: 2 }}>
              <button
                className="cyber-btn cyber-btn--small"
                onClick={() => setAgent.setAgent(agentAddress as Address, true)}
                disabled={setAgent.isPending || setAgent.isConfirming}
              >
                Grant
              </button>
              <button
                className="cyber-btn cyber-btn--danger cyber-btn--small"
                onClick={() => setAgent.setAgent(agentAddress as Address, false)}
                disabled={setAgent.isPending || setAgent.isConfirming}
              >
                Revoke
              </button>
            </div>
          </div>
          <TxStatus isPending={setAgent.isPending} isConfirming={setAgent.isConfirming} isSuccess={setAgent.isSuccess} error={setAgent.error} />
        </motion.div>

        {/* ── PLATFORM CONTROLS ────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          {/* Pause/Unpause */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              {isPaused ? <Play size={18} color="var(--accent-emerald)" /> : <Pause size={18} color="var(--accent-amber)" />}
              Contract State
            </h3>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
              {isPaused
                ? "Contract is currently paused. No new entries or claims can be made."
                : "Contract is active. Pause to halt all operations in an emergency."}
            </p>
            {isPaused ? (
              <>
                <button
                  className="cyber-btn"
                  onClick={() => unpauseContract.unpause()}
                  disabled={unpauseContract.isPending || unpauseContract.isConfirming}
                >
                  <Play size={16} /> Unpause
                </button>
                <TxStatus isPending={unpauseContract.isPending} isConfirming={unpauseContract.isConfirming} isSuccess={unpauseContract.isSuccess} error={unpauseContract.error} />
              </>
            ) : (
              <>
                <button
                  className="cyber-btn cyber-btn--danger"
                  onClick={() => pauseContract.pause()}
                  disabled={pauseContract.isPending || pauseContract.isConfirming}
                >
                  <Pause size={16} /> Pause Contract
                </button>
                <TxStatus isPending={pauseContract.isPending} isConfirming={pauseContract.isConfirming} isSuccess={pauseContract.isSuccess} error={pauseContract.error} />
              </>
            )}
          </motion.div>

          {/* Withdraw Fees */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <Coins size={18} color="var(--accent-amber)" /> Withdraw Platform Fees
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label className="cyber-label">Round ID</label>
              <input className="cyber-input" type="number" value={withdrawRoundId} onChange={(e) => setWithdrawRoundId(e.target.value)} placeholder="1" />
            </div>
            <button
              className="cyber-btn"
              style={{ background: "var(--accent-amber)", color: "var(--bg-primary)" }}
              onClick={() => withdrawFees.withdraw(BigInt(withdrawRoundId || "0"))}
              disabled={withdrawFees.isPending || withdrawFees.isConfirming}
            >
              <Coins size={16} /> Withdraw Fees
            </button>
            <TxStatus isPending={withdrawFees.isPending} isConfirming={withdrawFees.isConfirming} isSuccess={withdrawFees.isSuccess} error={withdrawFees.error} />
          </motion.div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
