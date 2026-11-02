import { createPublicClient, fallback, http } from "viem";
import { hardhat, sepolia } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || sepolia.id);
if (chainId !== sepolia.id && chainId !== hardhat.id) {
  throw new Error("HackX supports Ethereum Sepolia and the local development chain");
}
export const SUPPORTED_CHAIN = chainId === hardhat.id ? hardhat : sepolia;
const configuredRpc = process.env.NEXT_PUBLIC_RPC_URL;
export const RPC_URL = configuredRpc || (chainId === hardhat.id
  ? "http://127.0.0.1:8545" : "https://ethereum-sepolia-rpc.publicnode.com");
export const publicClient = createPublicClient({
  chain: SUPPORTED_CHAIN,
  transport: configuredRpc || chainId === hardhat.id ? http(RPC_URL) : fallback([
    http(RPC_URL), http("https://sepolia.drpc.org"),
  ]),
});
export function transactionUrl(hash: string): string | null {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  return SUPPORTED_CHAIN.blockExplorers?.default.url
    ? SUPPORTED_CHAIN.blockExplorers.default.url + "/tx/" + hash : null;
}
