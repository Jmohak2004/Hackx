import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { SUPPORTED_CHAIN, RPC_URL } from "./chain";

export const wagmiConfig = createConfig({
  chains: [SUPPORTED_CHAIN],
  connectors: [
    injected({ shimDisconnect: true, unstable_shimAsyncInject: true }),
    metaMask(),
  ],
  storage: createStorage({ storage: cookieStorage }),
  transports: { 11155111: http(RPC_URL), 31337: http(RPC_URL) },
  ssr: true,
});
