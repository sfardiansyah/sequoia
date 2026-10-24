# Sequoia on Cardano — Product, Legal, and Technical Plan

**Status:** Draft — implementation in progress  
**Date:** 2026-10-22  
**Scope:** Indonesia-based co-op (koperasi) with member-only IDR deposit receipts, at-risk project capital, on-chain governance, and bank IDR custody.  
**Plan location:** `docs/plan/sequoia-plan.md`

> This is a product and technical plan, not legal advice. Indonesian counsel must review the koperasi structure, token characterization, KYC/AML, tax, and custody before mainnet.

---

## 0. Executive summary

The co-op is a member-owned organization that:

- collects a fixed annual contribution from every member;
- splits the contribution into a refundable IDR deposit and at-risk project capital;
- funds member-approved projects from the project capital pool;
- shares profit and loss pro-rata across project capital;
- gives every member one vote, regardless of capital;
- refunds the IDR deposit at an annual exit window;
- uses a member-only, non-transferable IDR deposit receipt on Cardano;
- keeps actual IDR in segregated bank accounts, with on-chain governance and accounting.

### Key decisions

| Area | Decision |
|---|---|
| Legal form | Indonesian koperasi |
| Member token | Non-transferable, member-only IDR deposit receipt (`IDR-DEP`), 1 unit = 1 IDR |
| Project token | Non-transferable project capital token (`PROJ`) |
| Standard member split | 70% refundable deposit / 30% project capital |
| Founder split | 20% refundable deposit / 80% project capital |
| Founder lock-up | 3-year cliff + 50% annual vesting at years 4 and 5; fully released at year 5 |
| Founder conversion | Automatic to standard member at year 5 |
| Profit/loss | Pro-rata by project capital |
| Voting | One member, one vote |
| Quorum | 50% of active members |
| Project spending | >50% of votes cast with 50% quorum |
| Structural changes | Two-thirds of votes cast with 50% quorum; 7-day timelock |
| Exit window | 30 days after the annual profit distribution |
| Deposit refund | 100% of `IDR-DEP` at the annual exit window |
| Project capital refund | Book value, deferred if illiquid |
| Founder resignation | Deposit refunded; project capital becomes a locked claim |
| Operating costs | Paid from profit after funding an operating reserve |
| IDR custody | Segregated bank IDR; on-chain attestations |
| Public stablecoin | Out of scope |
| KYC | Privy primary, Sumsub for AML/global; no PII on-chain |
| Smart contracts | Aiken / Plutus V3 |
| Architecture | Modular monolith with DDD + hexagonal ports/adapters |
| API | Elysia on Bun |
| Frontend | Vite + React + TanStack Router |
| On-chain SDK | TypeScript + Lucid Evolution |
| Database | PostgreSQL + Drizzle |
| Initial network | Preprod with mock IDR and mock KYC |

### Current implementation handoff — 2026-10-22

**Repository:** `Sequoia`  
**Package scope:** `@sequoia/api`, `@sequoia/shared`  
**Architecture:** modular monolith + DDD + hexagonal ports/adapters  
**Stack:** Bun, Elysia, Drizzle, PostgreSQL, citty, Vite/React later, Aiken later  
**Test command:** `bun run check`  
**Current status:** 30 tests pass, typecheck clean

#### Completed milestones

1. Bun workspace and shared domain primitives.
2. Elysia API skeleton with `/health` and error envelopes.
3. Membership aggregate and admission use case.
4. Drizzle schema, PGlite tests, Postgres repository.
5. Production `postgres-js` adapter and migration runner.
6. Centralized database migrations.
7. Composition root and admin admission CLI.
8. Sequoia rename and citty CLI.
9. CIP-30 auth (`/auth/nonce`, `/auth/verify`) and `GET /members/me`.
10. Auth stabilization: ports/adapters, Postgres nonce store, JWT claims, rate limiter, real CIP-30 vector test.

#### Current auth decisions

- Nonce: **5 minutes**, single-use, bound to wallet address.
- Nonce storage: **PostgreSQL** (`auth_nonces`), atomic consume with `DELETE ... RETURNING`.
- Access JWT: **1 hour**, stateless.
- JWT claims: `iss=sequoia`, `aud=sequoia-api`, `sub=<pkh>`, `pkh`, `jti`, `iat`, `exp`.
- Current algorithm: **HS256**.
- Target algorithm: **EdDSA / Ed25519** with `kid` and public JWKS.
- Refresh token: **not implemented yet**.
- No refresh token until users complain about re-signing every hour.
- If refresh tokens are added: 7–30 days, hashed in PostgreSQL, rotate on refresh, revoke on logout/reuse.
- Session/revocation storage: PostgreSQL; Redis is optional cache, not required.
- JWT signing keys must be separate from Cardano wallet keys.

#### Nonce and session lifetimes

| Item | Lifetime | Storage |
|---|---|---|
| Nonce | 5 minutes, single-use | PostgreSQL |
| Access JWT | 1 hour | Stateless |
| Refresh token | 7–30 days, later | PostgreSQL, hashed |
| Session/revocation record | Until token expiry | PostgreSQL |
| Rate-limit counters | 1–60 minutes | Memory now; Redis later |

Add periodic cleanup:

```sql
DELETE FROM auth_nonces WHERE expires_at < now();
```

#### Rate limiting decisions

- Do **not** build a distributed rate limiter ourselves.
- For the current single-instance MVP: use **`elysia-rate-limit`** in-memory.
- For multi-instance production: use **`rate-limiter-flexible` + Redis**.
- Do not add Redis-backed rate limiting until there are multiple API instances, serverless deployment, or high-volume abuse protection.
- Keep the `RateLimiter` port so the adapter can change.
- Current custom `InMemoryRateLimiter` is a placeholder and should be replaced with the package.
- Redis duration is not the deciding factor. Long-lived nonces/sessions belong in PostgreSQL; Redis is for shared ephemeral counters/cache.

#### JWT algorithm decision

- Prefer **EdDSA (Ed25519)** for compact tokens and clean public-key verification.
- Use **ES256** if broad third-party JOSE compatibility is required.
- HS256 is acceptable only while the API is the sole signer and verifier.
- Production private key belongs in KMS/secret manager.
- Publish public keys through `/.well-known/jwks.json`.
- Include `kid` in the JWT header and support key rotation.
- Do not reuse Cardano wallet keys for JWT signing.

#### Docker Compose decision

Add a local stack with:

- PostgreSQL 17
- Redis 7 (available now, optional until rate limiting/session caching needs it)
- one-shot `migrate` service
- `api` service
- healthchecks and `depends_on`
- `Dockerfile`, `.dockerignore`, `.env.example`
- named volumes for Postgres and Redis

Redis must not be a hard dependency for the API until the Redis adapter exists. PGlite remains test-only.

#### Milestone rule

> **200 lines of new behavior per milestone. Pure refactors, moves, renames, and generated migration/lock files do not count.**

This rule exists because security and architecture stabilization must not be compressed into arbitrary diff limits.

#### Priority order

