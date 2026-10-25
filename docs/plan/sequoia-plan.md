# Sequoia on Cardano — Product, Legal, and Technical Plan

**Status:** Draft — implementation in progress  
**Date:** 2026-10-22  
**Scope:** Indonesia-based co-op (cooperative) with Member Capital equity, at-risk `Capital Participation`, on-chain governance, and bank IDR custody.  
**Plan location:** `docs/plan/sequoia-plan.md`

> This is a product and technical plan, not legal advice. Indonesian counsel must review the cooperative structure, token characterization, KYC/AML, tax, and custody before mainnet.

---

## 0. Executive summary

The co-op is a member-owned organization that:

- collects a fixed annual contribution from every member;
- splits the contribution into redeemable `Member Capital` equity and at-risk
  `Capital Participation`;
- funds member-approved projects from the `Capital Participation` pool;
- shares surplus on two keys — member participation (patronage) and capital weight base
  (`Member Capital` + `Capital Participation`) — with losses absorbed by the endowment
  fund before `Capital Participation`;
- gives every member one vote, regardless of capital;
- redeems `Member Capital` and settles `Capital Participation` at book value in the
  annual exit window;
- uses member-only, non-transferable `Member Capital` and `Capital Participation`
  records on Cardano;
- keeps actual IDR in segregated bank accounts, with on-chain governance and accounting.

### Key decisions

| Area | Decision |
|---|---|
| Legal form | Indonesian cooperative |
| Member token | Non-transferable `Member Capital` equity record (`MCAP`), 1 unit = 1 IDR; redeemable at 100% at exit from the redemption reserve; not a deposit or a liability |
| Project token | Non-transferable `Capital Participation` record (`PROJ`); at-risk; settled at audited book value |
| Standard member split | 70% `Member Capital` / 30% `Capital Participation` |
| Founder split | Same 70/30; founders may commit an additional initial `Capital Participation` that is 100% at-risk |
| Founder lock-up | 3-year cliff + 50% annual vesting at years 4 and 5 on founder `Capital Participation`; fully released at year 5 |
| Founder conversion | Automatic to standard member at year 5 |
| Surplus | 20% Endowment Reserve / 2.5% Education Fund / 52.5% patronage / 25% capital, changeable by members' meeting (ADR 0005) |
| Capital weight | `Member Capital` + `Capital Participation` at contributed value (ADR 0005) |
| Losses | Absorbed by the Endowment Reserve first, then reduce `Capital Participation` (ADR 0006) |
| Voting | One member, one vote |
| Quorum | 50% of active members |
| Project spending | >50% of votes cast with 50% quorum |
| Structural changes | Two-thirds of votes cast with 50% quorum; 7-day timelock |
| Exit window | 30 days after the annual surplus distribution |
| `Member Capital` redemption | 100% of contributed amount from the redemption reserve, subject to solvency and liquidity; defer in request order if the reserve is short |
| `Capital Participation` settlement | Audited book value; may be above or below contributed amount; defer or create an `ExitClaim` if the project pool is illiquid; never paid from the redemption reserve |
| Founder resignation | `Member Capital` redeemed; founder `Capital Participation` becomes a locked claim at book value |
| Operating costs | Paid from revenue before surplus is computed; the operating reserve is funded before distribution |
| IDR custody | Segregated bank IDR; on-chain attestations |
| Education fund | 2.5% of surplus retained as a restricted Education Fund |
| Redemption reserve | 100% of outstanding `Member Capital`, funded by the 70% cash tranche; a liquidity policy, not bankruptcy-remote |
| Public stablecoin | Out of scope |
| KYC | Privy primary, Sumsub for AML/global; no PII on-chain |
| Smart contracts | Aiken / Plutus V3 |
| Architecture | Modular monolith with DDD + hexagonal ports/adapters |
| API | Elysia on Bun |
| Frontend | Vite + React + TanStack Router |
| On-chain SDK | TypeScript + Lucid Evolution |
| Database | PostgreSQL + Drizzle |
| Initial network | Preprod with mock IDR and mock KYC |

### Current implementation handoff — 2026-10-25

**Repository:** `Sequoia`  
**Package scope:** `@sequoia/api`, `@sequoia/shared`  
**Architecture:** modular monolith + DDD + hexagonal ports/adapters  
**Stack:** Bun, Elysia, Drizzle, PostgreSQL, citty, Vite/React later, Aiken later  
**Test command:** `bun run check`  
**Current status:** 89 tests pass, typecheck clean

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
11. EdDSA JWT keys: `kid`, JWKS endpoint, key rotation.
12. Docker Compose: Postgres, Redis, one-shot migrate, API, healthchecks.
13. Package-based auth rate limiting (`elysia-rate-limit`).
14. Identity context: manual KYC attestations, issuers, expiry, revocation, supersede-on-renewal, admission gate, `sequoia kyc` CLI, `/members/me` KYC block (see ADR 0002).
15. Capital primitives: `CapitalParameters` + validation, split passed into `splitContribution` and snapshotted per contribution, `GLOSSARY.md`, ADR 0003.

#### Current auth decisions

- Nonce: **5 minutes**, single-use, bound to wallet address.
- Nonce storage: **PostgreSQL** (`auth_nonces`), atomic consume with `DELETE ... RETURNING`.
- Access JWT: **1 hour**, stateless.
- JWT claims: `iss=sequoia`, `aud=sequoia-api`, `sub=<pkh>`, `pkh`, `jti`, `iat`, `exp`.
- Current algorithm: **EdDSA / Ed25519** with `kid` and public JWKS.
- `JWT_PRIVATE_KEYS` accepts comma-separated keys; the last signs, all verify.
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

1. **Capital context**: annual contribution split, `MCAP`/`PROJ` ledger, founder vesting, book value.
2. **Governance context**: proposals, one-member-one-vote, quorum/threshold, batched tally.
3. **Aiken Phase 1**: config, membership, token policies, join/contribution.
4. **KYC provider adapter** (Privy/Sumsub) with webhook signature verification, when a provider is chosen.
5. **Redis-backed rate limiter** only when multi-instance/high-volume requires it.

#### Known limitations

- Rate limiter is in-memory and per-instance.
- No mainnet/testnet address network validation in auth.
- No refresh token/session revocation yet.
- Redis is not wired into the application.
- KYC evidence is never verified: `evidence_ref` is an auditable pointer, not a proof.
- Revoked or expired KYC does not freeze an existing member (no governance/exit gates yet).
- Board approval is not recorded; admission is gated on KYC only.
- New contributions are not gated on KYC validity (no capital context yet).
- Aiken contracts, capital/governance contexts, and frontend are not built yet.

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
- Enforce that the `Member Capital` redemption reserve is never spent on projects.
- Fund projects only through member-approved proposals and budgets.
- Share surplus fairly according to member participation and the capital weight base (ADR
  0005).
