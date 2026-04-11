"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/context/WalletContext";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import {
  Swords,
  Code2,
  Globe,
  Send,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import {
  useCurrentRoundId,
  useRound,
  useMyEntryId,
  useEntry,
  useRoundEntryIds,
  useEnterGame,
  useClaimPrize,
  useClaimRefund,
  getRoundStatus,
  formatEthValue,
  type RoundData,
} from "@/lib/hooks";
import RoundInfo from "@/components/RoundInfo";
import StatsBar from "@/components/StatsBar";
import ScoreSlider from "@/components/ScoreSlider";
import EntryCard from "@/components/EntryCard";
import PoolWalletCard from "@/components/PoolWalletCard";

export default function ArenaPage() {
  const { isConnected } = useWallet();
  const { data: roundId } = useCurrentRoundId();
  const { data: round } = useRound(roundId);
  const { data: entryIds } = useRoundEntryIds(roundId);
  const { data: myEntryId, refetch: refetchMyEntry } = useMyEntryId(roundId);
  const { data: myEntry, refetch: refetchEntry } = useEntry(myEntryId && myEntryId > 0n ? myEntryId : undefined);

  const hasEntered = myEntryId !== undefined && myEntryId > 0n;
  const status = getRoundStatus(round);

  // Entry form state
  const [selfScore, setSelfScore] = useState(50);
  const [githubUrl, setGithubUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [formError, setFormError] = useState("");

  const { enterGame, isPending: enterPending, isConfirming: enterConfirming, isSuccess: enterSuccess, error: enterError } = useEnterGame();
  const { claimPrize, isPending: claimPending, isConfirming: claimConfirming, isSuccess: claimSuccess } = useClaimPrize();
  const { claimRefund, isPending: refundPending, isConfirming: refundConfirming, isSuccess: refundSuccess } = useClaimRefund();

  // Refetch after successful entry
  useEffect(() => {
    if (enterSuccess) {
      refetchMyEntry();
      setTimeout(() => refetchEntry(), 2000);
    }
  }, [enterSuccess, refetchMyEntry, refetchEntry]);

  const handleSubmit = () => {
    setFormError("");
    if (!githubUrl.trim()) {
      setFormError("GitHub URL is required.");
      return;
    }
    if (!websiteUrl.trim()) {
      setFormError("Website URL is required.");
      return;
    }
    if (!round) return;
    enterGame(selfScore, githubUrl, websiteUrl, round.stakeAmount);
  };

  // ─── NOT CONNECTED ──────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ padding: "120px 24px", textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ fontSize: 64, marginBottom: 24 }}>⚔️</div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 36,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            The <span className="gradient-text">Arena</span> Awaits
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 32 }}>
            Connect your wallet to enter the game and compete for the prize pool.
          </p>
          <ConnectWalletButton
            label="Connect Wallet"
            style={{ fontSize: 16, padding: "14px 32px" }}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 32 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Swords size={24} color="var(--accent-cyan)" />
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(28px, 5vw, 36px)",
              fontWeight: 800,
            }}
          >
            Game <span className="gradient-text">Arena</span>
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
          Enter the current round, submit your project, and let AI judge your skills.
        </p>
      </motion.div>

      {/* Stats Bar */}
      <div style={{ marginBottom: 20 }}>
        <StatsBar
          totalPool={round?.totalPool}
          participantCount={entryIds?.length ?? 0}
          winnersCount={round?.winnersCount}
          tolerance={round?.scoreTolerance}
        />
      </div>

      {/* Pool Wallet — shows where staked ETH lives + prize breakdown */}
      <div style={{ marginBottom: 32 }}>
        <PoolWalletCard
          roundId={roundId}
          winnersCount={round?.winnersCount}
          stakeAmount={round?.stakeAmount}
        />
      </div>

      {/* Main Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
          gap: 24,
          alignItems: "start",
        }}
        className="arena-grid"
      >
        {/* Left: Round Info */}
        <RoundInfo round={round as RoundData | undefined} />

        {/* Right: Entry Form or My Entry */}
        <div>
          <AnimatePresence mode="wait">
            {hasEntered && myEntry ? (
              /* ─── MY ENTRY ───────────────────────────── */
              <motion.div
                key="my-entry"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div style={{ marginBottom: 16 }}>
                  <h2
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 20,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CheckCircle size={20} color="var(--accent-emerald)" />
                    Your Entry
                  </h2>
                </div>
                <EntryCard
                  entry={myEntry}
                  entryId={myEntryId!}
                  showActions
                  onClaimPrize={() => claimPrize(myEntryId!)}
                  onClaimRefund={() => claimRefund(myEntryId!)}
                  isClaimPending={claimPending || claimConfirming || refundPending || refundConfirming}
                />
                {(claimSuccess || refundSuccess) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: 12,
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "var(--accent-emerald)",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CheckCircle size={16} />
                    Transaction confirmed!
                  </motion.div>
                )}
              </motion.div>
            ) : status === "open" ? (
              /* ─── ENTRY FORM ─────────────────────────── */
              <motion.div
                key="entry-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass-card"
                style={{ padding: 28 }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: 20,
                    fontWeight: 700,
                    marginBottom: 24,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Send size={20} color="var(--accent-cyan)" />
                  Submit Your Entry
                </h2>

                {/* Score Slider */}
                <div style={{ marginBottom: 28 }}>
                  <ScoreSlider value={selfScore} onChange={setSelfScore} />
                </div>

                {/* GitHub URL */}
                <div style={{ marginBottom: 20 }}>
                  <label className="cyber-label">
                    <Code2 size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                    GitHub Repository URL
                  </label>
                  <input
                    type="url"
                    className="cyber-input"
                    placeholder="https://github.com/your-username/your-repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                </div>

                {/* Website URL */}
                <div style={{ marginBottom: 28 }}>
                  <label className="cyber-label">
                    <Globe size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                    Live Website URL
                  </label>
                  <input
                    type="url"
                    className="cyber-input"
                    placeholder="https://your-project.vercel.app"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                </div>

                {/* Stake Info */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "rgba(6, 182, 212, 0.05)",
                    border: "1px solid var(--accent-cyan-dim)",
                    marginBottom: 20,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Stake Amount</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: "var(--accent-cyan)" }}>
                    {formatEthValue(round?.stakeAmount)} ETH
                  </span>
                </div>

                {/* Error */}
                {(formError || enterError) && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(244, 63, 94, 0.1)",
                      border: "1px solid rgba(244, 63, 94, 0.3)",
                      color: "var(--accent-pink)",
                      fontSize: 13,
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <AlertCircle size={16} />
                    {formError || (enterError as Error)?.message?.slice(0, 100) || "Transaction failed"}
                  </div>
                )}

                {/* Success */}
                {enterSuccess && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "var(--accent-emerald)",
                      fontSize: 13,
                      marginBottom: 16,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CheckCircle size={16} />
                    Entry submitted! AI agents are reviewing your project.
                  </div>
                )}

                {/* Submit */}
                <button
                  className="cyber-btn"
                  onClick={handleSubmit}
                  disabled={enterPending || enterConfirming}
                  style={{ width: "100%", fontSize: 15, padding: "14px 24px" }}
                >
                  {enterPending || enterConfirming ? (
                    <>
                      <Loader2 size={18} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                      {enterPending ? "Confirm in Wallet..." : "Confirming on Chain..."}
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Stake & Submit Entry
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </motion.div>
            ) : (
              /* ─── ROUND NOT OPEN ──────────────────────── */
              <motion.div
                key="not-open"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card"
                style={{ padding: 40, textAlign: "center" }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>
                  {status === "judging" ? "🤖" : status === "complete" ? "🏁" : "⏳"}
                </div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  {status === "judging"
                    ? "AI Agents are Judging"
                    : status === "complete"
                    ? "Round Complete"
                    : "No Active Round"}
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                  {status === "judging"
                    ? "Scores are being verified. Check back soon for results!"
                    : status === "complete"
                    ? "This round has ended. Winners can claim prizes."
                    : "Waiting for the next round to begin..."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .arena-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