1. **EdDSA JWT key provider** with `kid`, JWKS, and key rotation.
2. **Docker Compose** with Postgres, Redis, migrate, API, healthchecks.
3. **Replace custom rate limiter** with `elysia-rate-limit` in-memory.
4. **Redis-backed rate limiter** only when multi-instance/high-volume requires it.
5. **KYC attestation context** with issuer allowlist, expiry, revocation, and Privy/Sumsub webhook adapter.

#### Known limitations

- Rate limiter is in-memory and per-instance.
- JWT uses a single shared secret, no key rotation yet.
- No mainnet/testnet address network validation in auth.
- Postgres nonce adapter is typechecked but not integration-tested against live Postgres.
- CLI admission trusts the operator for KYC and board approval.
- No refresh token/session revocation yet.
- Redis is not wired into the application.
- Aiken contracts and frontend are not built yet.

#### Resume checklist

```sh
bun install
bun run check
bun run db:migrate                  # requires DATABASE_URL
bun run sequoia --help
bun run dev:api                     # requires DATABASE_URL and JWT_SECRET
```

Read this handoff section first, then continue with priority 1.

---

## 1. Goals and non-goals

### 1.1 Goals

- Give members a transparent, auditable membership and capital record.
- Enforce one member, one vote.
- Enforce that refundable deposits are never spent on projects.
- Fund projects only through member-approved proposals and budgets.
- Share profit and loss fairly according to project capital.
- Allow founders to seed a larger initial project pool without putting standard members’ deposits at risk.
- Provide a clean annual exit window and deferred project-capital settlement.
- Keep personal data off-chain and minimize on-chain identity data.
- Build a testnet MVP that can be audited before mainnet.

### 1.2 Non-goals for v1

- Issuing a public, transferable IDR stablecoin.
- Public trading of co-op tokens.
- Fully on-chain IDR custody.
- Zero-knowledge voting.
- Tokenized project ownership or real-world assets.
- Mobile native apps.
- Global membership outside the initial koperasi jurisdiction.
- Automated legal/tax filings.

---

## 2. Legal and regulatory frame

### 2.1 Legal form

Use an Indonesian **koperasi** because it matches:

- one member, one vote;
- member savings (`simpanan`);
- member capital participation;
- profit sharing (`SHU`);
- annual members’ meeting (`RAT`);
- board (`pengurus`) and supervisory board (`pengawas`).

Requirements to confirm with counsel:

- legal deed and Ministry approval/SK;
- NIB and NPWP;
- member register and KYC;
- annual RAT and financial statements;
- whether a **koperasi simpan pinjam** licence is required;
- whether the koperasi may hold crypto/stablecoins;
- tax treatment of member savings, project capital, SHU, and crypto transactions.

### 2.2 Token characterization

The co-op token is a **member-only, non-transferable IDR deposit receipt**:

- 1 unit = 1 IDR;
- minted only for a verified member after IDR is received;
- locked in the member’s on-chain record;
- not tradable, not transferable, not used as a payment instrument;
- redeemable only at the annual exit window;
- not marketed as a stablecoin.

This is a membership record and claim on the co-op, not a public stablecoin.

A public, transferable IDR-backed stablecoin is **out of scope**. It would require a separate Indonesian PT and OJK licensing.

### 2.3 KYC/AML and privacy

- KYC is performed off-chain by Privy (primary Indonesian e-KYC) and/or Sumsub (AML/sanctions/global).
- Only a salted commitment, issuer, KYC level, expiry, and revocation status go on-chain.
- No names, NIK, passports, addresses, selfies, or documents on-chain.
- The co-op remains the data controller; the KYC provider is a processor.
- Comply with Indonesia’s PDP Law (UU 27/2022): consent, retention, access/correction, breach process, cross-border transfer review.
- Privacy roadmap: pseudonymous IDs now, commit-reveal voting later, ZK later.

### 2.4 Regulatory watch

As of 19 October 2026:

- **Law No. 4 of 2026** (P2SK amendment) creates OJK licensing categories for crypto/digital asset institutions; stablecoins may be used as transaction instruments but are not payment instruments.
- **POJK 27/2024**, as amended by **POJK 23/2025**, regulates digital financial asset/crypto trading. It does not regulate primary offerings.
- A **draft POJK on Digital Financial Asset Offerings** would regulate issuance. Reported draft requirements include an Indonesian PT, OJK licence for public offerings above IDR 1 billion, 100% reserves, segregated custody, and eligible reserve assets.
- OJK targets a **stablecoin-specific POJK around January 2027**.
- **PBI 20/6/PBI/2018** on electronic money applies if a token functions as e-money/payment.
- The koperasi must confirm whether holding crypto/stablecoins is permitted under its articles and business licence.

### 2.5 Open legal questions

- Can a koperasi have a temporary founder class with different capital rights?
- Is a 5-year lock-up on founder project capital enforceable?
- Can a resigned founder hold a non-voting capital claim, or must they remain a non-voting member until maturity?
- Can the 20% founder deposit be refunded on resignation while the 80% project capital stays locked?
- What are the accounting/tax treatments of founder capital, vesting, conversion, and deferred claims?
- Does the co-op need a koperasi simpan pinjam licence?
- What OJK/BI reporting applies to the bank IDR flows?

---

## 3. Co-op terms

### 3.1 Membership

- Membership is open to natural persons (and possibly legal entities) who pass KYC and board admission.
- Each member receives one `MEMBER` NFT.
- Membership is non-transferable. Succession only through the legal process and board approval.
- One member, one vote.
- Members must pay the annual contribution during the enrollment window.
- Members must maintain a valid KYC attestation.

### 3.2 Annual contribution and split

| Class | Refundable deposit | Project capital |
|---|---:|---:|
| Standard member | 70% | 30% |
| Founder | 20% | 80% |

- The annual amount is fixed in IDR and announced before enrollment.
- No member may pay more than the annual amount to gain more profit share.
- No prepayment or back-payment of future years.
- The split applies to each annual contribution.
- The project share for standard members is capped at 50% by governance; the default is 30%.
- The aggregate project pool is **not** capped at 30% of capital. The hard rule is that all refundable deposits are 100% covered by the segregated reserve.

### 3.3 Tokens

| Token | Purpose | Transferability |
|---|---|---|
| `MEMBER` | One per member; voting and identity | Non-transferable |
| `IDR-DEP` | Refundable IDR deposit receipt; 1 unit = 1 IDR | Non-transferable |
| `PROJ` | Project capital; book value fluctuates | Non-transferable |
| `STATE` | Config/treasury singleton | Protocol-controlled |
| `PROPOSAL` | Proposal identity | Protocol-controlled |
| `VOTE` | Vote receipt | Protocol-controlled |
| `CLAIM` | Deferred exit/founder claim | Non-transferable |

All member tokens are locked in the member’s on-chain record. The membership validator forbids sending them to a wallet, DEX, or third party.

### 3.4 Founder class and vesting

Founders:

- contribute 20% refundable deposit / 80% project capital;
- have a 3-year cliff;
- vest 50% of founder project capital at year 4 and 50% at year 5;
- are fully vested at year 5;
- automatically convert to standard members at year 5.

