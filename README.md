# HackX — Devs Got Latent

A wallet-based hackathon contest: submit a GitHub project, predict your score, stake test ETH, receive a measured evaluation, and claim a prize when your prediction falls within the round's tolerance. The original stage artwork, characters and registration concept are preserved.

This revision includes a version 2 Solidity contract, Hardhat deployment/testing, recoverable evaluation jobs, real GitHub analysis and Lighthouse audits, Arena history, leaderboard and owner administration. Scores use deterministic formulas; optional LLM commentary supplies roasts, not scores.

## Start a complete local contest

Use Node 22.19+ (`nvm use` reads `.nvmrc`), npm, and Python 3.11+. Python 3.13 and Node 22 are used for validation. Install dependencies from the repository root:

```sh
npm ci
npm ci --prefix server
npm ci --prefix client
python3 -m venv server/computer-use/.venv
server/computer-use/.venv/bin/python -m pip install -r server/computer-use/requirements.lock.txt
server/computer-use/.venv/bin/python -m playwright install chromium
npm run dev:local
```

On Linux, install Chromium's operating-system dependencies with `python -m playwright install --with-deps chromium`. On Windows, use the virtual environment's `Scripts/python.exe` equivalent.

Open `http://127.0.0.1:3000`. The command starts Hardhat on 8545, deploys version 2, opens a round, starts Express on 4000, starts Python on 8000 and starts Next on 3000. No real owner/evaluator key is required. It uses Hardhat's publicly known development accounts exclusively on chain 31337. Choose alternate ports when necessary:

```sh
LOCAL_CLIENT_PORT=3300 npm run dev:local
npm run dev:stop
```

`dev:stop` stops the recorded HackX processes only. Each start creates a fresh local chain and separate `.local/<run>/data` directory. Contract addresses can repeat after a reset; the local browser journal also includes a run ID so old transactions are not mistaken for new submissions. Old screenshots/data remain available under `.local`.

