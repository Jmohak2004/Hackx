"use client";

import { Zap, Code2, MessageCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "rgba(10, 14, 26, 0.6)",
        backdropFilter: "blur(10px)",
        padding: "48px 24px 32px",
        marginTop: 80,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 40,
            marginBottom: 40,
          }}
        >
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--gradient-hero)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Zap size={16} color="#0a0e1a" />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 16,
                  fontWeight: 800,
                }}
                className="gradient-text"
              >
                LATENT STYLE
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              The trustless AI-verified skill contest. Stake, prove your craft, and let AI agents be the judge.
            </p>
          </div>

          {/* Game */}
          <div>
            <h4
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              Game
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Arena", href: "/arena" },
                { label: "Leaderboard", href: "/leaderboard" },
                { label: "How It Works", href: "/#how-it-works" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  style={{ fontSize: 14, color: "var(--text-muted)", transition: "color 0.2s" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              Resources
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Smart Contract", href: `https://sepolia.etherscan.io/address/0x36a6f630ad2a5b3bd8fad2d4c30aa3e29079de82` },
                { label: "Documentation", href: "#" },
                { label: "Source Code", href: "#" },
              ].map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 14, color: "var(--text-muted)", transition: "color 0.2s" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          {/* Community */}
          <div>
            <h4
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              Community
            </h4>
            <div style={{ display: "flex", gap: 12 }}>
              <a
                href="#"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  transition: "all 0.2s",
                }}
              >
                <Code2 size={18} />
              </a>
              <a
                href="#"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  transition: "all 0.2s",
                }}
              >
                <MessageCircle size={18} />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            © {new Date().getFullYear()} Latent Style Game. Powered by Ethereum.
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Sepolia Testnet • Contract verified on Etherscan
          </p>
        </div>
      </div>
    </footer>
  );
}
