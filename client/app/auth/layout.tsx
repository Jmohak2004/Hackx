import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Web3Providers } from "@/components/providers/Web3Providers";
import { wagmiConfig } from "@/lib/wagmi-config";

export const metadata: Metadata = {
  title: "Entry",
  description: "Profile, score, and wallet",
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const initialState = cookieToInitialState(
    wagmiConfig,
    headerList.get("cookie"),
  );

  return (
    <Web3Providers initialState={initialState}>{children}</Web3Providers>
  );
}