For manual wallet testing, add local chain 31337 with RPC `http://127.0.0.1:8545` and import a Hardhat development account using the [official Hardhat account instructions](https://v2.hardhat.org/hardhat-network/docs/overview). Keep development accounts separate from real wallets. The local stack accepts loopback hosted demos for testing; Sepolia deployments use public websites.

Navigate to `/auth` to submit, `/arena` to recover entries, `/leaderboard` for verified scores, `/graph` for repository graphs, and `/admin` for owner controls. Hosted URLs are optional. A public repository is required. Neo4j and NVIDIA credentials are optional.

## Verify the application

```sh
npm run contracts:compile
npm run contracts:test
npm test --prefix server
cd server/computer-use
.venv/bin/python -m unittest discover -s tests -v
cd ../../client
npm run lint
npm run build
```

Contract tests include real local EVM/HTTP integration, immutable settlement, fee/refund ordering, multiple rounds, score authorization and double-claim rejection. Server tests cover durable job recovery, deduplication, report integrity, source archive limits and actual function-call extraction. Python tests cover failed scoring pipelines and public-URL validation.

For the complete browser check, start a **fresh local stack** on client port 3300 and run in a second terminal:

```sh
server/computer-use/.venv/bin/python scripts/browser-smoke.py
```

This runs isolated Chromium with a test-only injected wallet connected to unlocked Hardhat accounts. It stakes local ETH, analyzes the public `octocat/Spoon-Knife` repository and a real locally served website with Lighthouse, reloads during evaluation, recovers the entry, verifies the on-chain score, advances local time, claims payment, checks leaderboard/graph and opens a new round as owner. It refuses non-31337 RPCs before changing chain time. Evidence and desktop/mobile screenshots are saved under `.local/browser`. The test wallet is never included in the client build.

## Deploy on Ethereum Sepolia

Sepolia is the intended Ethereum application testnet; see [Ethereum's network documentation](https://ethereum.org/developers/docs/networks/). The old checked-in address is a **version 1 deployment**. Its Solidity cannot be patched in place. This app reads old entries and allows eligible expired unjudged refunds, but refuses new staking against version 1. Deploy version 2 for new contests.

1. Copy root `.env.example` to `.env`. Set a funded Sepolia `OWNER_PRIVATE_KEY` locally, an RPC endpoint and the evaluator's public `AGENT_ADDRESS`. The deployer is the owner unless `CONTRACT_OWNER` specifies another address. Never commit keys or send them through chat.
2. Review stake, tolerance, round durations and `CREATE_ROUND`. Run:

   ```sh
   npm run contracts:deploy:sepolia
   ```

   Deployment writes public metadata to `deployments/11155111.json` and exports the ABI used by both services. If a different owner is specified, the deployer cannot configure that owner's round; use `/admin` from the actual owner wallet afterward.
3. Copy `server/.env.example` to `server/.env`, `client/.env.example` to `client/.env.local`, and `server/computer-use/.env.example` to `server/computer-use/.env`.
4. Set the **same new contract address** and chain 11155111 in the client and server. Put the evaluator's matching private key only in `server/.env`, and fund its wallet with Sepolia ETH for gas. The owner must trust that address. Use the owner wallet in `/admin`, or review/apply the setup helper:

   ```sh
   node server/setup-contract.js
   node server/setup-contract.js --apply
   ```

   The helper is read-only without `--apply`. `CREATE_ROUND=true` enables creation when the previous submission window has closed. `/admin` also supports pause/resume, trusted agents, permissionless finalization and fee withdrawal.
5. Generate separate random `SCORING_API_TOKEN` and `GRAPHIFY_INTERNAL_TOKEN` values and put matching values in the API/scorer environments. A read-only `GITHUB_TOKEN` is recommended to avoid anonymous API rate limits. Leave `NEO4J_URI` empty unless using Neo4j.
6. Start the scorer and API in separate terminals:

   ```sh
   cd server/computer-use
   .venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```

   ```sh
   cd server
   npm start
   ```

7. Set client `SERVER_API_URL` to the private Express URL. The default browser API path is `/api/backend`, proxied by Next. Build and start the client:

   ```sh
   npm run build --prefix client
   npm run start --prefix client
   ```

   Rebuild after changing `NEXT_PUBLIC_*` values or the proxy destination. For split hosting, use `NEXT_PUBLIC_SERVER_URL` and exact API `CORS_ALLOW_ORIGINS` instead. Never expose Python directly to browsers. Configure HTTPS, the actual trusted proxy hop count and persistent storage for `DATA_DIR` and `server/graph-cache`.
8. Check `GET /ready` on Express. It requires the correct chain, version 2 contract, trusted/funded evaluator, installed scorer/browser dependencies and an open unpaused round. `/health` checks only the API process. Readiness returns a specific reason for missing setup.

Actual Sepolia deployment and score transactions require the owner's/evaluator's local signing credentials. Passing local tests does not itself deploy a contract or verify a live Sepolia payment.

## Contest and service behavior

Submission and scoring use confirmed chain entries. A browser cannot choose the trusted score or forge a result by editing query parameters. Durable jobs survive browser navigation and API restart; retrying an entry does not stake again. The server preserves content-addressed reports before signing and transaction hashes before awaiting confirmation.

Claims open after submissions close and all judging is complete, or after the judging deadline. Unjudged entries keep a full refund reserve. Winners split the scored pool after a 5% fee; if nobody wins, everyone receives their whole stake with no fee. Shares freeze before payouts and do not depend on claim order. Reports include the exact analyzed commit and rubric, with a SHA-256 digest recorded on-chain. Reports are served from persistent storage, not uploaded to IPFS.

For requirements, trust boundaries, the scoring formula, resource limits, recovery and deployment isolation, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In particular, isolate the browser/scorer with network egress rules; it visits untrusted submitted websites. This implementation uses one persistent API process and a bounded local queue. It is intended for testnet operation, not an assertion of independent financial/security audit.