Vesting schedule:

| Time | Cumulative vested |
|---|---:|
| Months 0–36 | 0% |
| Year 4 (month 48) | 50% |
| Year 5 (month 60) | 100% |

Because exit windows are annual, the practical redemption pattern is:

- year 4 window: up to 50% redeemable;
- year 5 window: up to 100% redeemable.

Because refunds are annual, 50% annual vesting matches the actual liquidity windows. No separate semi-annual claim window is needed.

### 3.5 Profit and loss

- Profit and loss are shared **pro-rata by project capital** (`PROJ`), not by total contribution.
- Refundable deposits do not participate in project profit or loss.
- Rationale: founders hold 80% project capital and standard members 30%; total-contribution weighting would give founders the same profit for more risk.
- Profit is calculated after project costs, operating costs, and reserve top-ups.
- Losses reduce project capital. Refundable deposits remain protected by the segregated reserve.
- If project capital is exhausted, the project pool cannot touch the refundable reserve.

### 3.6 Refunds and exit

- Exit is allowed only during the annual exit window.
- The exit window is 30 days, after the annual profit distribution.
- On exit:
  1. `IDR-DEP` is refunded in full from the segregated reserve.
  2. `PROJ` is valued at the latest audited book value.
  3. If the project pool has liquid funds, `PROJ` is paid immediately.
  4. If not, an `ExitClaim` is created for the unpaid amount.
  5. Tokens and the `MEMBER` NFT are burned.
- No future profit share after exit.
- A former member may rejoin only through a later enrollment and fresh admission.

### 3.7 Founder resignation with locked claim

If a founder resigns before full vesting:

- the 20% refundable deposit is refunded at the next annual exit window;
- the 80% project capital is converted into a `FounderCapitalClaim` at book value;
- the claim follows the founder vesting schedule;
- the claim has no voting rights and no future profit share;
- the claim is subordinated to refundable deposits and pro-rata with other project-capital claims if the pool is insufficient;
- acceleration is allowed only by a supermajority member vote for death, incapacity, or similar hardship.

### 3.8 Founder conversion at year 5

At month 60:

- the member class changes from `Founder` to `Standard`;
- the founder lock-up ends;
- future annual contributions use the standard 70/30 split;
- existing `IDR-DEP` and `PROJ` balances are unchanged;
- no forced rebalancing of historical project capital;
- founder-specific rights end;
- board seats, if any, are separate and must be re-elected;
- a non-economic founder badge may be issued for recognition.

### 3.9 Governance and voting

- One member, one vote.
- Only active members with valid KYC may vote.
- Quorum: 50% of active members at proposal snapshot.
- Project spending: >50% of votes cast.
- Structural changes, split changes, board changes, and bylaws: two-thirds of votes cast with 50% quorum.
- 7-day timelock for structural and parameter changes.
- Proposal bond: refundable if quorum is reached; forfeited to the treasury if spam.
- Votes are public by default; commit-reveal is a later privacy option.
- Delegation is out of scope for v1.

### 3.10 Board and operations

- Board is a multisig (recommended 3-of-5).
- Board executes approved projects and budgets.
- Board cannot spend outside an approved proposal and budget.
- Board cannot touch the refundable deposit reserve.
- Board proposes the annual amount and split; members approve.
- Board manages bank/payment operations under dual control.
- Board prepares annual financial statements and audits.

### 3.11 Project funding

- Only the project pool is spendable on projects.
- A proposal specifies amount, recipient, milestones, deadline, and evidence requirements.
- Funds are released in tranches.
- The board may spend within the approved budget and milestone.
- Unused funds return to the project pool.
- Members may vote to cancel a failing project.
- Project spending is recorded on-chain; bank transfers are attested off-chain.

### 3.12 Operating expenses

- Operating costs are paid from profit.
- Fund a 6–12 month operating reserve before distributions.
- If there is no profit, the co-op needs founder funding, a grant, or a small non-refundable onboarding fee.
- Do not use the refundable deposit reserve or project capital for operating costs unless members approve a separate capital call.

### 3.13 Proposed annual calendar

Exact dates are config parameters. Proposed sequence:

1. **Enrollment/deposit window** — members pay the annual contribution.
2. **Project cycle** — proposals, votes, execution, tranches.
3. **Year-end audit** — project pool book value, operating costs, profit.
4. **Operating reserve top-up**.
5. **Profit distribution vote and payout**.
6. **Annual exit window** — deposit refunds, project capital settlement, founder claims.
7. **Next year’s amount and split announced**.
8. **New enrollment**.

### 3.14 Missing annual deposit (open decision)

Recommended:

- grace period of 30 days;
- after grace, status becomes `Inactive`;
- inactive members cannot vote;
- after two missed years, membership review and possible exit/expulsion;
- refund treatment follows the bylaws and koperasi law.

### 3.15 Death, incapacity, and beneficiary

- Member record includes a beneficiary.
- Legal heirs/beneficiary provide documentation.
- Deposit is refunded; project capital is settled at book value.
- Founder locked capital follows the vesting schedule or is accelerated by member vote.
- Legal/tax counsel to confirm.

### 3.16 Dispute resolution

- Internal board/member process first.
- Mediation/arbitration per koperasi bylaws.
- On-chain votes are evidence of member decisions, not a substitute for legal process.

### 3.17 Parameter table

```text
annual_amount_idr:                  TBD
standard_deposit_bps:               7000
standard_project_bps:               3000
standard_project_max_bps:           5000
founder_deposit_bps:                2000
founder_project_bps:                8000
founder_cliff_months:               36
founder_vesting:                    [(48,5000),(60,10000)]
founder_conversion_month:           60
project_pool_aggregate_cap:         none; funded by at-risk capital
quorum_bps:                         5000
project_threshold_bps:              5001
structural_threshold_bps:           6667
timelock_days:                      7
exit_window_days:                   30
opex_reserve_months:                6-12
profit_distribution_ratio:          TBD
```

---

## 4. Processes

### 4.1 Member onboarding

1. Applicant connects a Cardano wallet.
2. Applicant completes KYC with Privy/Sumsub.
3. Provider webhook returns the verification result.
4. Board reviews and approves admission.
5. Issuer service creates a KYC attestation.
6. Applicant transfers the annual contribution to the segregated bank account.
7. Payment provider/bank webhook creates a deposit attestation.
8. Membership transaction mints `MEMBER`, `IDR-DEP`, and `PROJ`.
9. Member record is created.
10. Member appears on the dashboard.

### 4.2 Annual deposit

1. Enrollment window opens.
2. Member receives a virtual account/payment instruction.
3. Member pays the exact annual amount.
4. Bank/payment provider webhook confirms.
5. Treasurer attestation records the bank reference.
6. Contract mints the split tokens.
7. Double deposit, prepayment, and wrong amount are rejected.

### 4.3 Project proposal and vote