- Allow founders to seed a larger initial `Capital Participation` pool without putting standard members’ `Member Capital` at risk.
- Provide a clean annual exit window and deferred `Capital Participation` settlement.
- Keep personal data off-chain and minimize on-chain identity data.
- Build a testnet MVP that can be audited before mainnet.

### 1.2 Non-goals for v1

- Issuing a public, transferable IDR stablecoin.
- Public trading of co-op tokens.
- Fully on-chain IDR custody.
- Zero-knowledge voting.
- Tokenized project ownership or real-world assets.
- Mobile native apps.
- Global membership outside the initial cooperative jurisdiction.
- Automated legal/tax filings.

---

## 2. Legal and regulatory frame

### 2.1 Legal form

Use an Indonesian **cooperative** because it matches:

- one member, one vote;
- `Member Capital`;
- `Capital Participation`;
- surplus sharing;
- an annual members' meeting;
- a board and a supervisory board.

Requirements to confirm with counsel:

- legal deed and Ministry approval/decree;
- business registration number and tax identification number;
- member register and KYC;
- the annual members' meeting and financial statements;
- whether a **savings and loan cooperative** licence is required;
- whether the cooperative may hold crypto/stablecoins;
- tax treatment of `Member Capital`, `Capital Participation`, surplus, and crypto transactions.

### 2.2 Token characterization

The co-op uses two member-only, non-transferable capital records:

- **`MCAP` (Member Capital)** — redeemable equity. 1 unit = 1 IDR; `Member Equity`; redeemable at 100% of the contributed amount at the annual exit window from the redemption reserve; earns a variable `return on capital` (ADR 0005). It is **not** a deposit, not a liability, and not LPS-insured.
- **`PROJ` (Capital Participation)** — at-risk capital. 1 unit = 1 IDR contributed; book value fluctuates; settled at audited book value at exit; may be above or below the contributed amount; never paid from the redemption reserve.

Both are locked in the member’s on-chain record, not tradable, not transferable, and not used as a payment instrument. `MCAP` is not a deposit receipt; the 100% promise applies to `Member Capital` only. The 100% redemption reserve is a liquidity policy, not a trust or a bankruptcy-remote ring-fence; members remain exposed to the co-op’s insolvency.

A public, transferable IDR-backed stablecoin is **out of scope**. It would require a separate Indonesian limited liability company and OJK licensing.

### 2.3 KYC/AML and privacy

- KYC is performed off-chain by Privy (primary Indonesian e-KYC) and/or Sumsub (AML/sanctions/global).
- Only a salted commitment, issuer, KYC level, expiry, and revocation status go on-chain.
- No names, NIK, passports, addresses, selfies, or documents on-chain.
- The co-op remains the data controller; the KYC provider is a processor.
- Comply with Indonesia’s PDP Law (Law No. 27 of 2022) and Government Regulation No. 33 of 2026 (effective 16 January 2027): a lawful basis per purpose (contract or legal obligation for KYC/AML/tax; consent only for optional processing), retention, access/correction, DPIA, DPO, breach runbook, and cross-border transfer review.
- Privacy roadmap: pseudonymous IDs now, commit-reveal voting later, ZK later.

### 2.4 Regulatory watch

As of 19 October 2026:

- **Law No. 4 of 2026** (financial-sector omnibus amendment) creates OJK licensing categories for crypto/digital asset institutions; stablecoins may be used as transaction instruments but are not payment instruments.
- **OJK Regulation No. 27 of 2024**, as amended by **OJK Regulation No. 23 of 2025**, regulates digital financial asset/crypto trading. It does not regulate primary offerings.
- A **draft OJK Regulation on Digital Financial Asset Offerings** would regulate issuance. Reported draft requirements include an Indonesian limited liability company, OJK licence for public offerings above IDR 1 billion, 100% reserves, segregated custody, and eligible reserve assets.
- OJK targets a **stablecoin-specific OJK Regulation around January 2027**.
- **Bank Indonesia Regulation No. 20/6/PBI/2018** on electronic money applies if a token functions as e-money/payment.
- The cooperative must confirm whether holding crypto/stablecoins is permitted under its articles and business licence.

### 2.5 Open legal questions

- Can a cooperative have a temporary founder class that uses the same 70/30 split but allows an additional initial `Capital Participation`?
- Is a 5-year lock-up on founder `Capital Participation` enforceable?
- Can a resigned founder hold a non-voting `Capital Participation` claim?
- Is `Member Capital` with a 100% exit redemption properly classified as `Member Equity`; how does PSAK 50/71 treat the redemption obligation?
- Can the cooperative use `Capital Participation` under Article 42; what does the implementing PP require?
- Does the 25% capital share satisfy the limited return on capital requirement (Article 5(1)(d)), and does 2.5% satisfy the education allocation?
- How should the annual capital distribution and the `Capital Participation` book value be reconciled so the same surplus is not paid twice?
- Does the co-op need a savings and loan cooperative licence if it does not lend member funds and does not offer withdrawable savings?
- What OJK/BI reporting applies to the bank IDR flows?

---

## 3. Co-op terms

### 3.1 Membership

- Membership is open to natural persons (and possibly legal entities) who pass KYC and board admission. Admission currently records only the KYC attestation; board approval is not recorded until the governance context exists.
- Each member receives one `MEMBER` NFT.
- Membership is non-transferable. Succession only through the legal process and board approval.
- One member, one vote.
- Members must pay the annual contribution during the enrollment window.
- Members must maintain a valid KYC attestation.

### 3.2 Annual contribution and split

| Class | `Member Capital` | `Capital Participation` |
|---|---:|---:|
| Standard member | 70% | 30% |
| Founder | 70% | 30% + optional additional initial `Capital Participation` |

- The annual amount is fixed in IDR and announced before enrollment.
- Every member uses the same 70/30 split. Founders may commit an additional initial `Capital Participation` under the articles of association; the extra is 100% at-risk and follows the founder lock-up/vesting.
- No member may contribute more `Member Capital` than the annual amount to gain more surplus. Extra founder `Capital Participation` is a separate, at-risk commitment.
- No prepayment or back-payment of future years.
- The split applies to each annual contribution.
- The standard `Capital Participation` share is capped at 50% by governance; the default is 30%.
- The aggregate project pool is **not** capped at 30% of capital. The hard rule is that all `Member Capital` is 100% covered by the redemption reserve.
- `Member Capital` is `Member Equity`; `Capital Participation` is a separate at-risk participation.

### 3.3 Tokens

| Token | Purpose | Transferability |
|---|---|---|
| `MEMBER` | One per member; voting and identity | Non-transferable |
| `MCAP` | `Member Capital` equity record; 1 unit = 1 IDR; 100% redemption from the reserve | Non-transferable |
| `PROJ` | `Capital Participation`; at-risk; book value fluctuates | Non-transferable |
| `STATE` | Config/treasury singleton | Protocol-controlled |
| `PROPOSAL` | Proposal identity | Protocol-controlled |
| `VOTE` | Vote receipt | Protocol-controlled |
| `CLAIM` | Deferred exit/founder/redemption claim | Non-transferable |

