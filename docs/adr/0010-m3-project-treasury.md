# ADR 0010: M3 project treasury and tranche spending

## Status

Accepted. 2026-11-15. Applies to M3 (`treasury`, the governance project kinds,
and genesis v3). The spec is `docs/plan/m3-treasury.md`; the two are kept in
agreement.

## Context

ADR 0004 puts contracts first: M1 shipped `config` and `membership`; M2 shipped
secret-ballot `governance` for config changes only. M3 is `treasury`: project
pool budgets, milestones, tranches, spending, and cancel/return (plan §3.11,
§4.4, §6.1). ADR 0009 deferred three things to M3: project proposals, cancel,
and the proposal bond "when a treasury exists to receive a forfeited bond".

The plan's §6.3 sketch assumes a `ProjectDatum` with `budget`, `spent`,
`milestones`, and `status`, and §6.4 sketches `CreateProject | SpendTranche |
CancelProject | CloseProject`. It does not say what the treasury holds. That is
the question M3 has to answer, because M1 and M2 already settled the money
model: no IDR moves on chain. A contribution is minted from a treasurer-issued
Bank Proof over a hashed bank reference, and payouts are IDR bank transfers
attested off chain (§5.4–§5.5). The chain enforces who may act and within what
budget; it cannot see the bank.

## Decision

### 1. One treasury script, attested accounting

The treasury holds **no money**. Its pool box carries an attested IDR balance,
and the project account stays at the bank. The chain enforces the co-op's rules
— budgets, approvals, no oversubscription, no double spend — and the bank,
treasurer, auditor, and cooperative law remain the trust boundary (plan §5.4).

One `treasury` script, parameterized by the state NFT policy, serves both the
spend and mint purposes:

- the **pool box** holds the one-shot `POOL` token minted at genesis;
- each **project box** holds a `PROJECT` NFT named by the id of the proposal
  that created it;
- the pool and project boxes are distinguished by their datum and token.

`governance` is parameterized by the state NFT policy and the treasury policy:
the first locates the config, the second is the `PROJECT` mint that a passed
project proposal must execute. `Execute(Project)` requires exactly that mint
under that policy, and the treasury mint requires the spent `Passed` proposal,
so neither can land alone. The treasury spends the pool at execution with a
`ReserveProject` redeemer next to the mint: the mint has no `own_ref`, and a
mint-only rule would leave the pool datum writable by whoever spends the pool
box. Reserving also needs the treasury policy, which the script cannot name for
itself, so the rule reads it from the pool box's own address — the script hash
of the treasury — and checks the mint and the project box against it. Every pool
action keeps the `POOL` token at its own address (`AttestPool` and
`ReserveProject` both require it), so that hash is always the treasury itself;
genesis is the deployer-trusted first write.

The genesis one-shot `state_nft` policy mints `STATE` and `POOL` in the
seed-spending transaction, so both singletons share one genesis policy. The
treasury mint purpose cannot be one-shot itself, because it mints a `PROJECT`
for every approved project.

### 2. The pool is the spending ceiling

```aiken
pub type PoolDatum {
  balance: Int,     // treasurer-attested IDR in the project account
  committed: Int,   // sum of remaining milestone amounts over open projects
}
```

- **Approval reserves.** Executing a passed project proposal requires
  `committed + budget <= balance` and raises `committed` by the budget, where
  the budget is the sum of the milestone amounts. Members cannot approve a
  project the pool cannot fund.
- **A tranche debits both.** `balance` and `committed` each fall by the
  milestone amount.
- **A close releases the remainder.** `committed` falls by the unspent
  milestone amounts; `balance` is unchanged, because the cash never left the
  bank.
- **The attestation is absolute, not a delta.** It states the project account's
  balance; there is no running total to drift.
- **Bad news is recorded.** An attestation may set `balance` below `committed`.
  Refusing it would leave a stale, higher figure on chain. Tranches then fail
  the `amount <= balance` check until the pool is funded again.

There is no reserve-coverage gate and no attestation staleness rule in M3.
Coverage belongs with the redemption reserve and exit (M4); an old attestation
is visible off chain and gives nobody new power.

### 3. Kind-tagged proposals, threshold by kind, no project timelock

`ProposalDatum` carries a kind-tagged payload instead of a mandatory config:

```aiken
pub type ProposalPayload {
  Config(ConfigDatum)
  Project(ProjectSpec)
  Cancel(AssetName)      // the target project id
}
```