1. Member or board creates a proposal with metadata on IPFS.
2. Proposal bond is locked.
3. Proposal NFT and UTxO are created.
4. Voting opens at `start` and closes at `end`.
5. Each member votes once; vote receipt NFT is minted.
6. After `end`, anyone can tally in batches.
7. If quorum and threshold are met, status becomes `Passed`.
8. Execution creates/updates the project UTxO.
9. If rejected, bond returns if quorum was reached; otherwise forfeited.

### 4.4 Project execution and spending

1. Approved project UTxO records budget and milestones.
2. Board submits a tranche request with evidence.
3. Treasury validator checks proposal, budget, and remaining amount.
4. Bank transfer is executed under dual control.
5. Treasurer attestation records the transfer.
6. Project UTxO updates `spent`.
7. Unused funds return to the project pool.
8. Members may vote to cancel and recover the remainder.

### 4.5 Profit distribution

1. Year-end audit produces project pool book value and profit.
2. Operating reserve is topped up.
3. Board proposes distribution amount and Merkle root.
4. Members vote.
5. Treasury funds a distribution UTxO.
6. Each member claims pro-rata by project capital.
7. Double claims are rejected.
8. Unclaimed funds return to the project/operating reserve after the deadline.
9. Payout is in IDR bank transfer or USDCx, not in locked tokens.

### 4.6 Annual exit and refund

1. Exit window opens after profit distribution.
2. Member submits an exit request.
3. Contract checks KYC, status, and no outstanding votes/obligations.
4. `IDR-DEP` is refunded from the segregated reserve.
5. `PROJ` is valued at the latest audited book value.
6. If liquid, `PROJ` is paid; otherwise an `ExitClaim` is created.
7. Tokens and `MEMBER` NFT are burned.
8. Member loses voting and future profit rights.

### 4.7 Founder resignation claim

1. Founder requests resignation.
2. Deposit portion is refunded at the next annual window.
3. Project capital is converted to `FounderCapitalClaim` at book value.
4. Claim follows the founder vesting schedule.
5. Claim is paid from project pool liquidity.
6. No voting or future profit.
7. Beneficiary applies on death.

### 4.8 Founder conversion

1. At month 60, conversion is automatic.
2. `member_class` becomes `Standard`.
3. `founder_lock_until` is cleared.
4. Future deposits use 70/30.
5. Existing tokens remain.
6. Founder badge may be minted as a non-economic NFT.
7. Redemption wave is monitored; liquidity plan applies.

### 4.9 KYC renewal and revocation

- KYC attestation has an expiry.
- Members re-verify before expiry.
- Issuer publishes revocation status.
- Sanctions/PEP hits can freeze voting/exit as legally required.
- A frozen member cannot vote; refund handling follows legal advice.

### 4.10 Bank reconciliation and audit

- Monthly reconciliation of bank statements vs on-chain liabilities.
- Quarterly reserve attestation.
- Annual independent audit.
- Public dashboard shows reserve coverage and project pool.
- Any discrepancy triggers a board incident process.

---

## 5. Token and asset model

### 5.1 Token properties

- `IDR-DEP`: fungible, 1 unit = 1 IDR, non-transferable, 1:1 backed by bank IDR.
- `PROJ`: fungible, 1 unit = 1 IDR of contributed project capital, book value fluctuates, non-transferable.
- `MEMBER`: NFT, one per member, non-transferable.
- `STATE`, `PROPOSAL`, `VOTE`, `CLAIM`: protocol NFTs/UTxOs.

Cardano native assets are integers. Use 1 unit = 1 IDR for simplicity; use 1 unit = 1 sen if fractional IDR is needed.

#### Money and decimal precision

Canonical rule: **all balances, token quantities, and ledger amounts are integer smallest units.** Decimals are display and metadata only.

| Concept | Representation |
|---|---|
| IDR amount | Integer IDR; `IdrAmount` safe integer for now |
| Future fractional IDR | Integer sen; 1 IDR = 100 units |
| `IDR-DEP` / `PROJ` quantity | Integer units; `bigint` in TypeScript |
| Token display decimals | Metadata/config; never stored as the balance |
| Book value / NAV | Rational `{ numerator, denominator }` or high-precision decimal |
| FX / oracle price | Rational or decimal with fixed scale |
| API/JSON | Strings for `bigint` quantities; never JSON numbers |

Rules:

- Cardano does not store a decimals field on native assets. A 6-decimal token with
  quantity `1_500_000` means 1.5 tokens only because the client/metadata says 6
  decimals.
- Use `bigint` for token quantities and all intermediate multiplication/division.
- Convert user input with Decimal.js or a decimal parser only at the boundary,
  then immediately scale to an integer and validate the maximum.
- Round down for member payouts and distributions; allocate the remainder
  explicitly to a reserve or by deterministic largest-remainder order.
- Round up for fees and liabilities where rounding down would underpay.
- Never store a `Decimal` object in PostgreSQL, JSON, domain events, or chain
  data. Store the scaled integer plus a scale/decimals value.
- Never mix assets without an `AssetId` (policy ID + asset name) and its decimals.
- Add property tests for conservation: sum of payouts equals the distribution
  amount, and no member receives a negative or over-precise amount.

Example:

```text
IDR 1,000,000 contribution
  IDR-DEP: 700,000 units (0 decimals)
  PROJ:    300,000 units (0 decimals)

Project pool value: 1,050,000,000 IDR
Total PROJ supply:  1,000,000,000 units
Book value:         1.05 IDR/unit

Member payout: floor(300,000 * 1.05) = 315,000 IDR
Remainder: allocated to the project/operating reserve
```

### 5.2 Non-transferability

Cardano native assets are transferable by default. The co-op enforces non-transferability by:

- locking tokens in the membership script record;
- requiring the record output to stay at the membership script;
- requiring the owner public key hash to remain unchanged;
- allowing only burn, or board-approved succession, to move membership.

This is contract-enforced, not ledger-enforced. The token must never be sent to a normal wallet or DEX.

### 5.3 Mint/burn authority

- `MEMBER` and split tokens are minted only by the membership validator.
- Minting requires a valid KYC attestation, board admission, correct annual amount, current year, and bank deposit attestation.
- Burning requires exit or founder conversion/claim.
- The state NFT authenticates config.
- Proposal/vote/claim NFTs are minted by their respective validators.

### 5.4 Bank IDR trust model

The co-op holds IDR in three segregated accounts:

| Account | Holds | Withdrawal rule |
|---|---|---|
| Deposit reserve | 100% of `IDR-DEP` liabilities | Refunds only |
| Project account | `PROJ` contributions + realized project returns | Approved projects and exit claims |
| Operating account | Operating reserve from profit | Approved operating budget |

Controls:

- accounts in the koperasi’s legal name;
- dual signatories / board multisig;
- payment provider (Xendit/Midtrans/Flip) for virtual accounts and payouts;
- monthly reconciliation;
- annual independent audit.

The chain cannot verify the bank balance or prevent a fraudulent transfer. The trust boundary is the board, bank mandate, auditor, and koperasi law. The chain enforces governance, approvals, budgets, token balances, and exit rules.

### 5.5 Proof of reserves

