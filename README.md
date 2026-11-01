# Devs Got LAtent

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



<img width="2239" height="1223" alt="Screenshot 2026-04-12 102935" src="https://github.com/user-attachments/assets/dc4e3ee1-bb7f-4acb-af4f-672359a044d3" />

## Run the app locally

The UI, Graphify API, scoring API, and Sepolia contract are separate services.
The current contract address is configured in `client/lib/contract.ts`; use the
same address in both client and server environment files if you deploy another
instance.

1. Copy `client/.env.example` to `client/.env.local`.
2. Copy `server/.env.example` to `server/.env` and set `AGENT_PRIVATE_KEY` to
   the private key for the trusted agent wallet. Keep this file private.
3. Start the graph API with `cd server && npm install && npm start`.
4. Start the scoring API with `cd server/computer-use`, create a Python 3.11+
   virtual environment, install `requirements.txt`, install Playwright Chromium,
   then run `uvicorn main:app --host 0.0.0.0 --port 8000`.
5. Start the client with `cd client && npm ci && npm run dev`.

The owner must have already registered the agent wallet as trusted and created
an active round on Sepolia. To do that with the supplied helper, set
`OWNER_PRIVATE_KEY` to the contract owner and set `AGENT_ADDRESS` to the address
derived from `AGENT_PRIVATE_KEY`, then run `node setup-contract.js` from `server`.
The UI will switch the connected wallet to Sepolia before asking it to stake.

During evaluation, the browser sends only the entry ID. The server fetches its
links and self-score from Sepolia, asks the Python scoring API to evaluate those
values, and submits that score using the trusted agent wallet. This prevents a
browser from choosing the score written on-chain.

For deployed setups, set `NEXT_PUBLIC_SERVER_URL` to the public Express API,
`SCORING_API_URL` to the Python scoring API, `GRAPHIFY_API_URL` to the Express
API, and `CORS_ALLOW_ORIGINS` to the exact client origins.

