# M2 governance — spec

**Status:** Draft for M2 (`M2: Governance`). Replaces the governance parts of
plan §3.9, §6.2–§6.5 where they disagree. ADR 0009 records the decisions.

**Depends on:** ADR 0004 (contracts first), ADR 0007 (secret ballot), ADR 0008
(M1 shape and the M2 handoff), plan §3.9 and §3.17.

## 1. Goal

One proposal kind, `Config`, whose lifecycle is enforced on-chain: a
board-attested eligible set, secret ballots with commit-reveal, a permissionless
tally, and a config update that only happens after a passed vote and the
timelock. Preprod only; test wallets; no real IDR.

**Non-goals:** projects and treasury (M3), distribution and exit (M4), contract
migration (§6.7), proposal bonds, delegation, an off-chain registration service,
API/Postgres/indexer/frontend, and preprod deployment.

## 2. Trust model

- **Members generate their own vote secret.** The member keeps the 32-byte
  `vote_secret` and gives the co-op only the leaf, `H(0x01 || vote_secret)`. The
  co-op maps leaf back to member for eligibility and audit but never holds the
  secret, so it cannot cast a ballot on a member's behalf. Outsiders cannot map a
  ballot to a member; the leaf-to-member mapping is the same co-op-held-secret
  boundary ADR 0007 accepts for KYC.
- **The board attests the eligible set.** `CreateProposal` requires
  `board_threshold` signatures over a transaction that carries the eligible leaf
  list; the eligible count is the list length. A malicious board plus co-op could
  disenfranchise or identify voters; the chain cannot prove personhood or the
  list's correctness. A duplicate leaf cannot vote twice (its nullifier is
  unique), it only makes quorum harder, so the chain does not reject duplicates.
- **Only revealed votes decide.** Unrevealed ballots are not counted. Quorum
  uses the board-attested `eligible_count`, so losing a secret makes quorum
  harder, not easier.
- **Tally and execution are permissionless.** The board has no special counting
  or execution power.
- **Proposal ids are board-signed nonces.** A duplicate id would make nullifiers
  collide across proposals; uniqueness is a co-op/board builder duty, not a
  ledger guarantee.

## 3. Roles

| Role | Does |
|---|---|
| Member | Generates a vote secret; casts, reveals, or discards their ballot |
| Proposer | An active member with live KYC; signs `CreateProposal` with the board |
| Board | Signs the eligible leaf list at creation; no tally power |
| Co-op | Builds the leaf list and keeps the leaf ↔ member mapping |
| Anyone | Tallies revealed ballots, finalizes, executes a passed proposal, discards an unrevealed ballot after the deadline |

## 4. Lifecycle

```text
Open ──finalize──▶ Passed ──execute──▶ Executed
  └──────────────▶ Rejected
```

- **Open** covers both the voting and reveal phases; the phases are derived from
  `start`, `end`, and `reveal_end`.
- **Cancel is not in M2.** There is no pre-voting window in which a cancel is
  safe, and cancelling once ballots exist would discard them. An unwanted
  proposal is rejected at finalize. Revisit with the M3 bond.
- After `reveal_end`, anyone can discard an unrevealed ballot so it cannot block
  finalize.
- Finalize requires `tallied + discarded == cast`.
- Execute is allowed only after `finalized_at + timelock_days`.

## 5. Data model

### ConfigDatum v2

M1 fields plus governance authorities and windows. All fields are integers or
lists as in ADR 0008.

```aiken
pub type ConfigDatum {
  // M1 fields: contribution_year, annual_amount, split bps, cap, board_keys,
  // board_threshold, kyc_issuer, bank_issuer, network, membership_policy,
  // kyc_policy, bank_policy.
  governance_policy: PolicyId,
  ballot_policy: PolicyId,
  quorum_bps: Int,                 // 5000
  project_threshold_bps: Int,      // 5001, reserved for M3
  structural_threshold_bps: Int,   // 6667
  timelock_days: Int,              // 7
  voting_days: Int,                // 7
  reveal_days: Int,                // 3
}
```

**Immutable at execution:** `network`, `membership_policy`, `kyc_policy`,
`bank_policy`, `governance_policy`, `ballot_policy`. Everything else may change.
The state NFT policy is the script parameter, not a datum field.

### MemberDatum v2

M1 fields minus `last_voted_proposal`. Secret ballots never write it, and the
M2 fresh genesis removes it.

### ProposalDatum