- `ReserveAttestation` records bank balance and outstanding `IDR-DEP`.
- Issued monthly/quarterly by treasurer + auditor.
- Public dashboard shows coverage.
- Minting requires the latest attestation to show 100% coverage after the new deposit.
- If coverage falls below 100%, project spending halts and the board must remediate.

---

## 6. Smart contract architecture

### 6.1 Validators and policies

| Module | Responsibility |
|---|---|
| `config` | State NFT; annual amount, splits, quorum, windows, board keys, KYC issuer, token policies |
| `membership` | Member records; `MEMBER`, `IDR-DEP`, `PROJ` mint/burn; deposit; voting record; founder lock/vesting; conversion; exit request |
| `governance` | Proposals, bonds, one-member-one-vote, quorum, batched tally, execution |
| `treasury` | Project pool budgets, tranches, spending, cancel/refund |
| `attestation` | KYC, bank deposit, reserve, and project spending attestations |
| `distribution` | Profit-share Merkle root, claims, double-claim prevention |
| `exit` | Annual exit window, deposit refund, project capital book value, founder claim, deferred payout |
| token policies | `MEMBER`, `IDR-DEP`, `PROJ`, `STATE`, `PROPOSAL`, `VOTE`, `CLAIM` |

### 6.2 State model

```text
Config UTxO          — state NFT, parameters
MemberRecord UTxO    — one per member; holds MEMBER + IDR-DEP + PROJ
Proposal UTxO        — one per proposal; PROPOSAL NFT
Vote UTxO            — one per member per proposal; VOTE receipt
Project UTxO         — one per approved project; budget/spent
Distribution UTxO    — one per profit distribution; Merkle root
ExitClaim UTxO       — one per exiting member; deferred payout
KycAttestation UTxO  — issuer attestation; no PII
BankAttestation UTxO — deposit/reserve/spend attestations
```

Use CIP-31 reference inputs for config and CIP-33 reference scripts to stay under transaction size limits.

### 6.3 Datum schemas

```aiken
pub type ConfigDatum {
  state_nft: AssetName,
  annual_amount: Int,
  deposit_bps: Int,
  project_bps: Int,
  founder_deposit_bps: Int,
  founder_project_bps: Int,
  founder_cliff_months: Int,
  founder_vesting: List<(Int, Int)>,
  quorum_bps: Int,
  project_threshold_bps: Int,
  structural_threshold_bps: Int,
  timelock_days: Int,
  exit_window_start: Int,
  exit_window_end: Int,
  deposit_asset: AssetClass,
  treasury_address: Address,
  board_keys: List<VerificationKeyHash>,
  board_threshold: Int,
  kyc_issuer: PolicyId,
  member_policy: PolicyId,
  deposit_policy: PolicyId,
  project_policy: PolicyId,
}

pub type MemberDatum {
  owner: VerificationKeyHash,
  member_id: ByteArray,
  class: MemberClass,
  join_time: Int,
  idr_deposit: Int,
  project_capital: Int,
  last_deposit_year: Int,
  last_voted_proposal: Option<Int>,
  founder_lock_until: Option<Int>,
  release_schedule: List<(Int, Int)>,
  status: MemberStatus,
  kyc_credential: ByteArray,
  kyc_expiry: Int,
}

pub type ProposalDatum {
  id: Int,
  proposer: VerificationKeyHash,
  kind: ProposalKind,
  title_hash: ByteArray,
  metadata_uri: ByteArray,
  amount: Int,
  recipient: Address,
  milestones: List<Milestone>,
  start: Int,
  end: Int,
  snapshot: Int,
  eligible_count: Int,
  yes: Int,
  no: Int,
  abstain: Int,
  status: ProposalStatus,
  bond: Int,
}

pub type VoteDatum {
  proposal_id: Int,
  member_id: ByteArray,
  choice: Choice,
  weight: Int,
  receipt_nft: AssetName,
}

pub type ProjectDatum {
  proposal_id: Int,
  budget: Int,
  spent: Int,
  milestones: List<Milestone>,
  status: ProjectStatus,
}

pub type ExitClaimDatum {
  member_id: ByteArray,
  amount: Int,
  paid: Int,
  release_schedule: List<(Int, Int)>,
  status: ClaimStatus,
  beneficiary: VerificationKeyHash,
}

pub type KycDatum {
  issuer: PolicyId,
  member_commitment: ByteArray,
  level: Int,
  issued_at: Int,
  expires_at: Int,
  revoked: Bool,
}
```

### 6.4 Redeemers/actions

```text
Config:     UpdateParams | RotateBoard | Migrate
Membership: Join | Deposit | Vote | RequestExit | CompleteExit | ConvertFounder | RotateOwner
Governance: CreateProposal | CastVote | TallyBatch | FinalizeTally | Execute | Cancel
Treasury:   CreateProject | SpendTranche | CancelProject | CloseProject
Attestation: KycIssue | KycRevoke | BankDeposit | ReserveAttest | SpendAttest
Distribution: CreateDistribution | Claim | CloseDistribution
Exit:       RequestExit | SettleDeposit | SettleProjectCapital | CreateFounderClaim | PayClaim
```

### 6.5 Transaction flows

1. **Join/deposit:** config reference input + KYC attestation + bank attestation + member record → mint tokens.
2. **Vote:** spend member record → update `last_voted_proposal` → mint vote receipt → create vote UTxO.
3. **Tally:** consume batches of vote UTxOs → update proposal counters → finalize.
4. **Execute:** proposal + treasury → create project UTxO or update config.
5. **Spend tranche:** project + proposal + board signatures + bank attestation → update project.
6. **Distribution:** audit attestation + proposal → distribution UTxO → Merkle claims.
7. **Exit:** member record + exit window + reserve attestation → burn tokens → pay/claim.
8. **Founder conversion:** member record + time ≥ month 60 → class update → clear lock.

### 6.6 Security invariants

- `IDR-DEP` supply ≤ attested reserve.
- Refundable reserve is never spent on projects or operations.
- One vote per member per proposal.
- Project spending ≤ approved budget.
- Exit only during the annual window.
- Founder vesting and conversion follow the schedule.
- Split changes affect only future deposits.
- No double claim or double refund.
- Member tokens cannot leave the member record.
- Config updates require the correct quorum/timelock.
- Token conservation: minted = burned + held.

### 6.7 Upgrade and migration

- Contracts are immutable.
- A supermajority + timelock migration proposal can move funds/state to a new version.
- No unilateral board upgrade key.
- State NFT identifies the canonical config.
- New version must preserve member balances and claims.

---

## 7. Off-chain architecture

### 7.1 Monorepo

