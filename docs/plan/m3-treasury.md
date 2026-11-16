# M3 treasury — spec

**Status:** Planned for M3 (`M3: Treasury`, issues #34–#41). Decisions: ADR 0010,
which wins where the two disagree.

**Depends on:** ADR 0004 (contracts first), ADR 0007 (no PII on chain), ADR 0008
(M1 shape), ADR 0009 (M2 governance and its deferrals), plan §3.9, §3.11, §4.4,
§5.4–§5.5, §6.1–§6.6.

## 1. Goal

One attested project pool and one project lifecycle, enforced on-chain: a
kind-tagged project proposal, a board-and-treasurer-signed tranche against an
approved milestone, a close that returns the remainder, and a cancel that does
the same after a vote. Preprod only; test wallets; no real IDR.

**Non-goals:** the endowment and distribution (M4), exit (M4), the reserve
coverage gate, proposal bonds, project metadata/IPFS, automated evidence
verification, contract migration, delegation, the off-chain API/database/
indexer/frontend, and preprod deployment.

## 2. Trust model

- **The chain cannot see the bank.** The treasurer attests the project account's
  balance; the board approves projects and signs tranches; the bank mandate,
  auditor, and cooperative law are the trust boundary (plan §5.4). A malicious
  board plus treasurer can misstate the pool and pay a fake recipient; the chain
  cannot prevent that.
- **The pool is the spending ceiling.** Approval reserves the budget, a tranche
  debits it, and a close releases the remainder. The pool cannot be
  oversubscribed at approval.
- **The treasurer is the only authority for the balance.** The board cannot
  write the pool balance, so it cannot inflate the pool to approve an unfunded
  project.
- **A tranche needs both authorities.** `board_threshold` board keys and the
  treasurer sign the transaction that spends the project and pool boxes.
- **Members approve commitments, not plaintext.** The recipient and each
  milestone's evidence are 32-byte commitments. The co-op holds the plaintext
  and the bank reference; the chain checks that the tranche's revealed evidence
  hash matches what members approved, not what the evidence says (ADR 0007).
- **Bad news is recordable.** An attestation may set the balance below
  `committed`; tranches then fail until the pool is funded.
- **Anyone may close an expired project.** After the deadline no tranche can
  land, so a permissionless close can only return unspent cash.
- **There is no bond.** Creation is gated by an active member with live KYC and
  the board-signed eligible list (ADR 0010 §7).

## 3. Roles

| Role | Does |
|---|---|
| Member | Proposes projects; casts, reveals, or discards a ballot; may close an expired project |
| Proposer | An active member with live KYC; signs project and cancel creation with the board |
| Board | Signs the eligible leaf list and creation; approves tranches; closes a project before its deadline |
| Treasurer | Attests the pool balance; signs every tranche; keeps the bank reference |
| Co-op | Builds the leaf list, keeps the recipient and evidence plaintext, maps commitments to bank accounts |
| Anyone | Tallies, finalizes, executes; closes an expired project |

## 4. Lifecycle

```text
Proposal: Open ──finalize──▶ Passed ──execute──▶ Executed
            └─────────────▶ Rejected

Project:  created ──▶ Open ──last tranche──▶ Closed
                        ├────CloseProject──▶ Closed
                        └────CancelProject─▶ Cancelled
```

- Proposal phases, tally, finalize, and the reject path are unchanged from M2.
- The three proposal kinds are `Config`, `Project`, and `CancelProject`.
  `Config` keeps its timelock; project kinds do not.
- A project is created only by executing a passed `Project` proposal. Its id is
  that proposal's id.
- A project is closed by a last-milestone tranche, by `CloseProject`, or as
  `Cancelled` by executing a passed `CancelProject`.
- Executing a passed project or cancel proposal can fail if the pool or the
  project moved since the vote. The proposal stays `Passed` and can be retried
  after a top-up, or the project re-proposed.
- Project spending is operational: no timelock. A passed `Config` still waits
  for `finalized_at + timelock_days`.

## 5. Data model

Config and member datums are unchanged from M2. The pool and project boxes live
at the `treasury` script; the project box's id is its proposal id.

```aiken
pub type PoolDatum {
  balance: Int,     // treasurer-attested IDR in the project account
  committed: Int,   // sum of remaining milestone amounts over open projects
}

pub type Milestone {
  amount: Int,                        // IDR, > 0
  evidence_commitment: ByteArray,     // 32 bytes
}

pub type ProjectSpec {
  recipient_commitment: ByteArray,    // 32 bytes
  deadline: Int,                      // milliseconds, > reveal_end
  milestones: List<Milestone>,        // non-empty, ordered
}

// Aiken constructors share their module's namespace with `ProposalStatus.Open`,
// so the project states carry their type's prefix.
pub type ProjectStatus {
  ProjectOpen
  ProjectClosed
  ProjectCancelled
}

pub type ProjectDatum {
  project_id: AssetName,              // == proposal id, PROJECT NFT name
  spec: ProjectSpec,
  next_milestone: Int,                // 0..length(milestones)
  status: ProjectStatus,
}

pub type ProposalPayload {
  Config(ConfigDatum)
  Project(ProjectSpec)
  Cancel(AssetName)                   // the target project id
}
```

The payload constructor is the kind. Aiken constructors share their module's
namespace, so a separate `ProposalKind` with `Config`/`Project` constructors
cannot coexist with this payload; every rule that needs the kind matches on the
payload instead.

`ProposalDatum` replaces `proposed_config` with `payload: ProposalPayload`; its
other fields are unchanged from M2.

```aiken
pub type ProposalDatum {
  id: AssetName,
  proposer: VerificationKeyHash,
  payload: ProposalPayload,
  eligible_leaves: List<ByteArray>,
  start: Int,
  end: Int,
  reveal_end: Int,
  nullifiers: List<ByteArray>,
  discarded: Int,
  tallied: Int,
  yes: Int,
  no: Int,
  abstain: Int,
  status: ProposalStatus,
  finalized_at: Option<Int>,
}
```

There is no `budget` and no `spent` field. `remaining =
sum(milestones[next_milestone..].amount)`, `spent = budget - remaining`, and
`budget = sum(milestones.amount)`. One source of truth per fact.

## 6. Encoding

No new tagged hash is introduced. `recipient_commitment` and
`evidence_commitment` are 32-byte SHA-256 commitments produced off chain; the
chain treats them as opaque. `bank_ref_hash` is non-empty, as in the M1 Bank
Proof.

- **Amounts** are IDR integers; every milestone amount is `> 0`.
- **Deadline and windows** are milliseconds. The M2 time rule applies: not
  before `T` means `lower_bound >= T`; not after `T` means `upper_bound <= T`.
- **A project's deadline** must satisfy `deadline > reveal_end`, so a passed
  project always has a spending window.
- **Ids.** A proposal id is the 32-byte board-signed nonce and the `PROPOSAL`
  NFT name. A project id equals its proposal id and is the `PROJECT` NFT name.
- **Sums.** `budget = sum(milestones.amount)`, `remaining =
  sum(milestones[next_milestone..].amount)`, `spent = budget - remaining`.
- **Pool arithmetic** never goes negative: `balance >= 0`, `committed >= 0`.

## 7. Scripts and actions

### `state_nft` (v3)

The one-shot policy mints `STATE` and `POOL` in the seed-spending transaction,
exactly one of each, each held by exactly one output. Genesis is
deployer-trusted (ADR 0008) and does not run the rules below.

### `treasury` (pool box, project boxes, `PROJECT` NFT policy)

Parameterized by the state NFT policy. One spend purpose and one mint purpose.
The pool is the input holding one `POOL` token at this script; a project is the
input holding one `PROJECT` token at this script.

- **AttestPool** (spend the pool box).
  Redeemer `AttestPool { balance, bank_ref_hash }`. The treasurer
  (`bank_issuer`) signs; `balance >= 0`; `bank_ref_hash` is non-empty; exactly one
  `POOL` is held before and after. The new datum is
  `{ balance, committed: unchanged }`. The balance is absolute, not a delta, and
  may fall below `committed`.

- **SpendTranche** (spend one project box and the pool box).
  Redeemer `SpendTranche { evidence_hash, bank_ref_hash }`.
  `status = ProjectOpen`, `next_milestone < length(milestones)`, and
  `amount = milestones[next_milestone].amount`; `evidence_hash` equals that
  milestone's `evidence_commitment`; `upper_bound <= deadline`;
  `amount <= balance`; `bank_ref_hash` is non-empty; `board_threshold` board keys
  sign and the treasurer signs. Effects: the project datum's `next_milestone`
  becomes `+1`, and its status becomes `ProjectClosed` when it was the last
  milestone; the pool datum becomes `balance - amount` and `committed - amount`.
  Both tokens are held exactly once after the transaction. The spec and id are
  byte-identical.

- **CloseProject** (spend one project box and the pool box).
  Redeemer `CloseProject`. `status = ProjectOpen`. Before the deadline the board
  threshold signs; from `lower_bound >= deadline` no signature is required.
  Effects: `status = ProjectClosed`; `committed - remaining`; the balance is
  unchanged.
  The spec and `next_milestone` are byte-identical.

- **CancelProject** (spend one project box, the pool box, and the proposal).
  Redeemer `CancelProject`. The transaction spends a governance proposal box
  whose datum is `Passed`, whose payload is `Cancel(project_id)`, and whose
  output datum is `Executed`; the project is `ProjectOpen`. No board signature is
  required: the vote is the authority. Effects are `CloseProject`'s with
  `status = ProjectCancelled`.

- **Mint `PROJECT`** (mint purpose). Paired with governance `Execute` on a
  passed `Project` proposal: exactly one token named the proposal id, the
  project box at this script with `next_milestone = 0` and `ProjectOpen`, the spec
  equal to the proposal payload, and the reserve satisfied
  (`committed + budget <= balance`, committed raised by `budget`).

### `governance` additions

- **CreateProposal** accepts all three kinds.
  - Shared: proposer signature, active member box with live KYC as reference
    inputs, `board_threshold` board signatures, exactly one `PROPOSAL` NFT named
    the 32-byte id, non-empty `eligible_leaves`, `start = lower_bound`, `end` and
    `reveal_end` derived from config, `status = Open`, a validity window of at
    most one hour.
  - `Config`: the M2 checks — immutable fields unchanged and the config
    invariants satisfied.
  - `Project`: a non-empty milestone list, every amount `> 0`, 32-byte recipient
    and evidence commitments, and `deadline > reveal_end`.
  - `CancelProject`: a 32-byte project id. The target project box is not read
    here: the treasury script is not a governance parameter until #38, and
    execution re-checks that the project is still `ProjectOpen` (#40).

- **Finalize** selects the threshold by kind: `structural_threshold_bps` for
  `Config`, `project_threshold_bps` for `Project` and `CancelProject`. Quorum,
  the tally/discard completeness rule, and the one-hour window are unchanged.

- **Execute** branches by kind and is permissionless.
  - `Config`: unchanged — timelock, config box spend, writes the payload's config
    as the new config datum.
  - `Project`: no timelock. Spends the proposal and the pool box, checks the
    reserve, mints the `PROJECT` NFT, writes the project box, and sets
    `status = Executed`. Paired with the treasury mint.
  - `CancelProject`: no timelock. Spends the proposal, the project box, and the
    pool box; the project must be open; the project becomes `Cancelled` with the
    remainder released; `status = Executed`. Paired with treasury
    `CancelProject`.

- Every proposal action keeps the M2 datum invariant: only the fields the action
  owns change, and the payload, eligible list, and windows stay byte-identical.

### `config` and `membership`

Unchanged. `ConfigDatum` keeps its v2 shape; only the config validator's state
NFT policy parameter and the `governance_policy` id change with the new genesis.
The treasurer continues to be `bank_issuer`.

## 8. Voting math

Unchanged from M2 except the threshold selection.

- `cast = length(nullifiers)`, `votes = yes + no + abstain`.
- **Quorum:** `votes * 10_000 >= quorum_bps * eligible_count`, where
  `eligible_count` is the board-attested leaf count.
- **Config threshold:** `yes * 10_000 >= structural_threshold_bps * (yes + no)`.
- **Project and cancel threshold:** `yes * 10_000 >= project_threshold_bps *
  (yes + no)`.
- `yes + no == 0` fails both. At `5001` a tie fails and a bare majority passes;
  at `6667` two-thirds fails and more than two-thirds passes.
- Finalize reads the live config, as in M2.

## 9. Known limitations

- **No on-chain money.** The chain cannot verify the bank balance or prevent a
  fraudulent transfer. The trust boundary is the board, treasurer, bank,
  auditor, and cooperative law (§5.4).
- **No reserve-coverage gate.** The §5.5 rule that halts project spending below
  100% `MCAP` coverage needs the redemption reserve. It ships with M4, not here.
- **No staleness rule.** The pool balance is only as fresh as the last
  attestation. An old figure gives nobody new power; it is visible off chain.
- **A shortfall is recorded, not hidden.** An attestation may set `balance <
  committed`; tranches then fail until the pool is funded.
- **Reserve at execution, not at the vote.** If the pool moves between the vote
  and the execution, the execution fails and must be retried or re-proposed.
- **Evidence is committed, not verified.** The chain checks the tranche's
  evidence hash against the approved commitment, not the evidence's content.
- **Milestones are exact.** A project that needs less than an approved milestone
  needs a new proposal, not a partial draw.
- **The deadline cannot be extended.** A failing project is cancelled and, if
  wanted, re-proposed. A project whose deadline passed before its execution can
  still be created and is then closed immediately, returning the reserve.
- **Signing order.** A tranche is recorded when signed; the bank transfer may
  happen just before or after, and the next pool attestation reconciles the
  cash.
- **No emergency stop.** A payment is stopped by not signing it; a cancel costs
  a full proposal cycle.
- **Serialization.** Pool actions serialize on the pool box: one per block. Each
  project serializes on its own box: one action per project per block.
- **No project metadata on chain.** Titles, descriptions, and evidence plaintext
  stay off chain; this milestone ships no indexer or API to read them.
- **The treasurer is the existing `bank_issuer`.** Separating the roles needs a
  later config version.

## 10. Genesis v3

A fresh preprod genesis: new seed, new `STATE`/`POOL` one-shot policy, config v2
(unchanged shape), membership v2, KYC, bank, governance, ballot, and treasury
scripts. The one-shot transaction creates the config box and the pool box at the
treasury script with `{ balance: 0, committed: 0 }`. M1 and M2 test-wallet boxes
are abandoned (ADR 0008 consequences). `contracts/plutus.json` is the only
off-chain interface.

## 11. Verification

- Aiken unit tests for the pool transitions, the reserve, the project datum and
  milestone order, the evidence equality, the deadline, close, and cancel.
- Emulator tests for the pool, project creation, tranches, and close/cancel.
- One v3 end-to-end ledger carrying the negative matrix: unfunded execute, a
  late tranche, wrong evidence, missing board or treasurer signature, a cancel
  mismatch, a tampered datum between actions, a second `PROJECT` name, and a
  permissionless close before the deadline.
- `bun run check`, `bun run check:contracts`, and `bun run check:vectors`.

### Assertion → test

| Assertion | Aiken | Emulator |
|---|---|---|
| Project and cancel creation terms: milestones, amounts, 32-byte commitments, deadline after `reveal_end`, cancel id | `governance_rules.test.ak` | `proposal.test.ts` |
| Pool attestation: treasurer-only, absolute balance, `committed` unchanged, negative or empty rejected | `treasury_rules.test.ak` | `pool.test.ts` |
| Approval reserves at execution; unfunded pool rejected; project datum and singleton | `treasury_rules.test.ak` | `project.test.ts` |
| Milestone order, exact amount, evidence equality, deadline, balance, auto-close | `treasury_rules.test.ak` | `tranche.test.ts` |
| Board close, permissionless close after the deadline, remainder released | `treasury_rules.test.ak` | `close.test.ts` |
| Cancel pairing, open project, remainder released | `governance_rules.test.ak`, `treasury_rules.test.ak` | `close.test.ts` |
| Threshold by kind (5001 vs 6667), quorum unchanged | `governance_rules.test.ak`, `voting.test.ak` | `proposal.test.ts` |
| Full lifecycle and the §11 negative matrix on one ledger | — | `end-to-end.test.ts` |

## 12. Deferred

The reserve-coverage gate and `ReserveAttestation`; the endowment; distribution;
exit; proposal bonds; project metadata/IPFS; automated evidence verification;
contract migration; delegation; the off-chain API, database, indexer, and
frontend; and preprod deployment.

## 13. References

- `docs/adr/0010-m3-project-treasury.md`
- ADR 0004 (the chain is the ledger, contracts first)
- ADR 0007 (no PII on chain)
- ADR 0008 (M1 shape and the M2 handoff)
- ADR 0009 (M2 secret ballot; project proposals, cancel, and the bond deferred)
- Plan §3.9, §3.11, §4.3–§4.4, §5.4–§5.5, §6.1–§6.6
- `docs/plan/m2-governance.md`
- `GLOSSARY.md`
