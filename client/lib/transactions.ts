"use client";

import { BaseError, encodeFunctionData, type Abi, type Address, type Hash } from "viem";
import { getAccount, getWalletClient, switchChain } from "wagmi/actions";
import { wagmiConfig } from "./wagmi-config";
import { GAME_ABI, GAME_CONTRACT_ADDRESS } from "./contract";
import { publicClient, SUPPORTED_CHAIN } from "./chain";

export type GameWrite = Extract<(typeof GAME_ABI)[number], {
  type: "function"; stateMutability: "nonpayable" | "payable";
}>["name"];

export function readableError(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : "The request could not be completed";
}

export async function sendGameTransaction(
  functionName: GameWrite,
  args: readonly unknown[] = [],
  options: { value?: bigint; expectedAccount?: Address; onSubmitted?: (hash: Hash) => void } = {},
) {
  const account = getAccount(wagmiConfig);
  if (!account.address) throw new Error("Connect your wallet first");
  if (options.expectedAccount && account.address.toLowerCase() !== options.expectedAccount.toLowerCase()) {
    throw new Error("Switch to the wallet that submitted this entry");
  }
  if (account.chainId !== SUPPORTED_CHAIN.id) {
    await switchChain(wagmiConfig, { chainId: SUPPORTED_CHAIN.id });
  }
  const wallet = await getWalletClient(wagmiConfig, { chainId: SUPPORTED_CHAIN.id });
  if (options.expectedAccount && wallet.account.address.toLowerCase() !== options.expectedAccount.toLowerCase()) {
    throw new Error("The connected wallet account changed. Select the original account and retry.");
  }
  if (await publicClient.getChainId() !== SUPPORTED_CHAIN.id) {
    throw new Error("The configured RPC endpoint is on the wrong network");
  }
  const code = await publicClient.getBytecode({ address: GAME_CONTRACT_ADDRESS });
  if (!code || code === "0x") throw new Error("No game contract exists at the configured address");
  if (functionName === "enterGame" || functionName === "createRound") {
    let version = 1n;
    try {
      version = await publicClient.readContract({ address: GAME_CONTRACT_ADDRESS, abi: GAME_ABI, functionName: "VERSION" });
    } catch { /* legacy contracts cannot accept new entries through this app */ }
    if (version < 2n) throw new Error("Deploy the updated contract before opening a new contest");
  }
  const data = encodeFunctionData({ abi: GAME_ABI as Abi, functionName, args });
  // Simulate using the same sender, chain and value before asking for a signature.
  await publicClient.call({
    account: wallet.account.address, to: GAME_CONTRACT_ADDRESS, data, value: options.value,
  });
  const hash = await wallet.sendTransaction({
    account: wallet.account, chain: SUPPORTED_CHAIN,
    to: GAME_CONTRACT_ADDRESS, data, value: options.value,
  });
  options.onSubmitted?.(hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("The transaction reverted on-chain");
  return { hash, receipt };
}
