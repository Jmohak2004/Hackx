"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { type Address } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
// window.ethereum type
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT SHAPE
// ─────────────────────────────────────────────────────────────────────────────

interface WalletCtx {
  address: Address | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletCtx>({
  address: undefined,
  isConnected: false,
  isConnecting: false,
  connect: async () => {},
  disconnect: () => {},
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SEPOLIA_HEX = "0xaa36a7";

async function ensureSepolia() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX }],
    });
  } catch (err: unknown) {
    // Chain not added — add it
    if ((err as { code?: number }).code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_HEX,
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [
              process.env.NEXT_PUBLIC_RPC_URL ||
                "https://ethereum-sepolia-rpc.publicnode.com",
            ],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | undefined>();
  const [isConnecting, setIsConnecting] = useState(false);

  // Passive reconnect — restore session without prompting
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as Address[];
        if (list[0]) setAddress(list[0]);
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: unknown) => {
      const list = accounts as Address[];
      setAddress(list[0] ?? undefined);
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    return () =>
      window.ethereum?.removeListener("accountsChanged", onAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as Address[];
      if (accounts[0]) {
        setAddress(accounts[0]);
        await ensureSepolia();
      }
    } catch (e) {
      console.error("Wallet connect error:", e);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(undefined), []);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useWallet() {
  return useContext(WalletContext);
}
