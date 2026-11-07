# ADR 0008: M1 config and membership on-chain shape

## Status

Accepted. 2026-11-06. Applies to M1 (`config` + `membership`) and replaces
the plan §6.3 sketch wherever the two disagree.

## Context

ADR 0004 sets the order: contracts first, `config` and `membership` (M1), then
governance (M2), treasury (M3), distribution and exit (M4), audit (M5). M1 runs
on preprod with test wallets, no real IDR, and no real personal data (ADR 0007).
Datum shapes may still change on preprod until M5, but every change is work, so
this ADR fixes the shape M1–M4 will use.

Plan §6.3 sketches the datums. Four parts of that sketch duplicate state or put
another context's facts in the member record:

- `member_capital` and `capital_participation` duplicate the `MCAP`/`PROJ`
  quantities already held in the UTxO value.
- `kyc_credential` and `kyc_expiry` duplicate the KYC attestation, which has its
  own lifecycle (renewal and revocation).
- `founder_lock_until` and `release_schedule` duplicate the vesting schedule,
  which is a pure function of `joined_at` and the shared constants.
- `member_policy`, `member_capital_policy`, and
  `capital_participation_policy` are three policies for one mint/burn authority.

The decisions below come from the M1 design session and the Aiken survey in
`docs/research/aiken-project-structure.md`. This ADR is the input to the Aiken
types and the emulator flow; it is not a substitute for the code.

## Decision

### 1. Scripts and parameters

Four scripts plus the state NFT policy.

```aiken
// One-shot: mints exactly one STATE token and spends the seed.
validator state_nft(seed_ref: OutputReference) { ... }

// Holds the rulebook. M1 has no spend path.
validator config(state_nft_policy: PolicyId) { ... }

// KYC attestation NFT, issuer-authorized mint and burn.
validator kyc_attestation(state_nft_policy: PolicyId) { ... }

// Bank proof guard: the NFT it holds must be burned when it is spent.
validator bank_attestation() { ... }

// Member records. Spend and mint of MEMBER, MCAP, PROJ, BANK.
validator membership(state_nft_policy: PolicyId) { ... }
```

`config`, `kyc_attestation`, and `membership` take the state NFT policy as their
only parameter and find the config box by looking for the `STATE` asset in
`self.reference_inputs`. `bank_attestation` is parameterless: it reads the asset
it holds from its own spent input and requires that asset to be burned in the
same transaction.

There is no cross-parameter cycle. The state NFT policy ID is derived from the
seed reference before any of the four scripts is applied, and the three script
policy IDs are written into the config datum at genesis.

`config` is locked in M1: its spend handler fails with a trace. The `STATE`
token cannot move until M2 deploys a config validator with the governance update
path.

### 2. Tokens

One membership policy, four asset names:

| Asset name | Quantity | Purpose |
|---|---:|---|
| `member_id` (≤ 32 bytes) | 1 | The member's `MEMBER` NFT |
| `MCAP` | balance | Member Capital |
| `PROJ` | balance | Capital Participation |
| `nonce` (≤ 32 bytes) | 1 | The `BANK` proof NFT |

`MCAP` and `PROJ` are fungible; the balance is the quantity in the member box.
`MEMBER` and `BANK` are NFTs: unique asset names, quantity 1.

The state NFT is separate: `STATE` under the one-shot state NFT policy.

### 3. Datums

```aiken
pub type ConfigDatum {
  contribution_year: Int,                      // e.g. 2026
  annual_amount: Int,                          // IDR
  member_capital_bps: Int,                     // 7000
  capital_participation_bps: Int,              // 3000
  standard_capital_participation_max_bps: Int, // 5000
  board_keys: List<VerificationKeyHash>,
  board_threshold: Int,
  kyc_issuer: Credential,                      // key or script
  bank_issuer: Credential,
  network: Int,                                // 0 testnet, 1 mainnet
  membership_policy: PolicyId,
  kyc_policy: PolicyId,
  bank_policy: PolicyId,
}

pub type MemberClass {
  Standard
  Founder
}

pub type MemberStatus {
  Active
  Inactive
  PendingExit
  Exited
}

pub type MemberDatum {
  owner: VerificationKeyHash,
  member_id: ByteArray,                 // ≤ 32 bytes, pseudonymous
  class: MemberClass,
  status: MemberStatus,
  joined_at: Int,                       // POSIX ms; starts founder vesting
  last_contribution_year: Option<Int>,
  last_voted_proposal: Option<Int>,     // reserved for M2
}

pub type KycDatum {
  issuer: VerificationKeyHash,          // snapshotted at issue time
  member_id: ByteArray,
  commitment: ByteArray,                // keyed hash, no PII
  level: Int,                           // 1 basic, 2 enhanced
  issued_at: Int,
  expires_at: Int,
}

pub type BankProofDatum {
  issuer: VerificationKeyHash,          // snapshotted at issue time
  member_id: ByteArray,
  contribution_year: Int,
  amount: Int,
  bank_ref_hash: ByteArray,             // hash, never the raw reference
  nonce: ByteArray,                     // BANK asset name
  issued_at: Int,
}
```

