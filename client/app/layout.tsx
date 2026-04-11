import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/providers/Web3Provider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Latent Style Game — AI-Verified Skill Contest",
  description:
    "The trustless AI-verified skill contest. Stake ETH, self-declare your score, submit your project, and let AI agents judge. Winners whose scores align with reality split the prize pool.",
  keywords: ["blockchain", "AI", "game", "ethereum", "staking", "web3", "skill contest"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <div className="bg-radial-glow" />
          <div className="bg-grid" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
            <Navbar />
            <main style={{ paddingTop: 72 }}>
              {children}
            </main>
            <Footer />
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}
