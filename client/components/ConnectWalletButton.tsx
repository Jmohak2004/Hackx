"use client";

import { Wallet, LogOut } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { truncateAddress } from "@/lib/hooks";

interface Props {
  style?: React.CSSProperties;
  label?: string;
}

export default function ConnectWalletButton({ style, label }: Props) {
  const { address, isConnected, isConnecting, connect, disconnect } =
    useWallet();

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            fontSize: 14,
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--accent-emerald)",
              flexShrink: 0,
            }}
          />
          {truncateAddress(address)}
        </div>
        <button
          onClick={disconnect}
          title="Disconnect"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      className="cyber-btn"
      onClick={connect}
      disabled={isConnecting}
      style={style}
    >
      <Wallet size={16} />
      {isConnecting ? "Connecting..." : (label ?? "Connect Wallet")}
    </button>
  );
}
