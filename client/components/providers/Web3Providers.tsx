"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi-config";
import { WalletProvider } from "@/context/WalletContext";

type Web3ProvidersProps = {
  children: ReactNode;
  /** From `cookieToInitialState(wagmiConfig, cookieHeader)` on the server */
  initialState?: State | undefined;
};

export function Web3Providers({ children, initialState }: Web3ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider
      config={wagmiConfig}
      initialState={initialState}
      reconnectOnMount
    >
      <QueryClientProvider client={queryClient}>
        <WalletProvider>{children}</WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
