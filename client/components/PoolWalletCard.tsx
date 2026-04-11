"use client";

import { motion } from "framer-motion";
import { Wallet, ExternalLink, Coins, Trophy, Shield } from "lucide-react";
import { GAME_CONTRACT_ADDRESS } from "@/lib/contract";
import { usePrizePool, useWinnerShare, formatEthValue, truncateAddress } from "@/lib/hooks";

interface PoolWalletCardProps {
  roundId: bigint | undefined;
  winnersCount: bigint | undefined;
  stakeAmount: bigint | undefined;
}

export default function PoolWalletCard({
  roundId,
  winnersCount,
  stakeAmount,
}: PoolWalletCardProps) {
  const { data: prizePoolRaw } = usePrizePool(roundId);
  const { data: winnerShare } = useWinnerShare(roundId);

  // getPrizePool returns (gross, net, fee) — treat as readonly tuple
  const pool = prizePoolRaw as readonly [bigint, bigint, bigint] | undefined;
  const gross = pool?.[0] ?? 0n;
  const net = pool?.[1] ?? 0n;
  const fee = pool?.[2] ?? 0n;

  const explorerUrl = `https://sepolia.etherscan.io/address/${GAME_CONTRACT_ADDRESS}`;
  const hasWinners = winnersCount !== undefined && winnersCount > 0n;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card"
      style={{ padding: 24 }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(6, 182, 212, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wallet size={18} color="var(--accent-cyan)" />
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Pool Wallet
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Smart Contract Treasury
            </div>
          </div>
        </div>

        {/* Contract address → Etherscan link */}
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: "1px solid var(--border-accent)",
            color: "var(--accent-cyan)",
            transition: "all 0.2s",
            fontFamily: "monospace",
          }}
        >
          {truncateAddress(GAME_CONTRACT_ADDRESS)}
          <ExternalLink size={11} />
        </a>
      </div>

      {/* ── Prize Breakdown Grid ────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`,
          gap: 10,
          marginBottom: 14,
        }}
      >
        {/* Gross pool */}
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <Coins size={14} color="var(--accent-cyan)" style={{ marginBottom: 4 }} />
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 3,
            }}
          >
            Gross Pool
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent-cyan)",
            }}
          >
            {formatEthValue(gross)} ETH
          </div>
        </div>

        {/* Net prize to winners */}
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <Trophy size={14} color="var(--accent-emerald)" style={{ marginBottom: 4 }} />
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 3,
            }}
          >
            Winners Get
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent-emerald)",
            }}
          >
            {formatEthValue(net)} ETH
          </div>
        </div>

        {/* Platform fee */}
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            textAlign: "center",
          }}
        >
          <Shield size={14} color="var(--accent-amber)" style={{ marginBottom: 4 }} />
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 3,
            }}
          >
            Platform Fee
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 800,
              color: "var(--accent-amber)",
            }}
          >
            {formatEthValue(fee)} ETH
          </div>
        </div>

        {/* Per winner share — only visible when winners are determined */}
        {hasWinners && winnerShare !== undefined && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(139, 92, 246, 0.08)",
              borderRadius: 10,
              border: "1px solid rgba(139, 92, 246, 0.25)",
              textAlign: "center",
            }}
          >
            <Trophy size={14} color="var(--accent-purple)" style={{ marginBottom: 4 }} />
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 3,
              }}
            >
              Per Winner
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 16,
                fontWeight: 800,
                color: "var(--accent-purple)",
              }}
            >
              {formatEthValue(winnerShare as bigint)} ETH
            </div>
          </div>
        )}

        {/* Entry stake — shown when round is active */}
        {stakeAmount !== undefined && stakeAmount > 0n && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(6, 182, 212, 0.06)",
              borderRadius: 10,
              border: "1px solid var(--border-accent)",
              textAlign: "center",
            }}
          >
            <Coins size={14} color="var(--accent-cyan)" style={{ marginBottom: 4 }} />
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 3,
              }}
            >
              Entry Stake
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 16,
                fontWeight: 800,
                color: "var(--accent-cyan)",
              }}
            >
              {formatEthValue(stakeAmount)} ETH
            </div>
          </div>
        )}
      </div>

      {/* ── Trust note ─────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(6, 182, 212, 0.04)",
          border: "1px solid var(--border-subtle)",
          fontSize: 12,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "var(--accent-cyan)", fontWeight: 700, flexShrink: 0 }}>🔒</span>
        <span>
          All staked ETH is held by the smart contract — no centralized custody.
          Funds are distributed on-chain when winners claim their prizes.{" "}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-cyan)", fontWeight: 600 }}
          >
            Verify on Etherscan
          </a>
        </span>
      </div>
    </motion.div>
  );
}
