"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Zap,
  Wallet,
  Target,
  Code2,
  Eye,
  Trophy,
  ArrowRight,
  Shield,
  Bot,
  ChevronRight,
} from "lucide-react";
import { useCurrentRoundId, useRound, useRoundEntryIds, formatEthValue, getRoundStatus } from "@/lib/hooks";
import { useWallet } from "@/context/WalletContext";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import CountdownTimer from "@/components/CountdownTimer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

export default function HomePage() {
  const { isConnected } = useWallet();
  const { data: roundId } = useCurrentRoundId();
  const { data: round } = useRound(roundId);
  const { data: entryIds } = useRoundEntryIds(roundId);

  const status = getRoundStatus(round);
  const hasActiveRound = round && round.id > 0n;

  return (
    <div>
      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section
        style={{
          position: "relative",
          padding: "120px 24px 80px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        {/* Animated orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity }}
          style={{
            position: "absolute",
            top: -100,
            left: "20%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          style={{
            position: "absolute",
            top: 0,
            right: "15%",
            width: 350,
            height: 350,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          style={{ position: "relative", zIndex: 2, maxWidth: 800, margin: "0 auto" }}
        >
          {/* Badge */}
          <motion.div variants={fadeUp} style={{ marginBottom: 24 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderRadius: 20,
                color: "var(--accent-cyan)",
                background: "var(--accent-cyan-dim)",
                border: "1px solid var(--border-accent)",
              }}
            >
              <Zap size={12} />
              Ethereum-Powered • AI-Verified
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={fadeUp}
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(36px, 7vw, 72px)",
              fontWeight: 900,
              lineHeight: 1.05,
              marginBottom: 20,
              letterSpacing: "-0.03em",
            }}
          >
            Prove Your Skill.{" "}
            <span className="gradient-text">Win the Pool.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp}
            style={{
              fontSize: "clamp(16px, 2.5vw, 20px)",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              maxWidth: 600,
              margin: "0 auto 40px",
            }}
          >
            Stake ETH, self-declare your project score, and let AI agents verify the truth.
            If your self-assessment matches reality — you win.
          </motion.p>

          {/* CTA */}
          <motion.div
            variants={fadeUp}
            style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}
          >
            {isConnected ? (
              <Link href="/arena">
                <button className="cyber-btn" style={{ fontSize: 16, padding: "14px 32px" }}>
                  <Zap size={18} />
                  Enter the Arena
                  <ArrowRight size={16} />
                </button>
              </Link>
            ) : (
              <ConnectWalletButton
                label="Connect Wallet to Play"
                style={{ fontSize: 16, padding: "14px 32px" }}
              />
            )}
            <a href="#how-it-works">
              <button className="cyber-btn cyber-btn--secondary" style={{ fontSize: 16, padding: "14px 32px" }}>
                How It Works
                <ChevronRight size={16} />
              </button>
            </a>
          </motion.div>
        </motion.div>

        {/* Live round banner */}
        {hasActiveRound && status === "open" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            style={{
              maxWidth: 600,
              margin: "48px auto 0",
              position: "relative",
              zIndex: 2,
            }}
          >
            <div
              className="glass-card animate-pulse-glow"
              style={{
                padding: "20px 28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--accent-emerald)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  🟢 Round #{round.id.toString()} Live
                </div>
                <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  Pool: <strong style={{ color: "var(--accent-cyan)" }}>{formatEthValue(round.totalPool)} ETH</strong>
                  {" • "}
                  {entryIds?.length ?? 0} participants
                </div>
              </div>
              <CountdownTimer
                targetTimestamp={Number(round.endTime)}
                label=""
                size="sm"
              />
            </div>
          </motion.div>
        )}
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section
        id="how-it-works"
        style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 56 }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(28px, 5vw, 42px)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            How It <span className="gradient-text">Works</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 500, margin: "0 auto" }}>
            Four steps to prove your craft and claim the prize pool.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 24,
          }}
        >
          {[
            {
              icon: Wallet,
              step: "01",
              title: "Connect & Stake",
              desc: "Connect your wallet and stake ETH to enter the current round.",
              color: "var(--accent-cyan)",
            },
            {
              icon: Target,
              step: "02",
              title: "Declare Your Score",
              desc: "Honestly rate your project 0-100 across quality, security, and UX.",
              color: "var(--accent-purple)",
            },
            {
              icon: Bot,
              step: "03",
              title: "AI Verification",
              desc: "Our AI agents clone your repo, browse your site, and compute a real score.",
              color: "var(--accent-amber)",
            },
            {
              icon: Trophy,
              step: "04",
              title: "Claim Your Prize",
              desc: "If your self-score matches the AI's verdict within tolerance, you win!",
              color: "var(--accent-emerald)",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                variants={fadeUp}
                className="glass-card"
                style={{
                  padding: 28,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    fontFamily: "var(--font-heading)",
                    fontSize: 48,
                    fontWeight: 900,
                    color: item.color,
                    opacity: 0.08,
                    lineHeight: 1,
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: `${item.color}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  <Icon size={22} color={item.color} />
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ─── GAME MECHANICS ──────────────────────────────────────── */}
      <section style={{ padding: "40px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(28px, 5vw, 42px)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            The <span className="gradient-text">Scoring Engine</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 550, margin: "0 auto" }}>
            Three AI agents work together to produce your verified score.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}
        >
          {[
            {
              icon: Code2,
              title: "Code Review Agent",
              features: ["Static analysis (Semgrep, SonarQube)", "Architecture & best practices", "Plagiarism & originality check", "Dependency vulnerability scan"],
              color: "var(--accent-cyan)",
            },
            {
              icon: Eye,
              title: "Browser Agent",
              features: ["Live site navigation & testing", "Broken link detection", "Responsive design checks", "Visual quality & UX scoring"],
              color: "var(--accent-purple)",
            },
            {
              icon: Shield,
              title: "Security Agent",
              features: ["OWASP Top 10 vulnerability scan", "XSS & injection testing", "Form & API fuzzing", "Performance benchmarking"],
              color: "var(--accent-pink)",
            },
          ].map((agent) => {
            const Icon = agent.icon;
            return (
              <motion.div
                key={agent.title}
                variants={fadeUp}
                className="glass-card"
                style={{ padding: 28 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${agent.color}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={20} color={agent.color} />
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 17,
                      fontWeight: 700,
                    }}
                  >
                    {agent.title}
                  </h3>
                </div>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {agent.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: agent.color,
                          flexShrink: 0,
                        }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ─── CTA BANNER ──────────────────────────────────────────── */}
      <section style={{ padding: "0 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          style={{
            padding: "48px 40px",
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(139,92,246,0.1) 50%, rgba(244,63,94,0.1) 100%)",
            border: "1px solid var(--border-accent)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
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
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(24px, 4vw, 36px)",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            Ready to Test Your{" "}
            <span className="gradient-text">Self-Awareness?</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 500, margin: "0 auto 28px" }}>
            The truest measure of skill is knowing exactly how good you are. Enter the arena and prove it.
          </p>
          <Link href="/arena">
            <button className="cyber-btn" style={{ fontSize: 16, padding: "14px 36px" }}>
              <Zap size={18} />
              Enter the Arena
              <ArrowRight size={16} />
            </button>
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