All member tokens are locked in the member’s on-chain record. The membership validator forbids sending them to a wallet, DEX, or third party. `MCAP` is an equity record, not a deposit receipt.

### 3.4 Founder class and vesting

Founders:

- use the same 70% `Member Capital` / 30% `Capital Participation` split as every member;
- may commit an additional initial `Capital Participation`;
- have a 3-year cliff on their founder `Capital Participation` (including the extra);
- vest 50% of founder `Capital Participation` at year 4 and 50% at year 5;
- are fully vested at year 5;
- automatically convert to standard members at year 5.

Vesting schedule:

| Time | Cumulative vested |
|---|---:|
| Months 0–36 | 0% |
| Year 4 (month 48) | 50% |
| Year 5 (month 60) | 100% |

Because exit windows are annual, the practical settlement pattern is:

- year 4 window: up to 50% of founder `Capital Participation` redeemable;
- year 5 window: up to 100% redeemable.

Because exits are annual, 50% annual vesting matches the actual liquidity windows. No separate semi-annual claim window is needed.

### 3.5 Surplus and loss

- Distributable surplus is shared on two keys: **patronage** (a member's
  economic participation in the co-op's business) and **capital** (the capital weight base). Law No. 25 of 1992 Article 5(1)(c)–(d) requires this shape — surplus is shared in
  proportion to each member's service to the co-op, and the return on capital is
  limited. See ADR 0005.
- Default allocation of surplus, after tax, project costs, operating costs, and the
  §3.12 operating reserve top-up: **20% Endowment Reserve / 2.5%
  education / 52.5% patronage / 25% capital** (§3.17). The members' meeting may
  change the proportions by the structural threshold (§3.9).
- **The capital weight base is** `Member Capital` + `Capital Participation`,
  at contributed value. `Member Capital` therefore earns a variable `return on capital`;
  it is not a fixed return and is not interest.
- **Patronage** is the member's IDR transaction value with the co-op in the
  fiscal year, from an annually attested figure (§5.5, ADR 0005). It is not a
  contribution.
- **The annual capital distribution and the `Capital Participation` book value are
  two channels for the same surplus.** The distribution reduces the project pool
  book value by the amount paid from the pool, or the surplus is retained and not
  also paid as a distribution. The same surplus is never paid twice.
- Losses are absorbed first by the Endowment Reserve, then reduce
  `Capital Participation` (ADR 0006). `Member Capital` remains 100% covered by the
  redemption reserve, which is a liquidity policy, not an insolvency guarantee.
- If `Capital Participation` is exhausted, and the endowment with it, the project pool
  cannot touch the redemption reserve.
- Rationale, restated: founders may hold more `Capital Participation` through an
  additional initial commitment, so they receive more of the 25% capital tranche.
  The 25% cap and the 52.5% patronage tranche limit that advantage. The endowment
  takes first loss, so the reduced capital share is paired with a protected floor
  for `Member Capital`.

### 3.6 Redemption and exit

- Exit is allowed only during the annual exit window.
- The exit window is 30 days, after the annual surplus distribution.
- On exit:
  1. `MCAP` (Member Capital) is redeemed at 100% of the contributed amount from
     the redemption reserve.
  2. If the reserve is short, redemption is deferred to the next window in
     exit-request order; the 100% nominal promise remains.
  3. `PROJ` (Capital Participation) is valued at the latest audited book value.
  4. If the project pool has liquid funds, `PROJ` is paid immediately.
  5. If not, the payout is deferred or converted to an `ExitClaim`; the
     endowment does **not** settle exit shortfalls (ADR 0006).
  6. Tokens and the `MEMBER` NFT are burned at completion.
- Total exit payout = **100% of `MCAP` + book value of `PROJ`**. It may be more or
  less than the member's total contribution; only `MCAP` is principal-protected.
- No future surplus share after exit.
- A former member may rejoin only through a later enrollment and fresh admission.

### 3.7 Founder resignation with locked claim

If a founder resigns before full vesting:

- the founder's `Member Capital` is redeemed at the next annual exit window;
- the founder's `Capital Participation` (including the additional initial commitment) is converted into a `FounderCapitalClaim` at book value;
- the claim follows the founder vesting schedule;
- the claim has no voting rights and no future surplus share;
- the claim is subordinated to `Member Capital` redemption and pro-rata with other `Capital Participation` claims if the pool is insufficient;
- acceleration is allowed only by a supermajority member vote for death, incapacity, or similar hardship.

### 3.8 Founder conversion at year 5

At month 60:

- the member class changes from `Founder` to `Standard`;
- the founder lock-up ends;
- future annual contributions use the same 70/30 split;
- existing `MCAP` and `PROJ` balances are unchanged;
- no forced rebalancing of historical `Capital Participation`;
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
- Proposal bond: returnable if quorum is reached; forfeited to the treasury if spam.
- Votes are public by default; commit-reveal is a later privacy option.
- Delegation is out of scope for v1.

### 3.10 Board and operations

- Board is a multisig (recommended 3-of-5).
- Board executes approved projects and budgets.
- Board cannot spend outside an approved proposal and budget.
- Board cannot touch the redemption reserve.
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

- Operating costs are paid from revenue.
- Fund a 6–12 month operating reserve before distributions. The operating
  reserve is not the Endowment Reserve: the reserve is working capital, the
  Endowment Reserve is permanent risk capital (ADR 0006).
- If there is no surplus, the co-op needs founder funding, a grant, or a small non-refundable onboarding fee.
- Do not use the redemption reserve or `Capital Participation` for operating costs unless members approve a separate capital call.

### 3.13 Proposed annual calendar

Exact dates are config parameters. Proposed sequence:

1. **Enrollment/contribution window** — members pay the annual contribution.
2. **Project cycle** — proposals, votes, execution, tranches.
3. **Year-end audit** — project pool book value, operating costs, surplus.
4. **Operating reserve top-up**.
5. **Surplus distribution vote and payout**.
6. **Annual exit window** — `Member Capital` redemption, `Capital Participation` settlement, founder claims.
7. **Next year’s amount and split announced**.
8. **New enrollment**.

### 3.14 Missing annual contribution (open decision)

Recommended:

- grace period of 30 days;
- after grace, status becomes `Inactive`;
- inactive members cannot vote;
- after two missed years, membership review and possible exit/expulsion;
- redemption treatment follows the bylaws and cooperative law.

### 3.15 Death, incapacity, and beneficiary

- Member record includes a beneficiary.
- Legal heirs/beneficiary provide documentation.
- `Member Capital` is redeemed; `Capital Participation` is settled at book value.
- Founder locked capital follows the vesting schedule or is accelerated by member vote.
- Legal/tax counsel to confirm.

### 3.16 Dispute resolution

- Internal board/member process first.
- Mediation/arbitration per cooperative bylaws.
- On-chain votes are evidence of member decisions, not a substitute for legal process.

### 3.17 Parameter table

```text
annual_amount_idr:                         TBD
member_capital_bps:                        7000
capital_participation_bps:                 3000
standard_capital_participation_max_bps:    5000
founder_extra_capital_participation_idr:   TBD (100% at-risk, founder lock-up)
founder_cliff_months:                      36
founder_vesting:                           [(48,5000),(60,10000)]
founder_conversion_month:                  60
redemption_reserve_bps:                    10000 (of outstanding Member Capital)
project_pool_aggregate_cap:                none; funded by at-risk capital
quorum_bps:                                5000
project_threshold_bps:                     5001
structural_threshold_bps:                  6667
timelock_days:                             7
exit_window_days:                          30
opex_reserve_months:                       6-12
surplus_endowment_bps:                     2000
surplus_education_bps:                     250
surplus_patronage_bps:                     5250
surplus_capital_bps:                       2500
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
7. Payment provider/bank webhook creates a bank contribution attestation.
8. Membership transaction mints `MEMBER`, `MCAP`, and `PROJ`.
9. Member record is created.
10. Member appears on the dashboard.

### 4.2 Annual contribution

1. Enrollment window opens.
2. Member receives a virtual account/payment instruction.
3. Member pays the exact annual amount.
4. Bank/payment provider webhook confirms.
5. Treasurer attestation records the bank reference.
6. Contract mints the split tokens.
7. Double contribution, prepayment, and wrong amount are rejected.

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

### 4.5 Surplus distribution

1. Year-end audit produces project pool book value, operating result, each
   member's patronage for the fiscal year — their IDR transaction value with the
   co-op (§4.11, ADR 0005) — and each member's capital weight (`Member Capital` +
   `Capital Participation` at contributed value).
2. Operating reserve is topped up (§3.12).
3. Surplus is split by the allocation snapshotted for this distribution — by default
   20% Endowment Reserve / 2.5% Education Fund / 52.5% patronage / 25% capital
   (§3.17, ADR 0005). The 20% Endowment Reserve and 2.5% Education Fund are retained, not
   distributed; the distribution UTxO holds the distributable **77.5%**.
4. Board proposes the education amount, the two member tranche amounts, both
   weight-class totals, and a Merkle root over
   `(member_id, patronageWeight, capitalWeight)`.
5. Members vote. The vote authorizes the root; there is no other source of truth
   for the weights.
6. Treasury funds a distribution UTxO holding the distributable 77.5%.
7. Each member claims `floor(patronage_pool × w_p / total_patronage) +
   floor(capital_pool × w_c / total_capital)`, rounding down per tranche; the
   remainder accrues to the endowment (§5.1).
8. Double claims are rejected.
9. Unclaimed funds return to the endowment after the deadline.
10. Payout is in IDR by attested bank transfer (§5.4), not in tokens. USDCx is
    out of scope for v1 (ADR 0004).
11. If `total_patronage` is zero — no member transacted with the co-op that year —
    that tranche accrues to the endowment, never to capital.
12. **No double count.** The annual capital distribution and the `Capital Participation` book value are two channels for the same surplus. The distribution
    reduces the project pool book value by the amount paid from the pool; if the
    surplus is retained, it is not also paid as a distribution. The distribution
    datum records the post-distribution book value.

### 4.6 Annual exit and settlement

1. Exit window opens after the surplus distribution.
2. Member submits an exit request.
3. Contract checks KYC, status, and no outstanding votes/obligations.
4. `MCAP` is redeemed at 100% from the redemption reserve; if the reserve is
   short, the request is deferred in request order to the next window.
5. `PROJ` is valued at the latest audited book value.
6. If liquid, `PROJ` is paid; otherwise the payout is deferred or converted to an
   `ExitClaim`. The endowment does not settle exit shortfalls.
7. Tokens and `MEMBER` NFT are burned at completion.
8. Member loses voting and future surplus rights.
9. Total payout = 100% `MCAP` + book value of `PROJ`; it may be more or less than
   the total contribution.

### 4.7 Founder resignation claim

1. Founder requests resignation.
2. `Member Capital` is redeemed at the next annual window.
3. `Capital Participation` (including the additional initial commitment) is converted to `FounderCapitalClaim` at book value.
4. Claim follows the founder vesting schedule.
5. Claim is paid from project pool liquidity.
6. No voting or future surplus.
7. Beneficiary applies on death.

### 4.8 Founder conversion

1. At month 60, conversion is automatic.
2. `member_class` becomes `Standard`.
3. `founder_lock_until` is cleared.
4. Future contributions use the same 70/30 split.
5. Existing tokens remain.
6. Founder badge may be minted as a non-economic NFT.
7. Redemption wave is monitored; the project pool’s liquidity plan applies.

### 4.9 KYC renewal and revocation

- KYC attestation has an expiry.
- Members re-verify before expiry, during the enrollment window (§3.1, §3.13 step 1).
- Issuer publishes revocation status.
- Sanctions/PEP hits can freeze voting/exit as legally required.
- A frozen member cannot vote; redemption handling follows legal advice.

### 4.10 Bank reconciliation and audit

- Monthly reconciliation of bank statements vs on-chain `Member Capital` redemption value.
- Quarterly reserve attestation.
- Annual independent audit.
- Public dashboard shows `Member Capital` coverage, `Capital Participation` book value, and the endowment balance.
- Any discrepancy triggers a board incident process.

### 4.11 Patronage attestation (patronage)

- The co-op's accounting records each member's transaction value with the co-op
  during the fiscal year: purchases through the co-op, products supplied to it,
  services used.
- At year end the treasurer compiles one figure per member and the auditor
  attests the total, the way contribution and reserve attestations work (§5.5).
- The attested figures become the patronage weights in the surplus distribution
  (§4.5). A member can see their own figure before the distribution vote opens.
- Disputes are settled by the board with the auditor before the vote opens.
- No per-transaction record goes on chain: only the weights committed in the
  distribution Merkle root (ADR 0005).

---

## 5. Token and asset model

### 5.1 Token properties

- `MCAP`: fungible, 1 unit = 1 IDR, non-transferable, `Member Capital` equity, 100% redeemable from the redemption reserve; earns a variable `return on capital`.
- `PROJ`: fungible, 1 unit = 1 IDR of contributed `Capital Participation`, book value fluctuates, non-transferable, at-risk.
- `MEMBER`: NFT, one per member, non-transferable.
- `STATE`, `PROPOSAL`, `VOTE`, `CLAIM`: protocol NFTs/UTxOs.

Cardano native assets are integers. Use 1 unit = 1 IDR for simplicity; use 1 unit = 1 sen if fractional IDR is needed.

#### Money and decimal precision

Canonical rule: **all balances, token quantities, and ledger amounts are integer smallest units.** Decimals are display and metadata only.

| Concept | Representation |
|---|---|
| IDR amount | Integer IDR; `IdrAmount` safe integer for now |
| Future fractional IDR | Integer sen; 1 IDR = 100 units |
| `MCAP` / `PROJ` quantity | Integer units; `bigint` in TypeScript |
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
  MCAP:  700,000 units (0 decimals)
  PROJ: 300,000 units (0 decimals)

Project pool value: 1,050,000,000 IDR
Total PROJ supply:  1,000,000,000 units
Book value:         1.05 IDR/unit

PROJ settlement:       floor(300,000 * 1.05) = 315,000 IDR
MCAP redemption:         700,000 IDR
Total exit payout:     1,015,000 IDR
Remainder:             allocated to the project/operating reserve
```

The member’s total exit payout can be above or below the contribution; only the
`MCAP` tranche is principal-protected.

### 5.2 Non-transferability

Cardano native assets are transferable by default. The co-op enforces non-transferability by:

- locking tokens in the membership script record;
- requiring the record output to stay at the membership script;
- requiring the owner public key hash to remain unchanged;
- allowing only burn, or board-approved succession, to move membership.

This is contract-enforced, not ledger-enforced. The token must never be sent to a normal wallet or DEX.

### 5.3 Mint/burn authority

- `MEMBER` and split tokens are minted only by the membership validator.
- Minting requires a valid KYC attestation, board admission, correct annual amount, current year, and bank contribution attestation.
- Burning requires exit or founder conversion/claim.
- The state NFT authenticates config.
- Proposal/vote/claim NFTs are minted by their respective validators.

### 5.4 Bank IDR trust model

The co-op holds IDR in four segregated accounts:

| Account | Holds | Withdrawal rule |
|---|---|---|
| Redemption reserve | 100% of outstanding `Member Capital` (funded by the 70% cash tranche) | `Member Capital` redemptions only |
| Project account | `Capital Participation` contributions + realized project returns | Approved projects and `Capital Participation` exit settlements |
| Operating account | Operating reserve from surplus | Approved operating budget |
| Endowment Reserve account | 20% of surplus, accumulated | Capital-loss absorption or approved development only. Never distributed to members and never used to settle exits |

`Member Capital` is equity, so the redemption reserve is a **liquidity policy**,
not a liability backing and not bankruptcy-remote. Members remain exposed to the
co-op’s insolvency. The reserve must not be spent on projects or operations; a
shortfall is met by deferring redemptions in request order, not by touching the
endowment.

The Endowment Reserve is outside `PROJ` supply: it earns no
surplus share, absorbs project losses before `Capital Participation`, and may fund
approved development (co-op capex, technology, member services). It does not
settle exit shortfalls (ADR 0006). It is not the operating account.

Controls:

- accounts in the cooperative’s legal name;
- dual signatories / board multisig;
- payment provider (Xendit/Midtrans/Flip) for virtual accounts and payouts;
- every endowment draw chain-authorized by a treasury attestation;
- monthly reconciliation;
- annual independent audit.

The chain cannot verify the bank balance or prevent a fraudulent transfer. The trust boundary is the board, bank mandate, auditor, and cooperative law. The chain enforces governance, approvals, budgets, token balances, and exit rules.

### 5.5 Proof of reserves

- `ReserveAttestation` records the bank balance and outstanding `Member Capital`.
- `PatronageAttestation` records each member's patronage for the fiscal year
  (§4.11).
- Issued monthly/quarterly by treasurer + auditor.
- Public dashboard shows `Member Capital` redemption coverage, `Capital Participation`
  book value, and the endowment balance, losses absorbed, and development spent
  (ADR 0006).
- Minting requires the latest attestation to show 100% coverage of `Member Capital` after the new contribution.
- If coverage falls below 100%, project spending halts and the board must remediate.

---

## 6. Smart contract architecture

### 6.1 Validators and policies

| Module | Responsibility |
|---|---|
| `config` | State NFT; annual amount, `Member Capital`/`Capital Participation` split, founder extra capital, surplus allocation incl. education, redemption reserve policy, quorum, windows, board keys, KYC issuer, token policies |
| `membership` | Member records; `MEMBER`, `MCAP`, `PROJ` mint/burn; contribution; voting record; founder lock/vesting; conversion; exit request |
| `governance` | Proposals, bonds, one-member-one-vote, quorum, batched tally, execution |
| `treasury` | Project pool budgets, tranches, spending, cancel/return |
| `attestation` | KYC, bank contribution, reserve, and project spending attestations |
| `distribution` | Surplus split across education, patronage, and capital; Merkle root; claims; double-claim prevention |
| `exit` | Annual exit window, `Member Capital` redemption, `Capital Participation` book value, founder claim, defer/claim |
| token policies | `MEMBER`, `MCAP`, `PROJ`, `STATE`, `PROPOSAL`, `VOTE`, `CLAIM` |

### 6.2 State model

```text
Config UTxO          — state NFT, parameters
MemberRecord UTxO    — one per member; holds MEMBER + MCAP + PROJ
Proposal UTxO        — one per proposal; PROPOSAL NFT
Vote UTxO            — one per member per proposal; VOTE receipt
Project UTxO         — one per approved project; budget/spent
Distribution UTxO    — one per surplus distribution; Merkle root over both weight
                       classes; holds the distributable 77.5% only
Endowment UTxO       — singleton; endowment balance, cumulative absorbed losses,
                       and development spent
ExitClaim UTxO       — one per exiting member; deferred Capital Participation/founder payout
KycAttestation UTxO  — issuer attestation; no PII
BankAttestation UTxO — contribution/reserve/spend attestations
PatronageAttestation UTxO — per-fiscal-year patronage figures; no per-transaction data
```

Use CIP-31 reference inputs for config and CIP-33 reference scripts to stay under transaction size limits.

### 6.3 Datum schemas

```aiken
pub type ConfigDatum {
  state_nft: AssetName,
  annual_amount: Int,
  member_capital_bps: Int,
  capital_participation_bps: Int,
  standard_capital_participation_max_bps: Int,
  founder_extra_capital_participation: Int,
  founder_cliff_months: Int,
  founder_vesting: List<(Int, Int)>,
  quorum_bps: Int,
  project_threshold_bps: Int,
  structural_threshold_bps: Int,
  surplus_endowment_bps: Int,
  surplus_education_bps: Int,
  surplus_patronage_bps: Int,
  surplus_capital_bps: Int,
  redemption_reserve_bps: Int,
  timelock_days: Int,
  exit_window_start: Int,
  exit_window_end: Int,
  contribution_asset: AssetClass,
  treasury_address: Address,
  board_keys: List<VerificationKeyHash>,
  board_threshold: Int,
  kyc_issuer: PolicyId,
  member_policy: PolicyId,
  member_capital_policy: PolicyId,
  capital_participation_policy: PolicyId,
}

pub type MemberDatum {
  owner: VerificationKeyHash,
  member_id: ByteArray,
  class: MemberClass,
  join_time: Int,
  member_capital: Int,
  capital_participation: Int,
  last_contribution_year: Int,
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

pub type DistributionDatum {
  id: Int,
  fiscal_year: Int,
  surplus_total: Int,
  endowment_bps: Int,       // snapshotted per distribution (ADR 0005)
  education_bps: Int,
  patronage_bps: Int,
  capital_bps: Int,
  endowment_amount: Int,    // retained, not distributed
  education_amount: Int,    // retained in Education Fund
  patronage_pool: Int,
  capital_pool: Int,
  total_patronage: Int,
  total_capital: Int,       // capital weight base: Member Capital + Capital Participation
  book_value_after: Int,    // post-distribution, for the no-double-count rule
  merkle_root: ByteArray,   // over (member_id, patronageWeight, capitalWeight)
  deadline: Int,
  claimed: Int,
}

pub type EndowmentDatum {
  balance: Int,
  absorbed_losses: Int,
  development_spent: Int,
  last_updated: Int,
}

pub type ExitClaimDatum {
  member_id: ByteArray,
  amount: Int,
  paid: Int,
  source: ClaimSource,      // MODAL_PENYERTAAN | FOUNDER_CAPITAL
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
Membership: Join | Contribute | Vote | RequestExit | CompleteExit | ConvertFounder | RotateOwner
Governance: CreateProposal | CastVote | TallyBatch | FinalizeTally | Execute | Cancel
Treasury:   CreateProject | SpendTranche | CancelProject | CloseProject
Attestation: KycIssue | KycRevoke | BankContribution | ReserveAttest | SpendAttest | PatronageAttest
Distribution: CreateDistribution | Claim | CloseDistribution
Endowment:  AbsorbLoss | FundDevelopment
Exit:       RequestExit | RedeemMemberCapital | SettleCapitalParticipation | DeferRedemption | CreateFounderClaim | PayClaim
```

### 6.5 Transaction flows

1. **Join/contribution:** config reference input + KYC attestation + bank attestation + member record → mint tokens.
2. **Vote:** spend member record → update `last_voted_proposal` → mint vote receipt → create vote UTxO.
3. **Tally:** consume batches of vote UTxOs → update proposal counters → finalize.
4. **Execute:** proposal + treasury → create project UTxO or update config.
5. **Spend tranche:** project + proposal + board signatures + bank attestation → update project.
6. **Distribution:** audit, patronage, and capital-weight attestations + proposal →
   education and endowment retention → distribution UTxO → Merkle claims.
7. **Exit:** member record + exit window + reserve attestation → redeem `MCAP` →
   settle `PROJ` at book value → pay, defer, or create an `ExitClaim`.
8. **Founder conversion:** member record + time ≥ month 60 → class update → clear lock.

### 6.6 Security invariants

- `MCAP` supply ≤ attested redemption reserve.
- The redemption reserve is never spent on projects or operations.
- `PROJ` is never paid from the redemption reserve.
- One vote per member per proposal.
- Project spending ≤ approved budget.
- Exit only during the annual window.
- Founder vesting and conversion follow the schedule.
- Split changes affect only future contributions.
- No double claim, double redemption, or double payment of the same surplus.
- Distribution tranches conserve: claims per tranche never exceed that tranche's
  pool, and the endowment and education shares are never distributed.
- One claim per member per distribution.
- The surplus allocation is snapshotted per distribution; a later vote never applies
  retroactively.
- Project losses reduce the endowment before `PROJ`; the endowment does not settle
  exit shortfalls.
- The annual capital distribution and the `PROJ` book value never both pay the
  same surplus.
- Total exit payout = 100% `MCAP` + book value of `PROJ`; there is no guarantee of
  the total contribution.
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
          capital/           # contributions, Member Capital, Capital Participation, vesting, book value
          governance/        # proposals, votes, quorum, tally
          projects/          # project budgets, tranches, spending
          distributions/     # surplus share, education, claims
          exits/             # exit window, Member Capital redemption, Capital Participation settlement, founder claims
          banking/           # bank accounts, contributions, payouts, reconciliation
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
/members       profile, contribution status, voting power, founder vesting
/proposals     list, detail, create, vote, tally, execute
/projects      list, detail, spend, cancel
/treasury      redemption coverage, Capital Participation pool, attestations
/distributions list, claim
/exit          request, status, claims
/admin         KYC/bank attestations, reconciliation, founder conversion
/tx            build unsigned transactions, submit signed transactions
/health        liveness/readiness
```

Use Elysia TypeBox validation and export the `App` type for Eden Treaty.

### 7.4 Indexer

- Sync chain events into PostgreSQL.
- Tables: members, kyc_attestations, contributions, member_capital_ledger, capital_participation_ledger, proposals, votes, projects, distributions, claims, bank_attestations, patronage_activity, endowment_ledger, education_ledger, audit_logs.
- Reconcile on-chain state with bank statements.
- Jobs: tally, distribution Merkle roots, KYC expiry, deferred claims, notifications.
- Expose read APIs to the web app.

### 7.5 Issuer service

- Receives Privy/Sumsub webhooks.
- Verifies KYC result and board admission.
- Signs and submits KYC attestations.
- Receives bank/payment webhooks.
- Creates contribution attestations with unique bank references.
- Publishes reserve attestations.
- Keys in KMS/HSM or multisig; never in the web app.

### 7.6 Frontend routes

```text
/                     Dashboard
/onboarding           KYC, admission, wallet connection
/contribute            Annual contribution
/proposals            Proposal list
/proposals/:id        Proposal detail, vote, tally
/projects             Projects and budgets
/projects/:id         Project spending and evidence
/treasury             Redemption coverage, Capital Participation pool, attestations
/distributions        Surplus distributions and claims
/exit                 Exit window, redemption status, founder claims
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

- Privy for Indonesian e-KYC (civil registry, OJK-registered).
- Sumsub for AML/sanctions/transaction monitoring and foreign members.
- Manual board KYC fallback for the pilot.
- No PII on-chain.

### 7.10 Bank/payment integration

- Virtual accounts for member contributions.
- Webhook confirms payment.
- Treasurer attestation links bank reference to on-chain contribution.
- Batch payouts for redemptions/distributions under dual control.
- Monthly reconciliation and annual audit.

### 7.11 Domain-driven design and hexagonal architecture

Use a **modular monolith** first: one API deployment, one PostgreSQL database, and clear module boundaries. Do not split into microservices or event sourcing for the MVP. Extract a context into a separate service only when scaling or team ownership requires it.

#### Bounded contexts

| Context | Responsibility | Aggregate(s) |
|---|---|---|
| **Identity** | KYC attestations, provider webhooks, admission eligibility | `KycCase` |
| **Membership** | Member lifecycle, class, status, wallet ownership, conversion | `Member` |
| **Capital** | Annual contribution split, `Member Capital`, `Capital Participation`, founder vesting, book value, redemption reserve, endowment | `MemberCapital`, `VestingSchedule`, `EndowmentFund` |
| **Governance** | Proposals, bonds, votes, quorum, tally, execution | `Proposal` |
| **Projects** | Project budgets, milestones, tranches, spending, cancellation | `Project` |
| **Patronage** | Member economic participation: transaction value with the co-op, attested per fiscal year | `MemberPatronage` |
| **Distributions** | Surplus calculation and allocation, education, Merkle root, claims | `Distribution` |
| **Exits** | Exit window, `Member Capital` redemption, `Capital Participation` settlement, founder claims | `ExitRequest`, `ExitClaim` |
| **Banking** | Bank accounts, contributions, payouts, reconciliation, reserve attestations | `BankAccount`, `Attestation` |
| **Chain access** | Cardano provider, transaction building/submission, indexer | Infrastructure, not a domain context |

Context relationships:

- **Identity → Membership**: a verified KYC case is required for admission.
- **Membership → Capital**: `MemberAdmitted` creates capital accounts.
- **Governance → Projects/Distributions**: `ProposalPassed` authorizes a project or distribution.
- **Capital → Distributions/Exits**: balances and book value determine payouts;
  the endowment absorbs project losses before `Capital Participation` (ADR 0006).
- **Patronage → Distributions**: the fiscal year's patronage weights are the
  second distribution key (ADR 0005).
- **Banking → Capital/Distributions**: confirmed contributions and payouts update capital and claims.
- **Chain access** is a shared outbound adapter used by the other contexts.

#### Domain layer

Aggregates:

- **Member** — owner, class, status, KYC reference, join time, last contribution year, last voted proposal.
- **MemberCapital** — `Member Capital` and `Capital Participation` balances, founder vesting, book value, claims.
- **MemberPatronage** — transaction value per member per fiscal year, with its attestation reference.
- **EndowmentFund** — balance, cumulative absorbed losses, and development spent.
- **Proposal** — kind, budget, recipient, milestones, voting window, quorum, tally, status.
- **Project** — approved budget, spent amount, milestones, status.
- **Distribution** — fiscal year, surplus total, snapshotted allocation, education and member tranche pools, both class totals, Merkle root, asset, deadline, claimed amount.
- **ExitClaim** — member, amount, paid amount, source, release schedule, beneficiary, status.
- **Config** — annual amount, splits, surplus allocation, thresholds, windows, board keys, token policies.

Value objects:

```text
MemberId, ProposalId, ProjectId, ClaimId, DistributionId
IdrAmount, BasisPoints, AssetClass
MemberClass (Standard | Founder)
KycStatus, MemberStatus
TimeWindow, VestingSchedule, FiscalYear
PatronageWeight, CapitalWeight, DistributionAllocation
MerkleRoot, TxHash
```

Enum-like domain values use `SCREAMING_SNAKE_CASE` (`STANDARD`, `FOUNDER`, `ACTIVE`, `PASSED`). UI labels are separate and never render raw enum values.

Domain services/policies:

```text
ContributionSplitPolicy
FounderVestingPolicy
QuorumPolicy
SurplusAllocationPolicy
PatronageWeightingPolicy
EndowmentDrawPolicy
BookValuePolicy
RedemptionWaterfallPolicy
MembershipAdmissionPolicy
```

Domain events:

```text
MemberAdmitted
KycAttested
AnnualContributionRecorded
PatronageAttested
VoteCast
ProposalPassed
ProjectTrancheSpent
SurplusDistributed
EducationFunded
EndowmentDrawn
ExitRequested
MemberCapitalRedeemed
CapitalParticipationSettled
FounderConverted
ClaimPaid
```

Keep the ubiquitous language consistent in code, UI, contracts, and legal documents. `GLOSSARY.md` at the repo root is the source of terms; Appendix C is a summary of it.

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
RecordAnnualContribution
CreateProposal
CastVote
TallyProposal
ExecuteProposal
SpendProjectTranche
CreateDistribution
ClaimSurplus
RequestExit
RedeemMemberCapital
SettleCapitalParticipation
CreateFounderClaim
PayClaim
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
- idempotency keys for contributions, votes, claims, and payouts;
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
- `Member Capital` redemption and `Capital Participation` book value.
- Education allocation and retained fund.
- No double count between annual capital distribution and book value.
- Merkle proof verification.

### 8.2 Invariant tests

- `MCAP` supply ≤ redemption reserve.
- Redemption reserve not spent on projects or operations.
- `PROJ` never paid from the redemption reserve.
- One vote per member per proposal.
- Project spend ≤ budget.
- Exit only in window.
- No double claim, double redemption, or double payment of the same surplus.
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
- Legal opinion on cooperative, token, KYC, tax, custody.
- Final datum schemas and ADRs.
- Context map, aggregate boundaries, port/adapter contracts, and dependency rules.
- Choose KYC/payment providers.
- Confirm founder vesting and conversion.

### Phase 1 — core contracts (4–6 weeks)

- Config, membership, token policies.
- Join/contribution, KYC/bank attestations.
- Founder class and vesting.
- Unit and property tests.

### Phase 2 — governance and treasury (4–6 weeks)

- Proposals, voting, tally, execution.
- Project budgets, tranches, spending.
- Cancel/return flows.

### Phase 3 — distribution and exit (3–4 weeks)

- Surplus distribution and Merkle claims.
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
| Cooperative/founder extra `Capital Participation` not permitted | Legal opinion; fallback to equal `Member Capital` + founder grant/loan or separate limited liability company |
| Founder lock-up unenforceable | Draft as a `Capital Participation` redemption lock, not a resignation ban; counsel |
| `Member Capital` redemption reserve shortfall | 100% cash reserve, monthly attestation, deferral in request order, board remediation |
| Bank IDR not verifiable on-chain | Segregated accounts, dual control, monthly reconciliation, audit |
| Bank fraud or failure | Dual signatories, payment provider, audit, insurance review |
| KYC privacy breach | No PII on-chain, encryption, access control, DPA, retention policy |
| KYC provider outage | Manual fallback; secondary provider |
| Smart contract bug | Audit, property tests, caps, timelock, migration path |
| eUTxO contention | One record per member; batched tally; Merkle claims; reference inputs |
| Redemption wave at year 5 | Graded founder release; project maturity/liquidity; defer or `ExitClaim`; the endowment does not settle exits (ADR 0006) |
| Project pool illiquidity | Tranches, milestones, cancel vote, maturity limits, defer/claim |
| Endowment abused as a slush fund | Only two draw reasons (loss absorption and approved development), chain-authorized by a treasury attestation, never distributed, shown on the public dashboard (ADR 0006) |
| Double count of capital surplus and book value | The annual distribution reduces the pool/book value; the surplus is retained or distributed, never both; audited |
| `Capital Participation` book value above contribution | Pay only from realised/liquid project assets; defer or claim if illiquid; never use the redemption reserve |
| Voter apathy | Quorum design, notifications, simple UX |
| Regulatory change | Monitor OJK/BI; no public stablecoin; legal review |
| Tax/accounting complexity | Accountant involved from phase 0; confirm PSAK 50/71 treatment of redeemable `Member Capital` |
| Key loss/compromise | Multisig, hardware wallets, KMS, recovery runbook |

---

## 11. Open decisions

1. Annual amount and inflation adjustment: board proposes + member vote, or bounded board authority?
2. Exact annual calendar dates.
3. Surplus distribution ratio and reserve target.
   Resolved: surplus split 20% Endowment Reserve / 2.5% Education Fund /
   52.5% patronage / 25% capital; the capital weight base; changeable by
   members' meeting (ADR 0005, ADR 0006). Reserve target remains §3.12.
4. Initial operating runway: founders, grant, or onboarding fee?
5. Surplus payout asset: IDR bank or USDCx?
   Resolved: IDR by attested bank transfer (ADR 0004).
6. Missing annual contribution: inactive/grace/expulsion rules.
7. Membership admission: board-only or board + member vote?
   Resolved: board-only at genesis; member vote only if the articles of association makes
   approval a condition of membership (ADR 0004, Article 30(2)(b) Law No. 25 of 1992).
8. Board size/threshold and key recovery.
9. Founder capital treatment on resignation: `Member Capital` redeemed at the annual window; founder `Capital Participation` becomes a claim at book value under the vesting schedule.
10. Standard `Capital Participation` cap: 30% default, 50% max?
11. Whether to offer open risk tiers beyond founders.
12. KYC provider final choice: Privy only, Sumsub only, or both.
13. Whether to add a public Astro site for proposals/docs.
14. Audit firm and budget.
15. Legal counsel and cooperative registration timeline.
16. Resolved in principle: the 20% allocation is the Endowment Reserve; the members' meeting sets or confirms the amount annually; the 2.5% Education Fund is a separate retained allocation.
17. Resolved in principle: the endowment draws only for capital-loss absorption and approved development; it does not settle exits.
18. Founder extra `Capital Participation` amount, lock-up, and vesting terms.
19. Capital-weight date: year-end contributed value or time-weighted average. Pick one and put it in the ADR.
20. `Member Capital` redemption deferral: maximum windows, priority, and member rights while pending.
21. `Capital Participation` book value: realised vs unrealised gains, liquidity discount, and how the annual capital distribution reduces the pool/book value.

---

## 12. Appendices

### A. Founder vesting example

Founder `Capital Participation`: IDR 800,000,000 (illustrative).

| Time | Vested | Redeemable at annual window |
|---|---:|---:|
| Month 36 | 0% | 0 |
| Month 48 | 50% | 400,000,000 |
| Month 60 | 100% | 800,000,000 |

With annual windows at months 48 and 60:

- year 4: 50% redeemable;
- year 5: 100% redeemable.

### B. Surplus and loss example

Standard member:
- annual contribution IDR 1,000,000;
- `Member Capital` 700,000;
- `Capital Participation` 300,000.

Founder:
- standard annual contribution IDR 1,000,000;
- `Member Capital` 700,000;
- `Capital Participation` 300,000;
- additional initial `Capital Participation` 700,000, 100% at-risk;
- capital weight base 1,700,000 (`Member Capital` 700,000 + `Capital Participation` 1,000,000).

Surplus for the year, after tax, operating costs, and the operating reserve top-up:
IDR 1,000,000,000. Allocation by §3.17 (ADR 0005):

- Endowment Reserve 200,000,000 — retained, not distributed;
- Education Fund 25,000,000 — retained, not distributed;
- patronage 525,000,000;
- capital 250,000,000;
- member distributions 775,000,000.

The capital weight base is 2,700,000 (standard 1,000,000 + founder 1,700,000), so the capital
share is:

- standard member: 250,000,000 × 1,000,000 / 2,700,000,000 = 92,592;
- founder: 250,000,000 × 1,700,000 / 2,700,000,000 = 157,407.

Total patronage is IDR 500,000,000 of member transactions. If the standard
member transacted 50,000,000 and the founder 100,000,000:

- standard member: 525,000,000 × 50,000,000 / 500,000,000 = 52,500,000;
- founder: 525,000,000 × 100,000,000 / 500,000,000 = 105,000,000.

Totals for these two members: standard 52,592,592; founder 105,157,407. A member
with no transactions still receives the capital share, and a member with no
`Capital Participation` still receives the patronage share through `Member Capital`.
The one-IDR rounding remainder accrues to the endowment.

Loss example. The pool loses 10% of 1,000,000,000, i.e. 100,000,000. The
endowment holds 200,000,000, so it absorbs the entire loss and `Capital Participation` is unchanged. Had the loss been 300,000,000, the endowment would
absorb 200,000,000 and `Capital Participation` would absorb 100,000,000: standard
member 300,000 → 270,000; founder 1,000,000 → 900,000. `Member Capital` is
unaffected in both cases. The standard member’s total exit is 700,000 + 270,000
= 970,000; the founder’s is 700,000 + 900,000 = 1,600,000 against a 1,700,000
contribution. The loss falls on `Capital Participation`, not on `Member Capital`.

### C. Glossary

- **Surplus** — distributable surplus for a fiscal year; shared 20% Endowment Reserve
  / 2.5% Education Fund / 52.5% patronage / 25% capital by default.
  Full definitions in `GLOSSARY.md`.
- **Patronage** — a member's IDR transaction value with the co-op in a fiscal
  year; one of the two surplus keys.
- **Capital** — capital weight base: `Member Capital` + `Capital Participation`; the other
  surplus key. Both earn a variable `return on capital`.
- **Endowment Reserve** — the co-op's own risk capital from 20% of surplus, outside
  `PROJ` supply; absorbs capital losses first and funds approved development; it
  does not settle exits.
- **`MCAP`** — Member Capital equity token; 100% redeemable from the redemption
  reserve.
- **`PROJ`** — `Capital Participation` token; at-risk, settled at book value.
- **Book value** — audited net asset value per `Capital Participation` unit, net of
  distributions.
- **Exit claim** — deferred `Capital Participation` or founder-capital payout.
- **CIP-30** — Cardano wallet connector.
- **CIP-31/32/33** — reference inputs, inline datums, reference scripts.
- **CIP-68** — NFT metadata standard.
- **Aiken** — smart contract language for Cardano.
- **Lucid** — TypeScript transaction builder.
- **Elysia** — Bun-first TypeScript API framework.

### D. References

- OJK Regulation No. 27 of 2024: https://ojk.go.id/id/regulasi/Pages/POJK-27-2024-AKD-AK.aspx
- OJK Regulation No. 23 of 2025: https://ojk.go.id/id/regulasi/Pages/POJK-23-2025-Perubahan-POJK-27-Tahun-2024-tentang-Penyelenggaraan-Perdagangan-Aset-Keuangan-Digital-Termasuk-Aset-Kripto.aspx
- OJK stablecoin regulation target (Jan 2027): https://en.tempo.co/read/2121273/indonesia-targets-stablecoin-regulations-by-early-2027-ojk-says
- Law No. 4 of 2026 summary: https://www.hsfkramer.com/notes/indonesia/2026-posts/indonesia-reshapes-digital-asset-and-cryptocurrency-framework-with-2026-financial-services-omnibus-law
- Bank Indonesia Regulation No. 20/6/PBI/2018 on Electronic Money: https://www.bi.go.id/en/publikasi/peraturan/Pages/PBI-200618.aspx
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
