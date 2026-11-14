# ADR 0009: M2 secret-ballot governance

## Status

Accepted. 2026-11-14. Applies to M2 (`governance`, `ballot`, config v2) and
replaces `docs/plan/m2-governance.md` where the two disagree. The spec is
updated to match this ADR.

## Context

ADR 0004 puts contracts first: M1 shipped `config` and `membership`; M2 is
governance. ADR 0007 makes the ballot secret: a member commits to a choice and
reveals it, quorum and counts are public, individual ballots are not. ADR 0008
fixed the M1 shape and handed M2 a config with no spend path. M2 runs on preprod
with test wallets and no real IDR.

The M2 spec draft proposed a sorted-pair Merkle root over the eligible set, a
proposal-side `Reveal` action with a `revealed` counter, and lower-bound time
checks. Reviewing those against the ledger and the co-op's actual scale (dozens
of members) produced the decisions below.

## Decision

### 1. One proposal kind, permissionless after creation

`Config` is the only kind in M2. Lifecycle: `Open` → `Passed` or `Rejected` →
`Executed`. There is no cancel and no bond: a cancel after ballots exist would
discard them, and a bond needs a treasury (M3). Finalize is decided at the end
of the reveal phase, and an unwanted proposal is rejected there. Tally,
finalize, and execute are permissionless; the board has no counting or execution
power. A proposal id is a board-signed 32-byte nonce, so id uniqueness is a
builder duty, not a ledger guarantee.

### 2. The eligible set is a leaf list, not a Merkle root

Members generate their own 32-byte vote secret and give the co-op only the
eligible leaf `H(0x01 || vote_secret)`. The co-op maps leaf → member for
eligibility and audit; it never holds the secret, so it cannot cast a ballot for
a member. The proposal datum carries `eligible_leaves: List<ByteArray>`; the
eligible count is the list length. A ballot is eligible when its leaf is in the
list.

There is no Merkle tree, no inclusion proof, and no padding rule. At the co-op's
size the list is about a kilobyte in a datum that already grows one nullifier per
cast, and the tree was the largest single piece of the milestone. The board still
attests the set at creation; the chain cannot prove personhood or the set's
correctness. Duplicate leaves are not rejected on-chain: the nullifier is unique
per proposal, so a duplicate cannot vote twice, and a duplicate only makes quorum
harder. The co-op must not duplicate, which the same trust boundary already
covers.

The list breaks somewhere in the hundreds of members (Cardano's transaction size
limit). A later version replaces it, as the spec already defers for the nullifier
list.

### 3. Hashing

`sha2_256`, domain-separated by one byte:

| Value | Preimage | Tag |
|---|---|---|
| Eligible leaf | `vote_secret` | `0x01` |
| Nullifier | `vote_secret || proposal_id` | `0x03` |
| Choice commitment | `choice_index || reveal_salt` | `0x04` |

`0x02` was the Merkle parent tag and is retired with the tree. `vote_secret`,
`reveal_salt`, and `proposal_id` are 32 bytes. Choice index: `Yes = 0`,
`No = 1`, `Abstain = 2`; the commitment primitive rejects any other index.

### 4. Time is read from the validity bounds

A script has no clock. It sees the transaction's validity window: it lands no
earlier than the lower bound and no later than the upper bound.

- **Not before `T`:** `lower_bound >= T`.
- **Not after `T`:** `upper_bound <= T`.

Each is sound because the real inclusion time lies between the bounds. The
draft's `start <= lower_bound <= end` allowed a late cast: an old lower bound is
valid. `finalized_at` is stamped from the upper bound, the only bound that cannot
be in the past; execute requires `lower_bound >= finalized_at + timelock_days`,
so the wait can only be stretched, never skipped by backdating the finalize.
Creation and finalize also require `upper_bound - lower_bound <= 1 hour`, which
keeps `start` at most an hour stale and bounds the timelock stretch.

Windows are config days and derive in milliseconds:
`end = start + voting_days * 86_400_000`,
`reveal_end = end + reveal_days * 86_400_000`.

### 5. The ballot is self-contained once cast

```aiken
pub type VoteDatum {
  proposal_id: AssetName,
  end: Int,
  reveal_end: Int,
  choice_commitment: ByteArray,
  revealed: Option<Choice>,
}
```

`Cast` copies `end` and `reveal_end` from the proposal, so `Reveal` needs only the
vote box: it checks the window against its own datum, checks the commitment
opening, and sets `revealed`. Reveal is not a proposal action, so members reveal
in parallel and the proposal keeps no `revealed` counter.

`Discard`, `Tally`, `Finalize`, and `Execute` spend the proposal box. The `VOTE`
NFT name is the nullifier, so one ballot per member per proposal is a ledger-level
uniqueness check on the mint. There is no receipt NFT: it would relink the member
to the ballot.

### 6. Every proposal action preserves the rest of the datum