```aiken
pub type ProposalKind {
  Config
}

pub type ProposalStatus {
  Open
  Passed
  Rejected
  Executed
}

pub type Choice {
  Yes
  No
  Abstain
}

pub type ProposalDatum {
  id: AssetName,                  // 32-byte nonce, PROPOSAL NFT name
  proposer: VerificationKeyHash,
  kind: ProposalKind,
  proposed_config: ConfigDatum,
  eligible_leaves: List<ByteArray>, // one 32-byte leaf per voter
  start: Int,                     // creation lower bound
  end: Int,                       // start + voting_days
  reveal_end: Int,                // end + reveal_days
  nullifiers: List<ByteArray>,    // spent nullifiers; length is the cast count
  discarded: Int,
  tallied: Int,
  yes: Int,
  no: Int,
  abstain: Int,
  status: ProposalStatus,
  finalized_at: Option<Int>,
}
```

The eligible count is `length(eligible_leaves)`. There is no `eligible_root`:
the list is the set (ADR 0009 §2). `snapshot` duplicated `start` and `revealed`
was never read, so neither is carried.

### VoteDatum

```aiken
pub type VoteDatum {
  proposal_id: AssetName,
  end: Int,                       // copied from the proposal at cast
  reveal_end: Int,                // copied from the proposal at cast
  choice_commitment: ByteArray,   // 32 bytes
  revealed: Option<Choice>,
}
```

`end` and `reveal_end` make `Reveal` self-contained: it needs no proposal or
config reference to check its window (ADR 0009 §5).

The VOTE NFT asset name is the nullifier, so one vote per member per proposal is
a ledger-level uniqueness check on the mint.

## 6. Hashing and encoding

`sha2_256`, domain-separated by a one-byte tag:

| Value | Preimage | Tag |
|---|---|---|
| Eligible leaf | `vote_secret` | `0x01` |
| Nullifier | `vote_secret || proposal_id` | `0x03` |
| Choice commitment | `choice_index || reveal_salt` | `0x04` |

- `vote_secret`, `reveal_salt`, and `proposal_id` are 32 bytes.
- `Choice` index: `Yes = 0`, `No = 1`, `Abstain = 2`; the commitment primitive
  rejects any other index.
- `0x02` was the Merkle parent tag and is retired with the tree.
- Eligible leaves are unique by construction; duplicates are the co-op's error to
  avoid, not a chain check (ADR 0009 §2).
- Windows are milliseconds: `end = start + voting_days * 86_400_000`,
  `reveal_end = end + reveal_days * 86_400_000`, and
  `timelock_end = finalized_at + timelock_days * 86_400_000`, where
  `finalized_at` is the finalize transaction's upper bound (ADR 0009 §4).
- `proposal_id` is a 32-byte nonce chosen at creation and signed by the board.

### Time rule

A script sees the transaction's validity bounds, not a clock. The real inclusion
time lies between them.

- **Not before `T`:** `lower_bound >= T`.
- **Not after `T`:** `upper_bound <= T`.

`finalized_at` is the finalize transaction's upper bound, and creation and
finalize require a window of at most one hour (ADR 0009 §4).

## 7. Scripts and actions

Two new scripts, both parameterized by the state NFT policy, plus config v2.
Every governance action proves that it changes only the fields it owns (ADR 0009
§6).

### `governance` (proposal box + PROPOSAL NFT policy)

- **CreateProposal** (mint): proposer signs and is an active member with live
  KYC (member box and KYC box as reference inputs); `board_threshold` board keys
  sign; mints exactly one PROPOSAL NFT named `id`; writes `ProposalDatum` with
  `proposed_config` equal to the proposed config, a non-empty `eligible_leaves`,
  `start = lower_bound`, `end` and `reveal_end` derived from the config, and
  `status = Open`. The transaction's validity window is at most one hour. The
  proposed config may not change the immutable fields and must satisfy the
  config invariants.
- **Cast** (spend): `status = Open`, `lower_bound >= start` and
  `upper_bound <= end`; exactly one VOTE NFT is minted under
  `config.ballot_policy`; its asset name (the nullifier) is not in `nullifiers`;
  append it. Everything else in the datum is unchanged.
- **Discard** (spend): `status = Open`, `lower_bound >= reveal_end`, one ballot
  per transaction; increment `discarded` by one. Paired with the ballot
  `Discard`.
- **Tally** (spend): `status = Open`, `lower_bound >= end`; spends 1–10 revealed
  ballot boxes of this proposal and adds their choices to `tallied`, `yes`, `no`,
  `abstain`. Paired with the ballot `Count`.
- **Finalize** (spend): `lower_bound >= reveal_end`, `tallied + discarded ==
  cast`, and a validity window of at most one hour; if quorum and threshold hold,
  `status = Passed` and `finalized_at = upper_bound`, otherwise `Rejected`. No
  votes revealed means Rejected.
- **Execute** (spend): `status = Passed`, `kind = Config`,
  `lower_bound >= finalized_at + timelock_days * 86_400_000`; spends the config
  box and writes `proposed_config` as the new `ConfigDatum`; `status = Executed`.
  Paired with the config v2 spend.