Absent on purpose: balances, KYC fields in the member record, founder lock
fields. Each has a single owner elsewhere.

### 4. Boxes

| Box | Address | Value | Datum |
|---|---|---|---|
| Config | `config` | `1 STATE` + min ADA | `ConfigDatum` |
| Member | `membership` | `1 member_id` + `MCAP` + `PROJ` + min ADA | `MemberDatum` |
| KYC | `kyc_attestation` | `1 member_id` (KYC policy) + min ADA | `KycDatum` |
| Bank proof | `bank_attestation` | `1 nonce` (membership policy) + min ADA | `BankProofDatum` |

### 5. Actions

**Genesis (deploy, not a redeemer).** Spend the seed box, mint `STATE`, create
the config box with the initial `ConfigDatum`. The config datum carries the
three script policy IDs, which the transaction builder computes after applying
the state NFT policy parameter to each script.

**Join (membership mint).**

- Inputs: member-funded ADA.
- Reference inputs: config, live KYC box.
- Signatories: member owner and `board_threshold` board keys.
- Mint: `1 member_id` (`MEMBER`).
- Output: member box with `MemberDatum` and min ADA.
- Checks: board threshold met; KYC live, not expired, `level >= 1`, and its
  `member_id` equals the new member id; `class` is `Standard` or `Founder`;
  `status = Active`; `joined_at` taken from the transaction validity range; no
  existing member box for that `member_id` (see the trust boundary in §6).

**Contribute (membership mint + spend).**

- Inputs: member box, bank proof box.
- Reference inputs: config, live KYC box.
- Signatories: member owner.
- Mint: `+MCAP`, `+PROJ`, `-1 nonce` (`BANK`).
- Output: new member box with the same owner, `member_id`, `class`, and
  `status`, an updated `last_contribution_year`, and increased quantities.
- Checks: member active; KYC live; the bank proof's `member_id` matches the
  member, its `contribution_year` matches the config year, and its `amount`
  matches the config annual amount; `last_contribution_year` is not the config
  year; the split from config is applied with the plan's floor rule;
  `MCAP + PROJ` minted equals `annual_amount`; the bank proof NFT is burned;
  token conservation holds.

**Issue bank proof (membership mint).**

- Inputs: treasurer-funded ADA.
- Reference inputs: config.
- Signatories: `bank_issuer`.
- Mint: `1 nonce` (`BANK`).
- Output: bank proof box with `BankProofDatum`.
- Checks: bank issuer signed; `issuer` matches; `contribution_year` matches
  config; `amount` matches config; `bank_ref_hash` and `nonce` are unique
  off-chain.

**Issue / renew / revoke KYC (KYC mint + spend).**

- Signatories: `kyc_issuer`.
- Issue and renew mint `1 member_id` under the KYC policy and create or replace
  the KYC box. Renew spends the old box and mints the new one with the same
  `member_id`. Revoke spends the box and burns the NFT, so the member record's
  next gated action finds no live attestation.

**Config update.** Not in M1. The config box has no spend path.

### 6. Rules

1. **Non-transferability.** The membership `spend` handler requires the owner's
   signature, exactly one output at the membership script, the same `owner`,
   `member_id`, and `class`, and all `MEMBER`/`MCAP`/`PROJ` quantities returned
   to that output. Quantities in any other output must be zero. M4 adds the
   burn branch for exit.
2. **One member per admitted member.** The KYC issuer assigns one `member_id`
   per person; the board approves one admission per `member_id`; the join check
   binds the KYC box to the new member id. A duplicate admission requires the
   issuer and the board to collude. That is the trust boundary; the chain does
   not prove personhood.
3. **One contribution per year.** `last_contribution_year` in the member box
   plus the config year on the bank proof.
4. **No live KYC, no gated action.** Expiry is checked against the transaction
   validity; revocation is the absence of a live KYC box.
5. **One use per bank proof.** The proof is a UTxO that is spent, and the bank
   script requires its NFT to be burned in the same transaction.
6. **No double count.** `MCAP + PROJ` minted equals the annual amount; the split
   comes from config; the plan's rounding rule (floor `MCAP`, remainder to
   `PROJ`) is implemented in `lib/sequoia/split.ak` and mirrored by
   `@sequoia/shared`.
7. **Config is immutable in M1.** No spend path.
8. **Board and issuers are separate from member wallets.** A member wallet
   compromise must not approve admissions, issue KYC, or issue bank proofs.

### 7. Authorities

