# ADR 0004: The chain is the ledger, and contracts come first

## Status

Accepted. Sets the build order for every capital, governance, and treasury
milestone. Supersedes the off-chain-first reading of plan §9 Phase 4.

## Context

The plan's §9 sequence builds contracts (Phases 1–3) before the off-chain app
(Phase 4), but the repo currently holds only Phase 4 work: wallet auth, manual
KYC attestation, membership admission, 89 tests, one migration. None of §6
exists — no `contracts/`, no Aiken, no Lucid, no indexer. The cheap temptation is
to invert the order: put balances in Postgres behind a port, get a workable
co-op sooner, and swap in the chain later.

That inversion is a one-way door dressed as a reversible one. §6.6's invariants
— the redemption reserve never spent on projects, one vote per member, no double
redemption, spending within budget — are only guarantees if something outside the
board enforces them. An off-chain app operated by the board offers audit logs, not
enforcement. Every one of those rules would then have to be written twice, in
two languages, and kept in agreement permanently (§6.6 in Aiken, and in the
app's pre-checks so members don't get opaque failed transactions).

Going chain-first costs the §9 Phase 1–3 estimate — 11–16 weeks of validator
work before a member can see a balance — and puts audit (§9 Phase 6) between
the pilot and real IDR. The product decision that buys: nothing ships to
mainnet until on-chain governance exists.

## Decision

- **The chain is authoritative for balances and rules.** `MCAP`, `PROJ`,
  `MEMBER`, membership status, votes, budgets, and claims live in UTxOs.
  PostgreSQL is a projection (§7.4), never a source of truth.
- **Contracts come first**, in §9 order: `config` and `membership` (M1),
  `governance` (M2), `treasury` (M3), `distribution` and `exit` (M4), audit (M5).
- **No `CapitalLedger` port.** Balance reads come from the indexer's
  projection; balance writes are transactions. There is no second ledger to
  abstract over.
- **Mainnet gate is governance plus audit.** M3 and M4 may trail the first
  mainnet year: contributions, votes, and projects are operable without them,
  and distribution and exit are annual events (§3.6, §3.13). Whether members
  may contribute before an exit path exists is a bylaws and cooperative-law question,
  not a code question, and is referred to counsel.
- **Datum schemas are final before the first real rupiah.** Contracts are
  immutable and one `MemberRecord` UTxO holds each member's balances, so a
  datum change after real members exist is a §6.7 supermajority migration. The
  preprod pilot uses test wallets precisely so this stays free until M5.
- **Admission is board-only at genesis and, if members should vote, only by an
  articles-of-association provision.** Article 30(2)(b) of Law No. 25 of 1992 makes
  admission and refusal a board power bounded by the articles of association, and
  Article 5(1)(a) plus its official explanation forbid restricting or
  discriminating against applicants who meet the articles' requirements. A
  per-applicant member vote is therefore legal only when the articles make member
  approval a condition of membership — otherwise it is the board delegating a
  statutory power it was given to exercise.
  Genesis remains board-only regardless: no `MEMBER` exists to vote before the
  first mint. See `docs/legal/cooperative-membership-and-surplus.md`.
- **Payouts are IDR by attested bank transfer** (§11 #5). The co-op holds IDR in
  segregated accounts (§5.4); USDCx would add an FX rate and a second trust
  boundary for a §1.2 non-goal.
- **Token quantities are `bigint`** (§5.1). `IdrAmount` stays a branded
  `number` for IDR amounts; `MCAP` and `PROJ` quantities do not.
  `packages/shared` changes before any capital code is written.

## Consequences

- The first workable co-op arrives later than an off-chain build would, and the
  same domain rules are enforced twice — on-chain as guarantees, off-chain as
  pre-checks and UX.
- An indexer and a transaction-building layer become prerequisite infrastructure
  rather than Phase-4 nice-to-haves.
- §6.6 invariants need property tests in Aiken and emulator tests in Lucid
  before any validator is considered done.
- Audit becomes a scheduling constraint on the mainnet date, not a postscript.
- The existing identity, membership, and auth contexts are not throwaway: they
  become the projection and admission-eligibility layer the indexer feeds.
