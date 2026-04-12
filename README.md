# Devs Got Talent

**AI-powered, on-chain hackathon evaluation with stakes, verifiable scores, and wallet-native flows.**

---

## Problem statement 

Hackathons promise innovation—but their evaluation systems are often **centralized**, **inconsistent**, and **non-transparent**.

Despite building real, working products:

- Developers often receive subjective feedback due to limited judging bandwidth.
- It’s difficult to provide fully transparent and verifiable evaluation at scale.
- Self-assessment isn’t typically integrated into the process, missing an opportunity for deeper reflection and benchmarking.
- Results are usually event-bound, with limited long-term visibility or verifiability.

In contrast to transparent, high-stakes talent formats like **India’s Got Latent**—where participants **own their confidence** and **results are visible**—many hackathons still rely on **opaque, off-chain decisions** with **no skin in the game**.

### Core challenge

How can we build a **fully on-chain, AI-powered evaluation** system for hackathons that is:

| Goal | Meaning |
|------|--------|
| **Decentralized** | No sole reliance on a centralized judging authority for record-keeping and settlement |
| **Verifiable** | Scores, outcomes, and rewards **recorded on-chain** |
| **Scalable** | **AI** reduces judge bottlenecks using real project signals |
| **Incentive-aligned** | Participants **stake value** that reflects **confidence** (self-score vs eventual judge/AI score) |

### What we built 

- **Developers connect wallets** and submit projects (**GitHub + live demo**).
- They **stake ETH** via **smart contracts** (real **on-chain transaction** on **Ethereum Sepolia**).
- **AI** evaluates submissions from **real URLs** (repo + hosted site), not mocks.
- **Scores are compared** with **self-assessment** (1–10) in the product experience and results UI.
- **Verified scores** can be **submitted on-chain** via backend + agent flow; **winners** can **claim** through the contract where applicable.
- **Wallet integration** is required for user-signed txs 

---

## Solution (short)

**Devs Got Talent** is a **Next.js** app with a **IGT** UX: register → connect wallet → **stake and enter** the on-chain game → run **AI scoring** → see **results** (self vs judge). 
---

## Project flow

1. **Landing (`/`)** — Full-screen hero; user goes to registration.
2. **Register (`/auth`)** — Steps: **Details** (name, GitHub URL, optional hosted URL) → **Score** (self-rating 1–10) → **Wallet** (connect MetaMask / injected wallet, Sepolia).
3. **Confirm & stake** — User clicks to **analyze**; app reads **active round** and **stake** from the contract; user signs **`enterGame`** (payable) → **EntrySubmitted** → `entryId` captured.
4. **Processing** — UI calls **`POST /score`** on the AI service with `github_url`, `hosted_url`, `self_score`; pipeline logs stream in the panel.
5. **On-chain verification (when configured)** — Server may call **`submit-score`** with the **trusted agent** wallet so **verified AI score** is written for that `entryId`.
6. **Optional win path** — If the contract marks a win, the client can trigger **`claimPrize`** from the user’s wallet.
7. **Results (`/score`)** — Full-screen **result** artwork: **match** if rounded self-score equals rounded AI score (confetti + `result_1.svg`), else **mismatch** (`result_2.svg`). Data is passed via query param `d` (JSON).

<img width="2239" height="1223" alt="Screenshot 2026-04-12 102935" src="https://github.com/user-attachments/assets/dc4e3ee1-bb7f-4acb-af4f-672359a044d3" />