- There is no governance `Reveal` action: reveal touches only the ballot (ADR
  0009 §5).

### `ballot` (vote box + VOTE NFT policy)

- **Cast** (mint): one VOTE minted; asset name is the nullifier; the leaf is in
  the proposal's `eligible_leaves`; the vote box is at the ballot script with
  `VoteDatum { proposal_id, end, reveal_end, choice_commitment, revealed: None }`,
  copying both deadlines from the proposal.
- **Reveal** (spend): `lower_bound >= end` and `upper_bound <= reveal_end`; the
  vote is unrevealed; the supplied choice and salt match `choice_commitment`; the
  datum becomes `revealed = Some(choice)`. The window comes from the vote datum,
  so reveal needs no proposal or config reference and members reveal in parallel.
- **Discard** (spend): `lower_bound >= reveal_end`; the vote is unrevealed; no
  count. Paired with governance `Discard`.
- **Count** (spend + mint `-1`): the vote is revealed; the VOTE NFT burns.
  Paired with governance `Tally`.

### `config` v2

Its spend handler allows only governance execution: a passed `Config` proposal
input with the timelock elapsed, `proposed_config` equal to the new datum, the
immutable fields unchanged, and the config invariants satisfied.

## 8. Voting math

- `cast = list.length(nullifiers)`.
- `votes = yes + no + abstain` (revealed and tallied).
- **Quorum:** `votes * 10_000 >= quorum_bps * eligible_count`, where
  `eligible_count` is the board-attested leaf count.
- **Config threshold:** `yes * 10_000 >= structural_threshold_bps * (yes + no)`.
  `yes + no == 0` fails.
- **Passed** requires quorum and threshold. `project_threshold_bps` is reserved
  for M3.

`structural_threshold_bps = 6667` means **more than two-thirds**: 2-of-3 is
rejected (ADR 0009 §7). `project_threshold_bps = 5001` means more than half.

## 9. Known limitations

- **Proposal-box contention.** Cast, discard, tally, finalize, and execute each
  spend the proposal box, so at most one such transaction lands per block.
  Reveal is ballot-only and lands in parallel. Acceptable for a co-op of dozens
  on preprod; a later version can batch or shard.
- **Linear growth.** The eligible list is fixed at creation and the nullifier
  list grows by 32 bytes per cast. Fine at M2 scale; the eligible list is the
  first to hit the transaction size limit, at a few hundred members, and a later
  version replaces it with an accumulator.
- **Member-held vote secrets.** A lost secret means no vote; a malicious co-op can
  map ballots to members but cannot cast for them, because it never holds the
  secret. A member who gives the co-op the secret loses that protection.
- **Board-attested eligibility.** The leaf list is trusted at creation; the chain
  cannot prove personhood or the list's correctness. A duplicate leaf only makes
  quorum harder.
- **No receipt NFT.** A participation receipt would recreate the member ↔ ballot
  link, so M2 drops it.
- **No cancel and no bond in M2.**
- **Config invariants are structural only.** A passed vote may still set a low
  quorum, a zero timelock, or a poor split within the legal range.

## 10. Genesis v2

A fresh preprod genesis: new seed, new `STATE` policy, config v2, membership v2,
KYC, bank, governance, and ballot scripts. M1 test-wallet boxes are abandoned
(ADR 0008 consequences). `contracts/plutus.json` is the only off-chain interface.

## 11. Verification

- Aiken unit/property tests for the tagged hashing, eligibility membership,
  nullifier/commitment rules, window math and the time rule, threshold math,
  creation checks, cast/reveal/discard/count, batched tally, finalize, execute,
  the proposal-datum invariant, and the immutable config fields.
- Emulator: genesis v2 → issue KYC → join → create proposal with a board-signed
  leaf list → cast Yes/No/Abstain → reveal → tally → finalize → execute, plus the
  failure cases: non-board creator, ineligible leaf, duplicate nullifier,
  early/late cast (including a stale lower bound), early/late reveal, unrevealed
  tally, missing quorum, below threshold (including 2-of-3 at 6667), early
  execute, a data tamper between actions, and an immutable-field change.
- `bun run check`, `bun run check:contracts`, and `bun run check:vectors`.

## 12. Deferred

Registration service and secrets delivery, proposal metadata/IPFS, bonds,
cancel, project proposals, migration, delegation, and the off-chain API.

## 13. References

- `docs/adr/0009-m2-secret-ballot-governance.md`
- `docs/adr/0007-no-pii-on-chain.md`
- `docs/adr/0008-m1-config-and-membership.md`
- plan §3.9, §3.17, §6.2–§6.7
