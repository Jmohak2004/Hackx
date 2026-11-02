"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { type Address } from "viem";
import { SUPPORTED_CHAIN } from "@/lib/chain";
import { readableError } from "@/lib/transactions";

// Retain this declaration for integrations which detect an injected provider.
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

interface WalletState {
  address: Address | undefined;
  chainId: number | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const connectors = useConnectors();
  const connection = useConnect();
  const disconnection = useDisconnect();
  async function connect() {
    const connector = connectors.find((item) => item.type === "injected") || connectors[0];
    if (!connector) throw new Error("Install an Ethereum wallet to continue");
    await connection.mutateAsync({ connector, chainId: SUPPORTED_CHAIN.id });
  }
  return <WalletContext.Provider value={{
    address: account.address, chainId: account.chainId,
    isConnected: account.isConnected, isConnecting: connection.isPending,
    error: connection.error ? readableError(connection.error) : null,
    connect, disconnect: () => disconnection.mutate(),
  }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("WalletProvider must wrap the page");
  return wallet;
}