- **Board** = `board_keys` plus `board_threshold` in the config. A member is on
  the board because their key is listed, not because of a member label. Board
  seats are separate from membership and are re-elected under §3.8.
- **KYC issuer** = `kyc_issuer` credential. The only authority that can mint or
  burn KYC attestations.
- **Treasurer / bank issuer** = `bank_issuer` credential. The only authority
  that can issue bank proofs.
- M1 uses one operator key for all three with `board_threshold = 1`. The fields
  are shaped for the production 3-of-5 board and separate issuer keys; only the
  values change.

### 8. Founders

`FOUNDER` is admitted in M1 as a label only:

- the same 70/30 contribution as a standard member;
- no extra initial `Capital Participation`;
- no lock-up enforcement;
- no conversion at month 60.

`joined_at` starts the vesting clock. `lib/sequoia/vesting.ak` exists and is
tested, but no M1 action consumes it. Extra capital, lock-up, and conversion
wait for counsel and M4.

### 9. M2 handoff

M1 has no config update path. M2 adds a config validator whose spend handler
requires the governance vote (two-thirds of votes cast, 50% quorum, 7-day
timelock) and then deploys a fresh preprod genesis with the new config script.
M1 is not upgraded in place. Before mainnet, M1–M4 deploy together, so no
production migration from M1 is owed.

### 10. Changes from plan §6.3

- Three token policies collapse into `membership_policy`.
- `MemberDatum` loses `member_capital`, `capital_participation`,
  `kyc_credential`, `kyc_expiry`, `founder_lock_until`, and `release_schedule`.
- `MemberDatum` keeps `last_voted_proposal` as a reserved M2 field.
- `ConfigDatum` keeps the board keys and threshold, adds `network`, and adds the
  three script policy IDs. The state NFT policy is the script parameter; the
  `STATE` asset name is a constant.
- `BankProofDatum` and the `BANK` asset name are added.
- `KycDatum.issuer` and `BankProofDatum.issuer` are snapshotted for audit; the
  config remains the authority.
- `MemberStatus` is fixed as `Active | Inactive | PendingExit | Exited` so M4
  does not change the datum shape.

### 11. Verification

- Aiken unit and property tests: split math and rounding, vesting schedule,
  token conservation, non-transferability, board threshold, bank proof replay,
  KYC expiry and revocation.
- Lucid emulator: genesis → issue KYC → issue bank proof → join (standard and
  founder) → contribute. Failure cases: non-board signer, expired KYC, revoked
  KYC, wrong year, wrong amount, spent proof, second contribution in the same
  year, and an attempt to send member tokens to a wallet.
- CI: `aiken fmt --check`, `aiken check`, `aiken build`, `bun run check`.
- `contracts/plutus.json` is committed and is the only interface the Lucid
  builders read.

### 12. Out of scope

Voting and tally (M2); projects and treasury (M3); distribution, exit, claims,
and burns (M4); founder extra capital, lock-up, and conversion; API, Postgres,
indexer, and frontend changes; preprod deployment; real KYC or bank providers;
real IDR.

## Consequences

- The member datum is thin. Balances and KYC each have one owner, so there are
  fewer duplicated invariants to check.
- One policy and one membership script handle spend and mint. The script is
  larger than a single-purpose policy, but the authority lives in one place.
- Gated actions read two reference inputs, config and KYC. That is the cost of
  not duplicating state.
- A member has exactly one box. Contribution history lives in ledger
  transactions and the indexer, not in extra boxes.
- The bank proof's authenticity rests on the `BANK` burn rule and the treasurer
  key. Duplicate bank references are caught off-chain by the treasurer and
  auditor, not on-chain.
- M1 config is disposable. M2 starts a fresh preprod genesis. That is acceptable
  only because M1 uses test wallets and no real IDR.
- The founder class is a label pending counsel. If counsel rejects it, only
  preprod data is affected.

## Toolchain answers (2026-11-07)

- Aiken is pinned to `v1.1.24`, with `plutus = "v3"` and
  `aiken-lang/stdlib v4.0.0`.
- The Lucid Evolution emulator supports CIP-31 reference inputs and CIP-33
  reference scripts under Plutus V3. Evidence and caveats are in
  `contracts/README.md` and `packages/offchain/test/emulator-probe.test.ts`.
  The Scalus JS emulator is the fallback if a ledger-rule discrepancy appears.

## Open questions

- Map provider KYC levels to the M1 integer in the identity context. The datum
  stores only the number.
- Legal: founder class permissibility, whether board members must be members,
  KSP/USP licence, token characterization.

## References

- Plan §3.2, §3.4, §3.9, §5.1, §6.3, §6.5, §6.6
- ADR 0003 (split is a governance parameter)
- ADR 0004 (the chain is the ledger, and contracts come first)
- ADR 0007 (no PII on chain)
- `docs/research/aiken-project-structure.md`
- `GLOSSARY.md`
