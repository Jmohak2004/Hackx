# HackX v2: requirements and implementation

The existing stage, characters, golden ticket, registration sequence, self-score and ETH-staking contest remain the product. This revision connects those screens to recoverable server jobs and an explicitly settled contest. It does not equate source metrics with a complete code review.

## Required participant flow

1. Provide a public GitHub repository and optional publicly reachable hosted demo. Provide a whole-number self-score from 1–10.
2. Connect an injected or MetaMask wallet. The selected connector signs on Sepolia, or explicitly configured local Hardhat chain 31337.
3. Validate public repository access, website reachability, chain/address agreement, trusted evaluator readiness, open round and exact stake before requesting payment.
4. Simulate `enterGame`, sign its exact stake, verify the receipt and extract the entry ID from this contract's event for this participant.
5. Persist the transaction before confirmation and the entry afterward. Reloading must never silently place another stake. Arena reconciles the journal with chain receipts and lists contract history per wallet and round.
6. Request evaluation using only the entry ID. The server reads the recorded URLs and self-score from the chain; browser-supplied scores are not accepted.
7. Poll the durable job. Navigation, page reloads and API restarts must not lose confirmed entries. Failed evaluations can retry the same entry, with a bounded retry count.
8. Show the verified on-chain result and evidence. Claim a prize or refund only when this participant and contract permit it.

## Services and trust

- **Next client:** one wagmi/query provider, one connector-backed wallet state, generated ABI, centralized simulation/signing/receipt verification. Same-origin `/api/backend` requests proxy to Express. Every `NEXT_PUBLIC_*` value is public and embedded at build time.
- **Express API:** chain readers, globally ranked paginated leaderboard, admission validation, durable evaluation jobs, immutable report retrieval and bounded graph workers. It alone holds the evaluator signing key.
- **Graph worker:** downloads an exact public GitHub commit snapshot and parses source without executing it. JS/TS function calls use a Babel AST with relative-import resolution. Other language graph extraction is a bounded heuristic. Neo4j is optional; JSON graphs support the app independently.
- **Python scorer:** Playwright page inspection and a pinned local Lighthouse CLI plus deterministic graph metrics. A required audit failure produces an error rather than a fabricated zero or partial trusted score. Optional NVIDIA commentary does not choose scores.
- **Contract:** trusted addresses can record one bounded score and evidence reference per entry. The contract compares self-score and verified score, freezes settlement, and enforces custody and payout. The evaluator is a trusted oracle; the contract cannot independently prove that an off-chain audit was honest.

The score scale is 0–100 in Solidity and 0–10 in the app. The UI accepts 1–10; direct contract callers may submit zero. An app tolerance of 1 corresponds to contract tolerance 10. Both requested scoring pipelines must complete: code-only uses the graph score, and combined uses 50% code plus 50% Lighthouse. The current rubric rewards structural metrics and website audits, which can be gamed and do not prove originality, correctness or security.

## Round state and money

An owner opens a round with fixed stake, tolerance, submission duration and judging buffer. An open submission window cannot be replaced. A subsequent round can start after the previous submission window closes while its judging continues independently.

Finalization is permissionless after submissions close if every entry was scored, or after the judging deadline otherwise. Claims finalize lazily. The winning denominator and shares become immutable. Unjudged stakes are reserved in full, outside the fee and prize pool.

For a round with winners:

```
scored pool = scored entry count × stake
base fee = floor(scored pool × 500 / 10000)
winner share = floor((scored pool - base fee) / winner count)
platform fees = base fee + division remainder
```

Each winner receives the fixed share. Each unjudged entry receives its full stake. Scored losing entries receive no payment in a round with winners. When nobody wins, every entry receives its full stake and the platform charges no fee. Exits continue to work while submissions are paused. Refunds, prizes and platform fee withdrawals work in any order without consuming another round's obligations.

Version 1 deployments are immutable and retain their original behavior. This client permits reading old entries and eligible expired unjudged refunds, and refuses new stakes against that contract version. Deploy version 2; changing the checked-in Solidity cannot alter an existing deployment.

## Evidence and recovery

Jobs are scoped by chain ID, contract address and normalized entry ID. They move through `queued`, `validating`, `evaluating`, `submitting`, `confirming`, `succeeded` or `failed`. At most two evaluations run concurrently. Signing is serialized with managed nonces.

A report binds chain/address/entry/participant, recorded links, committed self-score, exact verified score, evaluation time, rubric version, analyzed commit SHA and the scoring result. Object keys are sorted recursively to produce canonical JSON. The SHA-256 of this UTF-8 string is stored as `sha256:<digest>` in the contract's legacy-named `proofIpfsHash` field. It is a content digest, not an IPFS upload. `/api/reports/:digest` verifies the digest again before serving evidence. Back up reports: the blockchain preserves scores and digests, not the report's contents.

Reports persist before signing. Transaction hashes persist before awaiting confirmation. Startup resumes active jobs; an already scored entry is recovered from chain, and a broadcast score transaction is confirmed without re-evaluating or signing again. A pre-broadcast failure can reuse its stored report. If evidence is lost, the result can still be recovered from the chain with an explicit missing-report message.

## Bounds and operational limits

One API process owns a `DATA_DIR`; this is not a distributed queue. Use one replica, persistent storage and backups. A multi-replica deployment needs transactional storage and a distributed signing/queue lock first. The leaderboard currently supports up to 5,000 entries per round, with globally sorted results cached for ten seconds. Wallet history uses the contract's full participant array before API pagination.

Repository analysis permits up to 250 source files, 300 KB per file, 16 MB selected text, 50 MB compressed archive and 100 MB expanded archive; generated directories and links are ignored. Oversized individual files are recorded as skipped. The graph worker has a 384 MB heap and three-minute timeout. These are explicit analysis limits rather than a claim to understand arbitrarily large repositories.

Hosted pages are untrusted executable content. URL syntax, private/special addresses, DNS results and redirects are validated, and the Playwright inspector checks subresources. **Deploy the scorer in an isolated runtime with network egress rules blocking loopback, private ranges, metadata endpoints and internal services.** Validation alone does not defeat DNS rebinding or every browser/Lighthouse navigation path. Run it without cloud credentials, contract keys or privileged host mounts. `ALLOW_PRIVATE_TARGETS=true` is only for the isolated local acceptance stack.

The scorer may contact only public sites, GitHub through the graph API and optional NVIDIA commentary. Keep port 8000 private, use independent scoring/internal tokens, terminate HTTPS at a trusted proxy and set `TRUST_PROXY_HOPS` to the actual topology. Process-local rate limits are a basic resource bound; a public service also needs ingress limits, monitoring, persistent backups and a funded Sepolia evaluator. A fresh independent contract/security review is appropriate before handling assets of real value.