```text
co-op/
  contracts/                 # Aiken validators + tests
  apps/
    web/                     # Vite + React SPA; inbound UI adapter
    api/                     # Elysia + Bun; composition root
      src/
        contexts/
          identity/          # KYC, admission
          membership/        # member lifecycle, class, status
          capital/           # contributions, IDR-DEP, PROJ, vesting, book value
          governance/        # proposals, votes, quorum, tally
          projects/          # project budgets, tranches, spending
          distributions/     # profit share, claims
          exits/             # exit window, refunds, founder claims
          banking/           # bank accounts, deposits, payouts, reconciliation
        shared/
          domain/            # Money, Ids, Result, TimeWindow
          application/       # UnitOfWork, EventPublisher, Clock ports
        read-models/         # dashboard/query projections
        composition/         # dependency wiring
    indexer/                 # chain-event inbound adapter -> read models
    issuer/                  # KYC/bank webhook inbound adapter
  packages/
    offchain/                # Lucid chain adapter support; no domain logic
    shared/                  # cross-context types, Zod schemas, constants
    ui/                      # optional shared React components
  docs/
```

Each bounded context uses the same internal shape:

```text
context/
  domain/
    entities/
    value-objects/
    services/
    events/
    ports/
  application/
    commands/
    queries/
    use-cases/
    ports/
  adapters/
    inbound/
      http/
      webhooks/
      jobs/
    outbound/
      postgres/
      cardano/
      kyc/
      payments/
```

Dependency rule:

```text
domain        <- application <- adapters
domain        <- adapters
composition   -> everything
```

`domain` must not import Elysia, Drizzle, Lucid, Bun APIs, `process.env`, or HTTP types. The `composition` root wires concrete adapters to ports.

### 7.2 Tech stack

| Layer | Choice |
|---|---|
| Architecture pattern | Modular monolith + DDD + hexagonal ports/adapters |
| Smart contracts | Aiken / Plutus V3 |
| On-chain SDK | TypeScript + Lucid Evolution |
| Runtime/package manager | Bun |
| API | Elysia + Eden Treaty |
| Frontend | Vite + React + TypeScript |
| Routing | TanStack Router |
| Server state | TanStack Query |
| UI | Tailwind + shadcn/ui |
| Forms/validation | React Hook Form + Zod |
| Database | PostgreSQL + Drizzle + `postgres.js` |
| Indexer | Blockfrost/Maestro for MVP; Kupo/Ogmios/Oura later |
| Jobs | Postgres-based queue (`pg-boss` or `FOR UPDATE SKIP LOCKED`) |
| KYC | Privy primary; Sumsub AML/global |
| Payments | Xendit/Midtrans/Flip virtual accounts and payouts |
| Public docs | IPFS |
| Private KYC data | Encrypted S3/R2 |
| Auth | CIP-30 `signData` + JWT |
| Testing | Aiken tests, Lucid emulator, Yaci DevKit, `bun test`, Playwright |
| CI/CD | GitHub Actions; Docker `oven/bun`; static frontend CDN |
| Monitoring | Sentry, Grafana/Better Stack |

### 7.3 API

Suggested Elysia modules:

```text
/auth          nonce, verify, session
/members       profile, deposit status, voting power, founder vesting
/proposals     list, detail, create, vote, tally, execute
/projects      list, detail, spend, cancel
/treasury      reserve coverage, project pool, attestations
/distributions list, claim
/exit          request, status, claims
/admin         KYC/bank attestations, reconciliation, founder conversion
/tx            build unsigned transactions, submit signed transactions
/health        liveness/readiness
```

Use Elysia TypeBox validation and export the `App` type for Eden Treaty.

### 7.4 Indexer

- Sync chain events into PostgreSQL.
- Tables: members, kyc_attestations, deposits, proposals, votes, projects, distributions, claims, bank_attestations, audit_logs.
- Reconcile on-chain state with bank statements.
- Jobs: tally, distribution Merkle roots, KYC expiry, deferred claims, notifications.
- Expose read APIs to the web app.

### 7.5 Issuer service

- Receives Privy/Sumsub webhooks.
- Verifies KYC result and board admission.
- Signs and submits KYC attestations.
- Receives bank/payment webhooks.
- Creates deposit attestations with unique bank references.
- Publishes reserve attestations.
- Keys in KMS/HSM or multisig; never in the web app.

### 7.6 Frontend routes

```text
/                     Dashboard
/onboarding           KYC, admission, wallet connection
/deposit              Annual deposit
/proposals            Proposal list
/proposals/:id        Proposal detail, vote, tally
/projects             Projects and budgets
/projects/:id         Project spending and evidence
/treasury             Reserve coverage, project pool, attestations
/distributions        Profit distributions and claims
/exit                 Exit window, refund status, founder claims
/admin                Board/issuer tools
```

### 7.7 Transaction building

- Simple member txs can be built in the browser and signed by the wallet.
- Complex/privileged txs are built by the API and signed by the board/issuer multisig or returned as unsigned CBOR.
- Provider keys stay in the API.
- Use the shared `packages/offchain` Lucid builders.

### 7.8 Auth

1. `POST /auth/nonce`.
2. Wallet `signData(nonce)`.
3. `POST /auth/verify`.
4. JWT or httpOnly cookie.

Use same-origin reverse proxy to avoid CORS/cookie issues.

### 7.9 KYC integration

- Privy for Indonesian e-KYC (Dukcapil, OJK-registered).
- Sumsub for AML/sanctions/transaction monitoring and foreign members.
- Manual board KYC fallback for the pilot.
- No PII on-chain.

### 7.10 Bank/payment integration

- Virtual accounts for member deposits.
- Webhook confirms payment.
- Treasurer attestation links bank reference to on-chain deposit.
- Batch payouts for refunds/distributions under dual control.
- Monthly reconciliation and annual audit.

### 7.11 Domain-driven design and hexagonal architecture

Use a **modular monolith** first: one API deployment, one PostgreSQL database, and clear module boundaries. Do not split into microservices or event sourcing for the MVP. Extract a context into a separate service only when scaling or team ownership requires it.

#### Bounded contexts

| Context | Responsibility | Aggregate(s) |
|---|---|---|
| **Identity** | KYC attestations, provider webhooks, admission eligibility | `KycCase` |
| **Membership** | Member lifecycle, class, status, wallet ownership, conversion | `Member` |
| **Capital** | Annual contribution split, `IDR-DEP`, `PROJ`, founder vesting, book value | `MemberCapital`, `VestingSchedule` |
| **Governance** | Proposals, bonds, votes, quorum, tally, execution | `Proposal` |
| **Projects** | Project budgets, milestones, tranches, spending, cancellation | `Project` |
| **Distributions** | Profit calculation, Merkle root, claims | `Distribution` |
| **Exits** | Exit window, deposit refund, project-capital settlement, founder claims | `ExitRequest`, `ExitClaim` |
| **Banking** | Bank accounts, deposits, payouts, reconciliation, reserve attestations | `BankAccount`, `Attestation` |
| **Chain access** | Cardano provider, transaction building/submission, indexer | Infrastructure, not a domain context |

Context relationships:

- **Identity → Membership**: a verified KYC case is required for admission.
- **Membership → Capital**: `MemberAdmitted` creates capital accounts.
- **Governance → Projects/Distributions**: `ProposalPassed` authorizes a project or distribution.
- **Capital → Distributions/Exits**: balances and book value determine payouts.
- **Banking → Capital/Distributions**: confirmed deposits and payouts update capital and claims.
- **Chain access** is a shared outbound adapter used by the other contexts.

