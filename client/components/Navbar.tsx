"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useContractOwner } from "@/lib/hooks";
import ConnectWalletButton from "./ConnectWalletButton";
import { Zap, Swords, Trophy, Shield, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: Zap },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function Navbar() {
  const pathname = usePathname();
  const { address } = useWallet();
  const { data: owner } = useContractOwner();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isOwner =
    address && owner && address.toLowerCase() === owner.toLowerCase();

  const allLinks = isOwner
    ? [...NAV_LINKS, { href: "/admin", label: "Admin", icon: Shield }]
    : NAV_LINKS;

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(10, 14, 26, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--gradient-hero)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-cyan)",
            }}
          >
            <Zap size={20} color="#0a0e1a" strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
            className="gradient-text"
          >
            LATENT STYLE
          </span>
        </Link>

        {/* Desktop Nav */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 8 }}
          className="desktop-nav"
        >
          {allLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  color: active ? "var(--accent-cyan)" : "var(--text-secondary)",
                  background: active ? "var(--accent-cyan-dim)" : "transparent",
                  border: active
                    ? "1px solid var(--border-accent)"
                    : "1px solid transparent",
                  transition: "all 0.2s ease",
                }}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Wallet + Mobile Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="desktop-nav">
            <ConnectWalletButton />
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="mobile-toggle"
            style={{
              display: "none",
              background: "none",
              border: "none",
              color: "var(--text-primary)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: "hidden",
              borderTop: "1px solid var(--border-subtle)",
              background: "rgba(10, 14, 26, 0.95)",
            }}
          >
            <div
              style={{
                padding: "16px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {allLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 16px",
                      borderRadius: 10,
                      fontSize: 15,
                      fontWeight: 500,
                      color: active
                        ? "var(--accent-cyan)"
                        : "var(--text-secondary)",
                      background: active ? "var(--accent-cyan-dim)" : "transparent",
                    }}
                  >
                    <Icon size={18} />
                    {link.label}
                  </Link>
                );
              })}
              <div
                style={{
                  paddingTop: 8,
                  borderTop: "1px solid var(--border-subtle)",
                  marginTop: 4,
                }}
              >
                <ConnectWalletButton style={{ width: "100%" }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media (max-width: 768px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-toggle {
            display: block !important;
          }
        }
      `}</style>
    </nav>
  );
}
