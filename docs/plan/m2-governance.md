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

- **The co-op holds the vote-secret mapping.** Registration is private: the
  co-op gives each eligible member a 32-byte `vote_secret` (or accepts the
  member's commitment) and can map a leaf back to a member. Outsiders cannot;
  the mapping is the same co-op-held-secret boundary ADR 0007 accepts for KYC.
- **The board attests the eligible set.** `CreateProposal` requires
  `board_threshold` signatures over a transaction that carries the eligible
  Merkle root, `eligible_count`, and the snapshot. A malicious board plus co-op
  could disenfranchise or identify voters; the chain cannot prove personhood or
  the root's correctness.
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
| Member | Registers a vote secret; casts, reveals, or discards their ballot |
| Proposer | An active member with live KYC; signs `CreateProposal` with the board |
| Board | Signs the eligible root/count/snapshot at creation; no tally power |
| Co-op | Builds the eligible root and keeps the leaf ↔ member mapping |
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
  eligible_root: ByteArray,       // 32-byte Merkle root
  eligible_count: Int,
  snapshot: Int,                  // creation lower bound
  start: Int,                     // creation lower bound
  end: Int,                       // start + voting_days
  reveal_end: Int,                // end + reveal_days
  nullifiers: List<ByteArray>,    // spent nullifiers; length is the cast count
  revealed: Int,
  discarded: Int,
  tallied: Int,
  yes: Int,
  no: Int,
  abstain: Int,
  status: ProposalStatus,
  finalized_at: Option<Int>,
}
```

### VoteDatum

```aiken
pub type VoteDatum {
  proposal_id: AssetName,
  choice_commitment: ByteArray,   // 32 bytes
  revealed: Option<Choice>,
}
```

The VOTE NFT asset name is the nullifier, so one vote per member per proposal is
a ledger-level uniqueness check on the mint.

## 6. Hashing and encoding

`sha2_256`, domain-separated by a one-byte tag:

| Value | Preimage |
|---|---|
| Eligible leaf | `0x01 || vote_secret` |
| Merkle parent | `0x02 || min(left, right) || max(left, right)` |
| Nullifier | `0x03 || vote_secret || proposal_id` |
| Choice commitment | `0x04 || choice_index || reveal_salt` |

- `vote_secret`, `reveal_salt`, and `proposal_id` are 32 bytes.
- `Choice` index: `Yes = 0`, `No = 1`, `Abstain = 2`.
- The eligible tree is a sorted-pair Merkle tree; the inclusion proof is a list
  of 32-byte siblings. Secrets are unique, so leaves are unique.
- Windows are milliseconds: `end = start + voting_days * 86_400_000`,
  `reveal_end = end + reveal_days * 86_400_000`, timelock likewise.
- `proposal_id` is a 32-byte nonce chosen at creation and signed by the board.

## 7. Scripts and actions

Two new scripts, both parameterized by the state NFT policy, plus config v2.

### `governance` (proposal box + PROPOSAL NFT policy)

- **CreateProposal** (mint): proposer signs and is an active member with live
  KYC (member box and KYC box as reference inputs); `board_threshold` board keys
  sign; mints exactly one PROPOSAL NFT named `id`; writes `ProposalDatum` with
  `proposed_config` equal to the proposed config, the root/count/snapshot, and
  the config-derived windows; `status = Open`. The proposed config may not change
  the immutable fields.
- **Cast** (spend): `status = Open`, `start <= lower_bound <= end`; exactly one
  VOTE NFT is minted under `config.ballot_policy`; its asset name (the nullifier)
  is not in `nullifiers`; append it. Everything else in the datum is unchanged.
- **Reveal** (spend): `status = Open`, `end < lower_bound <= reveal_end`;
  increment `revealed` by one. Paired with the ballot `Reveal`.
- **Discard** (spend): after `reveal_end`; increment `discarded` by one. Paired
  with the ballot `Discard`.
- **Tally** (spend): `status = Open`, after `end`; spends 1–10 revealed vote
  boxes and adds their choices to `tallied`, `yes`, `no`, `abstain`. Paired with
  the ballot `Count`.
- **Finalize** (spend): after `reveal_end`, `tallied + discarded == cast`; if
  quorum and threshold hold, `status = Passed` and `finalized_at = lower_bound`,
  otherwise `Rejected`. No votes revealed means Rejected.
- **Execute** (spend): `status = Passed`, `kind = Config`, timelock elapsed;
  spends the config box and writes `proposed_config` as the new `ConfigDatum`;
  `status = Executed`. Paired with the config v2 spend.

### `ballot` (vote box + VOTE NFT policy)

- **Cast** (mint): one VOTE minted; asset name is the nullifier; the leaf is in
  the eligible root with the supplied proof; the vote box is at the ballot script
  with `VoteDatum { proposal_id, choice_commitment, revealed: None }`.
- **Reveal** (spend): before `reveal_end`; the vote is unrevealed; the supplied
  choice and salt match `choice_commitment`; the datum becomes
  `revealed = Some(choice)`. Paired with governance `Reveal`.
- **Discard** (spend): after `reveal_end`; the vote is unrevealed; no count.
  Paired with governance `Discard`.
- **Count** (spend + mint `-1`): the vote is revealed; the VOTE NFT burns.
  Paired with governance `Tally`.

### `config` v2

Its spend handler allows only governance execution: a passed `Config` proposal
input with the timelock elapsed, `proposed_config` equal to the new datum, and
the immutable fields unchanged.

## 8. Voting math

- `cast = list.length(nullifiers)`.
- `votes = yes + no + abstain` (revealed and tallied).
- **Quorum:** `votes * 10_000 >= quorum_bps * eligible_count`.
- **Config threshold:** `yes * 10_000 >= structural_threshold_bps * (yes + no)`.
  `yes + no == 0` fails.
- **Passed** requires quorum and threshold. `project_threshold_bps` is reserved
  for M3.

## 9. Known limitations

- **Proposal-box contention.** Cast, reveal, discard, tally, finalize, and
  execute each spend the proposal box, so at most one such transaction lands per
  block. Acceptable for a co-op of dozens on preprod; a later version can batch
  or shard.
- **Growing nullifier list.** The datum grows by 32 bytes per cast. Fine at M2
  scale; a later version replaces it with an accumulator.
- **Co-op-held vote secrets.** A lost secret means no vote; a malicious co-op can
  map ballots to members.
- **Board-attested eligibility.** The count and root are trusted at creation.
- **No receipt NFT.** A participation receipt would recreate the member ↔ ballot
  link, so M2 drops it.
- **No cancel and no bond in M2.**

## 10. Genesis v2

A fresh preprod genesis: new seed, new `STATE` policy, config v2, membership v2,
KYC, bank, governance, and ballot scripts. M1 test-wallet boxes are abandoned
(ADR 0008 consequences). `contracts/plutus.json` is the only off-chain interface.

## 11. Verification

- Aiken unit/property tests for the hashing scheme and vectors, eligibility
  proofs, nullifier/commitment rules, window math, threshold math, creation
  checks, cast/reveal/discard/count, batched tally, finalize, execute, and the
  immutable config fields.
- Emulator: genesis v2 → issue KYC → join → create proposal with a board-signed
  root → cast Yes/No/Abstain → reveal → tally → finalize → execute, plus the
  failure cases: non-board creator, ineligible proof, duplicate nullifier,
  early/late cast, unrevealed tally, missing quorum, below threshold, early
  execute, and immutable-field change.
- `bun run check` and `bun run check:contracts`.

## 12. Deferred

Registration service and secrets delivery, proposal metadata/IPFS, bonds,
cancel, project proposals, migration, delegation, and the off-chain API.

## 13. References

- `docs/adr/0007-no-pii-on-chain.md`
- `docs/adr/0008-m1-config-and-membership.md`
- plan §3.9, §3.17, §6.2–§6.7