The payload's constructor is the kind. A separate `ProposalKind` enum would put
`Config` and `Project` constructors twice in one Aiken module namespace, so every
kind-sensitive rule matches on the payload instead.

- `Finalize` selects `structural_threshold_bps` (`6667`) for `Config` and
  `project_threshold_bps` (`5001`) for `Project` and `CancelProject`. Quorum is
  unchanged: it is measured against the board-attested eligible count.
- The timelock applies to `Config` only. Project spending is operational, not a
  structural or parameter change (§3.9).
- One governance script keeps ballots, tally, and finalize shared. A second
  script would duplicate the whole M2 surface.
- Creation still needs an active member with live KYC and the board-signed
  eligible leaf list; the payload does not change that.

### 4. Projects commit to milestones

```aiken
pub type Milestone {
  amount: Int,                        // IDR, > 0
  evidence_commitment: ByteArray,     // 32 bytes
}

pub type ProjectSpec {
  recipient_commitment: ByteArray,    // 32 bytes
  deadline: Int,                      // milliseconds
  milestones: List<Milestone>,        // non-empty, ordered
}

pub type ProjectDatum {
  project_id: AssetName,              // == the proposal id, PROJECT NFT name
  spec: ProjectSpec,
  next_milestone: Int,
  status: ProjectStatus,              // ProjectOpen | ProjectClosed | ProjectCancelled
}
```

`ProjectStatus` carries its type's prefix on each constructor: Aiken constructors
share their module's namespace with `ProposalStatus.Open`.

- **No `budget` and no `spent`.** The budget is the sum of the milestone
  amounts, and spending is the sum of the consumed milestones. One source of
  truth means no counter can drift and "spending ≤ budget" is true by
  construction.
- **A tranche consumes exactly the next milestone.** The amount is the approved
  one, and the tranche's revealed evidence hash must equal that milestone's
  commitment. The chain checks that the evidence matches what members approved;
  it cannot check what the evidence says.
- **The recipient is a commitment.** A 32-byte hash of the payee's bank and
  identity details keeps PII off chain (ADR 0007); the co-op holds the
  plaintext and the bank reference.
- **The deadline is after the vote.** Creation requires `deadline > reveal_end`,
  so the approved project has a spending window unless execution is delayed past
  it. Spending stops at the deadline; there is no extension, and a project
  executed after it is closed immediately.

### 5. Tranche authority: the board and the treasurer, in one transaction

`SpendTranche` requires `board_threshold` board signatures **and** the treasurer
signature (the existing `bank_issuer` credential), in the transaction that
spends the project and pool boxes. The redeemer carries the evidence hash and
the hashed bank reference; the amount is the approved milestone amount.

`amount <= balance` and `amount <= committed` both hold: the first stops an
underfunded tranche, and the second keeps a drifted `committed` from going
negative. The amount is the next milestone's, so neither the builder nor the
board can choose a partial payout.

There is no separate spend-attestation UTxO. The bank transfer is off chain, so
the chain cannot order an attestation against it; a second box would record the
same fact twice without adding truth. Separation of duties is the two
signatures, and the transaction is the record. The same reasoning makes the
pool attestation treasurer-signed but not board-signed: a board that could write
the balance could inflate the pool and approve unfundable projects.

### 6. Close, deadline, and cancel

```text
created ──▶ ProjectOpen ──tranche (last milestone)──▶ ProjectClosed
              ├──────CloseProject──────────────────────▶ ProjectClosed
              └──────CancelProject─────────────────────▶ ProjectCancelled
```

- **Auto-close on full spend.** The tranche that consumes the last milestone
  closes the project in the same transaction, so a completed project needs no
  second transaction.
- **Close with a remainder.** `CloseProject` is board-signed before the
  deadline. From `lower_bound >= deadline` it is permissionless: tranches have
  already stopped, so this can only return unspent cash to the pool, and a
  stalled board cannot lock it.
- **Cancel is a proposal.** `CancelProject` carries a project id, uses the
  project threshold and no timelock, and executes only against an open project.
  It closes the project as `ProjectCancelled` and returns the remainder. The
  vote is the authority, so the treasury side needs no board signature.
- **No cancel for `Config`.** The M2 reasoning stands: there is no pre-vote
  window in which cancelling is safe, and an unwanted config proposal is
  rejected at finalize (ADR 0009 §1).
- **No emergency stop.** A board that must stop a payment simply does not sign
  the next tranche; the deadline then opens a permissionless close.

### 7. The proposal bond is dropped