#### Domain layer

Aggregates:

- **Member** — owner, class, status, KYC reference, join time, last deposit year, last voted proposal.
- **MemberCapital** — `IDR-DEP` and `PROJ` balances, founder vesting, book value, claims.
- **Proposal** — kind, budget, recipient, milestones, voting window, quorum, tally, status.
- **Project** — approved budget, spent amount, milestones, status.
- **Distribution** — total profit, Merkle root, asset, deadline, claimed amount.
- **ExitClaim** — member, amount, paid amount, release schedule, beneficiary, status.
- **Config** — annual amount, splits, thresholds, windows, board keys, token policies.

Value objects:

```text
MemberId, ProposalId, ProjectId, ClaimId
IdrAmount, BasisPoints, AssetClass
MemberClass (Standard | Founder)
KycStatus, MemberStatus
TimeWindow, VestingSchedule
MerkleRoot, TxHash
```

Enum-like domain values use `SCREAMING_SNAKE_CASE` (`STANDARD`, `FOUNDER`, `ACTIVE`, `PASSED`). UI labels are separate and never render raw enum values.

Domain services/policies:

```text
ContributionSplitPolicy
FounderVestingPolicy
QuorumPolicy
ProfitDistributionPolicy
BookValuePolicy
RefundWaterfallPolicy
MembershipAdmissionPolicy
```

Domain events:

```text
MemberAdmitted
KycAttested
AnnualDepositRecorded
VoteCast
ProposalPassed
ProjectTrancheSpent
ProfitDistributed
ExitRequested
DepositRefunded
FounderConverted
ClaimPaid
```

Keep the ubiquitous language consistent in code, UI, contracts, and legal documents. The glossary in Appendix C is the source of terms.

#### Ports and adapters

**Inbound adapters**:

- Elysia HTTP routes.
- KYC provider webhooks.
- Bank/payment provider webhooks.
- Scheduled jobs (tally, distribution, KYC expiry, claims).
- CLI/admin commands.
- Indexer event consumer.

**Outbound ports**:

```text
MemberRepository
CapitalRepository
ProposalRepository
ProjectRepository
DistributionRepository
ClaimRepository
ConfigRepository
ChainGateway          // build, sign, submit, query
KycGateway            // Privy/Sumsub
BankGateway           // Xendit/Midtrans/Flip/bank
DocumentStore         // IPFS/S3
NotificationGateway   // email, push
EventPublisher
UnitOfWork
Clock
IdGenerator
```

**Outbound adapters**:

- PostgreSQL repositories using Drizzle.
- Cardano adapter using Lucid + Blockfrost/Maestro.
- Privy/Sumsub adapter.
- Xendit/Midtrans/Flip adapter.
- IPFS/S3 adapter.
- Email/notification adapter.

The domain depends only on ports. The composition root in `apps/api/src/composition` wires the concrete adapters.

#### Application use cases

Commands:

```text
AdmitMember
RecordAnnualDeposit
CreateProposal
CastVote
TallyProposal
ExecuteProposal
SpendProjectTranche
CreateDistribution
ClaimProfit
RequestExit
SettleExit
CreateFounderClaim
PayFounderClaim
ConvertFounder
RenewKyc
```

Queries:

```text
GetMemberDashboard
ListProposals
GetProposal
GetProject
GetTreasuryState
ListDistributions
GetExitStatus
```

Command use cases load aggregates, enforce domain rules, persist through repositories, and publish domain events. Query handlers read projections directly; they do not load aggregates.

#### Consistency with Cardano

The chain is the source of truth for on-chain state. PostgreSQL is a projection plus off-chain data.

Do not attempt a distributed transaction across Postgres and Cardano. Use:

- a transaction state machine: `Draft → Built → Signed → Submitted → Confirmed | Failed`;
- idempotency keys for deposits, votes, claims, and payouts;
- an outbox table for domain events and notifications;
- reconciliation jobs that compare chain state, database projections, and bank statements;
- explicit compensation for failed or stuck transactions.

The domain validates business rules for early feedback. Aiken validators enforce the final invariants. Keep the two in sync with shared test vectors and contract tests generated from `plutus.json`.

#### Elysia mapping

```text
HTTP request
  → Elysia TypeBox validation
  → map to command/query
  → application use case
  → domain result
  → map domain errors to HTTP status
  → response
```

Routes contain no business logic. They only parse, authorize, dispatch, and map errors. Elysia plugins provide auth, request IDs, logging, and rate limits.

#### Read models

- The indexer writes denormalized read models for dashboards and lists.
- Read models may use direct SQL and do not need repositories or aggregates.
- Do not reuse write aggregates for high-volume dashboards.
- Never let a read model become the source of truth for a command.

#### Testing and boundary enforcement

- **Domain tests**: pure TypeScript, no mocks, no DB, no chain.
- **Application tests**: in-memory fakes for ports.
- **Adapter tests**: Postgres testcontainers, Lucid emulator, Yaci DevKit.
- **Contract tests**: Aiken tests plus shared vectors with the domain.
- **Boundary tests**: `dependency-cruiser` or ESLint `import/no-restricted-paths` to block domain → infrastructure imports.
- **Architecture tests**: verify every context has domain/application/adapters and that composition is the only wiring point.

#### Deliberately avoided

- Microservices for the MVP.
- Event sourcing.
- A generic repository framework.
- A CQRS framework.
- Domain entities shared across bounded contexts.
- A domain layer for simple CRUD admin screens.
- Abstracting Cardano UTxOs into fake “database rows” inside the domain.

---

## 8. Testing and audit

### 8.1 Unit/property tests

- Each validator’s happy path and failure cases.
- Token mint/burn authorization.
- Datum transitions.
- Founder vesting/conversion.
- Split calculations.
- Merkle proof verification.

### 8.2 Invariant tests

- `IDR-DEP` supply ≤ reserve.
- Refund reserve not spent.
- One vote per member per proposal.
- Project spend ≤ budget.
- Exit only in window.
- No double claim/refund.
- Non-transferability.
- Config authorization.

### 8.3 Emulator/devnet

- Lucid emulator end-to-end scenarios.
- Yaci DevKit local devnet.
- Preprod deployment with mock KYC/bank attestor.

### 8.4 Preprod pilot

- 10–30 test members.
- Full annual cycle compressed in time.
- Founder vesting accelerated for testing.
- Incident runbook.

### 8.5 Audit

- Independent Aiken/Plutus audit before mainnet.
- Audit scope: membership, governance, treasury, distribution, exit, attestations.
- Fix findings and re-test.

### 8.6 CI

```text
aiken fmt --check
aiken check
aiken build
aiken test
bun test
bun run test:domain
bun run typecheck
bun run arch:check
bun run build
```

`arch:check` uses `dependency-cruiser` or ESLint `import/no-restricted-paths` to enforce the hexagonal dependency rule. Add contract size and execution-budget checks.

---

## 9. Delivery plan

### Phase 0 — specification and legal (2–4 weeks)

