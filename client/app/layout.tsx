import type { Metadata } from "next";
import "./globals.css";
import { Web3Providers } from "@/components/providers/Web3Providers";

export const metadata: Metadata = {
  title: "HackX — Devs Got Latent",
  description: "On-chain hackathon project evaluation on Ethereum Sepolia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  );
}