ADR 0009 deferred the bond to M3 "when a treasury exists". Under attested
accounting there is no on-chain asset to hold or forfeit, and an ada bond would
reintroduce on-chain money that ADR 0004 keeps off the ledger. Creation is
already gated by an active member with live KYC, a board-signed eligible list,
and a proposal that names its recipient and milestones. The gate is the
signature, not a forfeit. A bond would only make sense with an on-chain asset,
and none is planned.

### 8. Genesis v3

A fresh preprod genesis, as M2: a new seed and policy set. `ConfigDatum` is
unchanged from v2 — M3 adds no config field, because the treasurer is already
`bank_issuer` and the treasury script is parameterized by the state NFT policy.
`governance` gains the treasury policy as its second parameter, because a passed
project proposal must execute against that exact `PROJECT` policy. The config
validator's state NFT policy parameter changes, so every script hash and the
`governance_policy` id change with it. The one-shot policy mints `STATE` and
`POOL`; the pool opens at `{ balance: 0, committed: 0 }` and the first
attestation funds it. M1 and M2 boxes are abandoned. `contracts/plutus.json`
remains the only off-chain interface.

### 9. Deferred

The reserve-coverage gate and `ReserveAttestation`; the endowment; distribution;
exit; proposal bonds; project metadata/IPFS; automated evidence verification;
contract migration; delegation; the off-chain API, database, indexer, and
frontend; and preprod deployment.

## Consequences

- The chain enforces budgets, approvals, and no oversubscription of the attested
  pool; it cannot verify cash or prevent a fraudulent bank transfer. A malicious
  board plus treasurer can misstate the pool and pay a fake recipient. That is
  the ADR 0004 / §5.4 boundary, not a new one.
- Approval reserves at execution, not at the vote. If the pool moves between the
  vote and the execution, the execution fails and the project must be
  re-proposed or the pool funded. A stale vote never creates an unfunded
  project.
- `committed` may exceed `balance` after an honest attestation. The chain
  records the shortfall instead of hiding it; tranches fail until the pool is
  funded.
- A fully spent project closes itself; a partly spent project needs a close by
  the board, or by anyone after the deadline.
- The project box is self-contained for tranches: no config or proposal
  reference is needed to spend a milestone.
- Pool actions and per-project actions serialize on their boxes: one pool action
  per block and one action per project per block. Fine at co-op scale.
- A milestone is exact. A project that needs less than its approved milestone
  must be approved with a smaller milestone, or the change is a new proposal.
- Evidence is committed, not verified. The board cannot change the requirement
  after the vote, but it can submit an unrelated preimage.
- Dropping the bond means creation spam is bounded by board signatures only.

## Changes from the plan sketch

1. The treasury is attested accounting, not on-chain value.
2. One `treasury` script with `AttestPool` added; `CreateProject` folds into the
   governance `Execute` action.
3. `CancelProject` is a proposal kind; the treasury side pairs with it.
4. `ProjectDatum` drops `budget` and `spent` and stores `next_milestone`; both
   derive from the milestone list.
5. `ProposalDatum` carries a kind-tagged payload instead of `proposed_config`.
6. No separate spend-attestation UTxO; the board and treasurer sign the tranche.
7. The bond is dropped rather than implemented.
8. The deadline is checked against the validity upper bound, and creation
   requires it to be after `reveal_end`.

## Verification

- Aiken rules tests for the pool transitions, the reserve, the project datum and
  milestone order, the evidence check, the deadline, close, and cancel.
- Emulator suites for the pool, project creation, tranches, close, and one
  end-to-end v3 ledger carrying the negative matrix.
- `bun run check`, `bun run check:contracts`, and `bun run check:vectors`.

## Open questions

- The treasurer and the bank issuer are the same credential in M3 (`bank_issuer`
  from config v2). If the co-op separates the roles, a later config version adds
  an authority.
- Where project metadata and evidence plaintext live (IPFS or the off-chain API)
  is deferred to the milestone that builds them.
- Whether a later milestone rejects duplicate or overlapping projects.

## References

- `docs/plan/m3-treasury.md`
- ADR 0004 (the chain is the ledger, contracts first)
- ADR 0005 and ADR 0006 (surplus and the Endowment Reserve; M4)
- ADR 0007 (no PII on chain)
- ADR 0008 (M1 shape and the M2 handoff)
- ADR 0009 (M2 secret ballot; project proposals, cancel, and the bond deferred)
- Plan §3.9, §3.11, §4.3–§4.4, §5.4–§5.5, §6.1–§6.6
- `GLOSSARY.md`
