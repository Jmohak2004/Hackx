"use client";

import { motion } from "framer-motion";
import { Shield, Coins, Hash } from "lucide-react";
import { formatEthValue, type RoundData, getRoundStatus } from "@/lib/hooks";
import CountdownTimer from "./CountdownTimer";

interface RoundInfoProps {
  round: RoundData | undefined;
}

export default function RoundInfo({ round }: RoundInfoProps) {
  if (!round || round.id === 0n) {
    return (
      <div
        className="glass-card"
        style={{
          padding: 40,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
        <h3
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          No Active Round
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          The arena is quiet... A new round will begin soon. Stay connected.
        </p>
      </div>
    );
  }

  const status = getRoundStatus(round);
  const statusConfig = {
    open: { label: "Submissions Open", className: "badge badge--open" },
    judging: { label: "AI Judging", className: "badge badge--judging" },
    complete: { label: "Complete", className: "badge badge--complete" },
    none: { label: "None", className: "badge badge--pending" },
  };

  const targetTime =
    status === "open"
      ? Number(round.endTime)
      : status === "judging"
      ? Number(round.judgingDeadline)
      : 0;

  const timerLabel =
    status === "open" ? "Submissions Close In" : status === "judging" ? "Judging Ends In" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{ padding: 28, position: "relative", overflow: "hidden" }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "var(--gradient-hero)",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Hash size={16} color="var(--accent-cyan)" />
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              Round {round.id.toString()}
            </span>
          </div>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            {status === "open" ? "Enter the Arena" : status === "judging" ? "AI Agents Judging..." : "Round Complete"}
          </h3>
        </div>
        <span className={statusConfig[status].className}>{statusConfig[status].label}</span>
      </div>

      {/* Timer */}
      {targetTime > 0 && (
        <div style={{ marginBottom: 24 }}>
          <CountdownTimer targetTimestamp={targetTime} label={timerLabel} size="md" />
        </div>
      )}

      {/* Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            padding: 16,
            background: "rgba(0,0,0,0.2)",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <Coins size={16} color="var(--accent-cyan)" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Stake Required
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 800, color: "var(--accent-cyan)" }}>
            {formatEthValue(round.stakeAmount)} ETH
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: "rgba(0,0,0,0.2)",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <Shield size={16} color="var(--accent-purple)" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Tolerance
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 800, color: "var(--accent-purple)" }}>
            ±{round.scoreTolerance.toString()} pts
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: "rgba(0,0,0,0.2)",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <Coins size={16} color="var(--accent-emerald)" style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Total Pool
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 800, color: "var(--accent-emerald)" }}>
            {formatEthValue(round.totalPool)} ETH
          </div>
        </div>
      </div>
    </motion.div>
  );
}
