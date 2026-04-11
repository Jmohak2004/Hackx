"use client";

import { motion } from "framer-motion";
import { ExternalLink, Check, Clock, Code2, Globe } from "lucide-react";
import type { EntryData } from "@/lib/hooks";
import { truncateAddress } from "@/lib/hooks";

interface EntryCardProps {
  entry: EntryData;
  entryId: bigint;
  rank?: number;
  showActions?: boolean;
  onClaimPrize?: () => void;
  onClaimRefund?: () => void;
  isClaimPending?: boolean;
}

export default function EntryCard({
  entry,
  entryId,
  rank,
  showActions = false,
  onClaimPrize,
  onClaimRefund,
  isClaimPending = false,
}: EntryCardProps) {
  const statusBadge = entry.scored
    ? entry.isWinner
      ? { label: "Winner", className: "badge badge--winner" }
      : { label: "Lost", className: "badge badge--lost" }
    : { label: "Pending", className: "badge badge--pending" };

  const scoreDiff = entry.scored
    ? Math.abs(Number(entry.selfScore) - Number(entry.verifiedScore))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{ padding: 24, position: "relative", overflow: "hidden" }}
    >
      {/* Winner glow effect */}
      {entry.isWinner && entry.scored && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "var(--gradient-hero)",
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {rank && (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: rank <= 3 ? "var(--gradient-hero)" : "var(--bg-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 14,
                color: rank <= 3 ? "var(--bg-primary)" : "var(--text-muted)",
              }}
            >
              #{rank}
            </div>
          )}
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 15 }}>
              {truncateAddress(entry.participant)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Entry #{entryId.toString()}
            </div>
          </div>
        </div>
        <span className={statusBadge.className}>{statusBadge.label}</span>
      </div>

      {/* Scores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: entry.scored ? "1fr 1fr 1fr" : "1fr",
          gap: 16,
          marginBottom: 16,
          padding: 16,
          background: "rgba(0,0,0,0.2)",
          borderRadius: 12,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
            Self Score
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 900, color: "var(--accent-cyan)" }}>
            {entry.selfScore.toString()}
          </div>
        </div>
        {entry.scored && (
          <>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                AI Score
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 900, color: "var(--accent-purple)" }}>
                {entry.verifiedScore.toString()}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                Difference
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 28,
                  fontWeight: 900,
                  color: entry.isWinner ? "var(--accent-emerald)" : "var(--accent-pink)",
                }}
              >
                ±{scoreDiff}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: 8, marginBottom: showActions ? 16 : 0, flexWrap: "wrap" }}>
        <a
          href={entry.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            transition: "all 0.2s",
          }}
        >
          <Code2 size={14} /> GitHub <ExternalLink size={10} />
        </a>
        <a
          href={entry.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 8,
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            transition: "all 0.2s",
          }}
        >
          <Globe size={14} /> Website <ExternalLink size={10} />
        </a>
        {entry.proofIpfsHash && (
          <a
            href={`https://ipfs.io/ipfs/${entry.proofIpfsHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 8,
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              transition: "all 0.2s",
            }}
          >
            📄 Proof <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div style={{ display: "flex", gap: 8 }}>
          {entry.isWinner && !entry.claimed && (
            <button
              className="cyber-btn cyber-btn--small"
              onClick={onClaimPrize}
              disabled={isClaimPending}
              style={{ flex: 1 }}
            >
              {isClaimPending ? "Claiming..." : "🏆 Claim Prize"}
            </button>
          )}
          {!entry.scored && (
            <button
              className="cyber-btn cyber-btn--secondary cyber-btn--small"
              onClick={onClaimRefund}
              disabled={isClaimPending}
              style={{ flex: 1 }}
            >
              {isClaimPending ? "Processing..." : "Claim Refund"}
            </button>
          )}
          {entry.claimed && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-emerald)", fontSize: 13, fontWeight: 600 }}>
              <Check size={16} /> Claimed
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
