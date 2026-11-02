# Verification record

Verified locally during this revision; no version 2 Sepolia deployment or live Sepolia payout is claimed.

| Check | Result |
| --- | --- |
| Hardhat contract and real HTTP/API integration | 25 passing |
| Node server unit/regression tests | 22 passing |
| Python scoring and URL-safety tests | 10 passing |
| Client ESLint | Passed |
| Production Next build and TypeScript validation | Passed, all eight app routes generated |
| Complete local Chromium acceptance | Passed, no browser runtime errors |

The browser check ran the actual Node API, isolated graph worker, Python service, Playwright Chromium, Lighthouse 13.6 and local Hardhat chain 31337 under Node 22. It downloaded the public `octocat/Spoon-Knife` commit snapshot and audited a responsive locally served site. The injected test wallet used an unlocked Hardhat development account; it contained no real private key.

Observed submission: self-score `6.0`, verified score `5.2`, within the round's ±1 tolerance. The participant staked `0.001` local ETH and claimed `0.00095` local ETH. The owner withdrew the `0.00005` local ETH platform fee. The entry's recorded report reference was:

```
sha256:ccd1cfa411d864d623855ed34bcbc07edea5d0769004613221ba85fca1f7d09c
```

The acceptance flow reloaded during evaluation, recovered the same entry through Arena, verified one entry rather than a duplicate stake, displayed both score cards inside the mobile viewport, confirmed payment, inspected leaderboard and graph, created the next round as owner, paused/resumed it, checked pause-aware readiness and checked disabled owner controls for the participant wallet.

Local screenshots and machine-readable evidence are in `.local/browser/` and are ignored by Git. Rerun on a fresh local stack using the command in the root README; live audit measurements and report hashes can vary between runs.

Production dependency audits reported no high or critical findings in the client or server after the updates; the client production dependency audit was clean. Server transitive glob/minimatch packages still produce moderate findings through Lighthouse. Development tools also retain low/moderate upstream findings. Do not interpret passing checks as an independent security audit or proof that a live deployment has been funded/configured.