- Finalize co-op terms and bylaws.
- Legal opinion on koperasi, token, KYC, tax, custody.
- Final datum schemas and ADRs.
- Context map, aggregate boundaries, port/adapter contracts, and dependency rules.
- Choose KYC/payment providers.
- Confirm founder vesting and conversion.

### Phase 1 — core contracts (4–6 weeks)

- Config, membership, token policies.
- Join/deposit, KYC/bank attestations.
- Founder class and vesting.
- Unit and property tests.

### Phase 2 — governance and treasury (4–6 weeks)

- Proposals, voting, tally, execution.
- Project budgets, tranches, spending.
- Cancel/refund flows.

### Phase 3 — distribution and exit (3–4 weeks)

- Profit distribution and Merkle claims.
- Annual exit window.
- Founder claims and conversion.
- Deferred payout logic.

### Phase 4 — off-chain and web (4–6 weeks)

- Domain model and application use cases per bounded context.
- Postgres repositories and outbound adapters.
- Elysia inbound adapters and composition root.
- Indexer and read models.
- Vite/React app.
- Wallet auth and tx building.
- Admin tools.

### Phase 5 — integrations and pilot (4–6 weeks)

- Privy/Sumsub.
- Xendit/Midtrans/Flip.
- Preprod pilot.
- Audit preparation.

### Phase 6 — audit and mainnet (6–8 weeks)

- Audit and fixes.
- Legal/accounting sign-off.
- Mainnet deployment with caps.
- Monitoring and incident response.

**MVP estimate:** 10–14 weeks with a focused team.  
**Mainnet-ready estimate:** 6–9 months including legal and audit.

### Team

- 1 Aiken/Plutus engineer.
- 1 full-stack TypeScript engineer.
- 1 frontend engineer.
- Part-time DevOps/security.
- Legal/accounting counsel.
- Product/ops lead.

A solo developer should expect a longer timeline.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Koperasi/founder class not permitted | Legal opinion; fallback to founder loan/grant or separate PT |
| Founder lock-up unenforceable | Draft as capital redemption lock, not resignation ban; counsel |
| Bank IDR not verifiable on-chain | Segregated accounts, dual control, monthly reconciliation, audit |
| Bank fraud or failure | Dual signatories, payment provider, audit, insurance review |
| KYC privacy breach | No PII on-chain, encryption, access control, DPA, retention policy |
| KYC provider outage | Manual fallback; secondary provider |
| Smart contract bug | Audit, property tests, caps, timelock, migration path |
| eUTxO contention | One record per member; batched tally; Merkle claims; reference inputs |
| Redemption wave at year 5 | Graded founder release; liquidity reserve; project maturity matching |
| Project pool illiquidity | Tranches, milestones, cancel vote, maturity limits |
| Voter apathy | Quorum design, notifications, simple UX |
| Regulatory change | Monitor OJK/BI; no public stablecoin; legal review |
| Tax/accounting complexity | Accountant involved from phase 0 |
| Key loss/compromise | Multisig, hardware wallets, KMS, recovery runbook |

---

## 11. Open decisions

1. Annual amount and inflation adjustment: board proposes + member vote, or bounded board authority?
2. Exact annual calendar dates.
3. Profit distribution ratio and reserve target.
4. Initial operating runway: founders, grant, or onboarding fee?
5. Profit payout asset: IDR bank or USDCx?
6. Missing annual deposit: inactive/grace/expulsion rules.
7. Membership admission: board-only or board + member vote?
8. Board size/threshold and key recovery.
9. Founder deposit treatment on resignation: refund at annual window or lock for 5 years?
10. Standard member project-share cap: 30% default, 50% max?
11. Whether to offer open risk tiers beyond founders.
12. KYC provider final choice: Privy only, Sumsub only, or both.
13. Whether to add a public Astro site for proposals/docs.
14. Audit firm and budget.
15. Legal counsel and koperasi registration timeline.

---

## 12. Appendices

### A. Founder vesting example

Founder project capital: IDR 800,000,000 (illustrative).

| Time | Vested | Redeemable at annual window |
|---|---:|---:|
| Month 36 | 0% | 0 |
| Month 48 | 50% | 400,000,000 |
| Month 60 | 100% | 800,000,000 |

With annual windows at months 48 and 60:

- year 4: 50% redeemable;
- year 5: 100% redeemable.

### B. Profit/loss example

Standard member:
- annual contribution IDR 1,000,000;
- deposit 700,000;
- project capital 300,000.

Founder:
- annual contribution IDR 1,000,000;
- deposit 200,000;
- project capital 800,000.

If the project pool earns IDR 100,000,000 and total project capital is IDR 1,000,000,000:

- profit per project-capital unit = 10%;
- standard member receives 30,000;
- founder receives 80,000.

If the project pool loses 10%, standard project capital becomes 270,000; founder becomes 720,000. Deposits are unaffected.

### C. Glossary

- **Koperasi** — Indonesian cooperative legal entity.
- **Simpanan** — member savings.
- **SHU** — distributable surplus/profit.
- **RAT** — annual members’ meeting.
- **Pengurus** — board.
- **Pengawas** — supervisory board.
- **IDR-DEP** — refundable IDR deposit receipt token.
- **PROJ** — project capital token.
- **Book value** — audited net asset value per project-capital unit.
- **Exit claim** — deferred project-capital payout.
- **CIP-30** — Cardano wallet connector.
- **CIP-31/32/33** — reference inputs, inline datums, reference scripts.
- **CIP-68** — NFT metadata standard.
- **Aiken** — smart contract language for Cardano.
- **Lucid** — TypeScript transaction builder.
- **Elysia** — Bun-first TypeScript API framework.

### D. References

- OJK POJK 27/2024: https://ojk.go.id/id/regulasi/Pages/POJK-27-2024-AKD-AK.aspx
- OJK POJK 23/2025: https://ojk.go.id/id/regulasi/Pages/POJK-23-2025-Perubahan-POJK-27-Tahun-2024-tentang-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-Termasuk-Aset-Kripto.aspx
- OJK stablecoin regulation target (Jan 2027): https://en.tempo.co/read/2121273/indonesia-targets-stablecoin-regulations-by-early-2027-ojk-says
- Law No. 4 of 2026 summary: https://www.hsfkramer.com/notes/indonesia/2026-posts/indonesia-reshapes-digital-asset-and-cryptocurrency-framework-with-2026-financial-services-omnibus-law
- Bank Indonesia PBI 20/6/PBI/2018 on Electronic Money: https://www.bi.go.id/en/publikasi/peraturan/Pages/PBI-200618.aspx
- Cardano stablecoins: https://cardano.org/stablecoins/
- Cardano CIPs: https://cips.cardano.org
- Aiken: https://aiken-lang.org
- Elysia: https://elysiajs.com
- Bun: https://bun.sh
- TanStack Router: https://tanstack.com/router
- Privy: https://privy.id
- Sumsub Indonesia: https://sumsub.com/id/kyc-compliance/
- Verihubs: https://verihubs.com
- VIDA: https://vida.id
