# Development guide

The maintained setup instructions are in [README.md](README.md), with the current requirements, scoring model, settlement and limitations in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Use Node 22.19+ and the checked-in npm lockfiles. Python's tested dependency snapshot is `server/computer-use/requirements.lock.txt`. Install Playwright Chromium explicitly. Neo4j and NVIDIA commentary are optional. The scoring service is `server/computer-use`; the root `computer-use/main.py` is a compatibility entry point.

The canonical Solidity source is `contracts/LatentStyleGame.sol`; the root file only imports it. Compile with Hardhat and run `npm run contracts:export` after ABI changes. Never hand-edit `server/game-artifact.json` or `client/lib/game-abi.ts`. CI checks that generated ABI files match the contract.

Run the contract/HTTP, server and Python suites and client lint/build before submitting changes. Use the full local browser acceptance flow documented in the README for changes spanning wallet, scoring, recovery or settlement. It uses public development accounts on chain 31337 and must never target a live Ethereum network.

GitHub snapshots are pinned to commit SHA and graph schema version. Changing parsing/metric semantics requires changing `GRAPH_VERSION` so old cached metrics cannot be silently reused. Scores are deterministic for measured inputs, but live websites and performance audits can vary over time. The scoring agent is trusted; report hashes provide evidence integrity, not independent proof of correct judging.
