"use client";

import { motion } from "framer-motion";
import { Users, Coins, Trophy, Zap } from "lucide-react";
import { formatEthValue } from "@/lib/hooks";

interface StatsBarProps {
  totalPool: bigint | undefined;
  participantCount: number;
  winnersCount: bigint | undefined;
  tolerance: bigint | undefined;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function StatsBar({ totalPool, participantCount, winnersCount, tolerance }: StatsBarProps) {
  const stats = [
    {
      icon: Coins,
      label: "Prize Pool",
      value: `${formatEthValue(totalPool)} ETH`,
      color: "var(--accent-cyan)",
      glow: "rgba(6, 182, 212, 0.15)",
    },
    {
      icon: Users,
      label: "Participants",
      value: participantCount.toString(),
      color: "var(--accent-purple)",
      glow: "rgba(139, 92, 246, 0.15)",
    },
    {
      icon: Trophy,
      label: "Winners",
      value: winnersCount?.toString() ?? "0",
      color: "var(--accent-emerald)",
      glow: "rgba(16, 185, 129, 0.15)",
    },
    {
      icon: Zap,
      label: "Tolerance",
      value: `±${tolerance?.toString() ?? "0"} pts`,
      color: "var(--accent-amber)",
      glow: "rgba(245, 158, 11, 0.15)",
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 16,
      }}
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            variants={item}
            className="glass-card"
            style={{
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: stat.glow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={20} color={stat.color} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 2,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 20,
                  fontWeight: 800,
                  color: stat.color,
                }}
              >
                {stat.value}
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