Members vote on a proposal id, not on the config's bytes, and tally, finalize,
and execute are permissionless. Each governance action therefore proves that it
changes only the fields it owns: `Cast` appends to `nullifiers`; `Discard`
increments `discarded`; `Tally` updates `tallied`, `yes`, `no`, `abstain`;
`Finalize` sets `status` and `finalized_at`; `Execute` sets `status`. Everything
else, including `proposed_config` and `eligible_leaves`, must be byte-identical to
the input. This is the `keep` pattern the membership validator already uses.

`ProposalDatum` has no `snapshot` (it duplicated `start`) and no `revealed`
counter (nothing read it).

### 7. Voting math

- `cast = length(nullifiers)`.
- `votes = yes + no + abstain`.
- **Quorum:** `votes * 10_000 >= quorum_bps * eligible_count`.
- **Config threshold:** `yes * 10_000 >= structural_threshold_bps * (yes + no)`
  with `yes + no > 0`.
- **Passed** requires quorum and threshold. `project_threshold_bps` (`5001`) is
  reserved for M3.

The structural threshold is `6667`, which means **more than two-thirds**:
2-of-3 is rejected. That is deliberate, not rounding: the spec and tests say so,
and a test asserts the 2-of-3 rejection.

### 8. Config v2

M1 fields plus `governance_policy`, `ballot_policy`, `quorum_bps`,
`project_threshold_bps`, `structural_threshold_bps`, `timelock_days`,
`voting_days`, and `reveal_days`.

Immutable at execution: `network`, `membership_policy`, `kyc_policy`,
`bank_policy`, `governance_policy`, `ballot_policy`. Everything else may change,
so governance can rotate the board, the issuers, the year, and the parameters.

Creation and execution validate structural invariants, so a vote cannot install a
config that bricks the scripts: `annual_amount > 0`; each split bps in
`0..10000` and the two sum to `10_000`; the standard cap in `0..10000` and at
least `capital_participation_bps`; `board_keys` non-empty and distinct with
`1 <= board_threshold <= length`; each threshold and `quorum_bps` in `1..10000`;
`voting_days >= 1`, `reveal_days >= 1`, `timelock_days >= 0`. Genesis stays
deployer-trusted (ADR 0008): it does not run these checks.

### 9. Fresh genesis

M2 deploys a new seed, state NFT policy, config v2, membership v2, KYC, bank,
governance, and ballot scripts. M1 test-wallet boxes are abandoned. ADR 0008
already accounts for this: M1–M4 deploy together before mainnet, so no
production migration is owed. `contracts/plutus.json` remains the only off-chain
interface.

### 10. Deferred

Registration service and secret delivery, proposal metadata/IPFS, bonds, cancel,
project proposals, contract migration, delegation, the off-chain API/DB/indexer/
frontend, and preprod deployment.

## Consequences

- The co-op still holds the leaf → member mapping, so a malicious co-op can link
  a ballot to a member. That is the ADR 0007 boundary; it cannot vote for a
  member, because it never holds the secret.
- A lost secret is an uncast ballot. Quorum is measured against the attested
  count, so losing a secret makes a result harder to reach, never easier.
- Reveals run in parallel, but cast, discard, tally, finalize, and execute still
  serialize on the proposal box: one per block. Acceptable at co-op scale.
- The eligible list and the nullifier list both grow with the membership. The
  first upgrade point is a few hundred members.
- The 1-hour window cap can stretch a timelock by at most an hour, and can delay
  execution if a finalizer picks a late upper bound; it cannot shorten the wait.
- Structural invariants reject broken configs but not bad policy choices: a
  passed vote may still set a low quorum or a zero timelock.

## Changes from the M2 spec draft

1. Eligible set: leaf list replaces the sorted-pair Merkle root and proof.
2. Reveal is ballot-only; the proposal-side `Reveal` action and `revealed`
   counter are removed; `VoteDatum` carries `reveal_end`.
3. Time checks use the lower bound for "not before" and the upper bound for "not
   after"; `finalized_at` is the upper bound; create/finalize windows are capped
   at one hour.
4. `ProposalDatum` drops `snapshot`; every action preserves the rest of the datum.
5. `6667` is documented as "more than two-thirds" and tested against 2-of-3.
6. Config invariants are enforced at creation and execution; windows have a
   one-day floor.
7. Vote secrets are member-generated; the co-op receives only the leaf.

## Verification

- Aiken unit and property tests for the tagged hashes, window derivation, the
  time rule, and quorum/threshold edges, including 2-of-3 rejection.
- Cross-language vectors in `packages/shared/vectors/governance.json`, consumed by
  `contracts/lib/sequoia/voting_vectors.ak` and the TypeScript mirror.
- The emulator end-to-end suite and negative matrix land in later M2 tickets.
- `bun run check:vectors`, `bun run check:contracts`, and `bun run check`.

## Open questions

- The 1-hour cap value against the transaction builder's default validity length.
- Whether a later milestone rejects duplicate leaves using identity commitments.

## References

- `docs/plan/m2-governance.md`
- ADR 0004 (the chain is the ledger, contracts first)
- ADR 0007 (no PII on chain, secret ballot)
- ADR 0008 (M1 shape and the M2 handoff)
- Plan §3.9, §3.17, §6.2–§6.7
- `GLOSSARY.md`
