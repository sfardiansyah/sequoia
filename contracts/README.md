# Sequoia contracts

Aiken project for the Sequoia co-op validators. M1 (`config` + `membership`) is
specified by `docs/adr/0008-m1-config-and-membership.md`.

## Toolchain

- Aiken `v1.1.24`, pinned as `compiler` in `aiken.toml`.
- `plutus = "v3"`.
- `aiken-lang/stdlib v4.0.0`, pinned in `aiken.lock`.
- `aiken-lang/fuzz v3` for property tests.

Install Aiken from the release page or with the installer, and put the binary on
`PATH`:

```sh
curl -sSfL https://install.aiken-lang.org | bash
```

## Commands

```sh
aiken fmt --check
aiken check
aiken build
```

From the repository root, `bun run check:contracts` runs all three and fails if
`plutus.json` changed without being committed. `plutus.json` is committed because
it is the only interface the off-chain builders read; `build/` is generated and
ignored.

The shared test vectors live at `packages/shared/vectors/aiken.json`. They are
the source of truth for the split and vesting math: the TS test in
`packages/shared/src/vectors.test.ts` and the Aiken tests both read them.
`bun run gen:vectors` regenerates `lib/sequoia/vectors.ak` from the JSON and
formats it; `bun run check:vectors` regenerates and fails if the committed file
drifts. CI runs the latter.

Parameters are applied at transaction-build time with Lucid's
`applyParamsToScript`, not with `aiken blueprint apply`. The state NFT policy
takes the seed `OutputReference`, which only exists at build time, and the other
scripts take the state NFT policy ID, which is derived from it.

## Layout

- `validators/` — one file per validator, entry point only.
- `validators/state_nft.ak` — one-shot `STATE` mint, parameterized by the seed output.
- `validators/config.ak` — the config box; M1 has no spend path.
- `validators/kyc_attestation.ak` — KYC NFT mint and the KYC box spend.
- `lib/sequoia/types.ak` — the ADR 0008 datums and enums.
- `lib/sequoia/config_ref.ak` — finds the config box among reference inputs.
- `lib/sequoia/kyc_rules.ak` — issue, renew, and revoke checks.
- `lib/sequoia/split.ak` — the contribution split, mirroring `@sequoia/shared`.
- `lib/sequoia/vesting.ak` — the founder vesting schedule.
- `lib/sequoia/vectors.ak` — generated from the shared JSON; do not edit.
- `*.test.ak` — unit and property tests, colocated with the code.

## KYC actions

The KYC policy and the KYC box's spending validator are one script. `Issue` is a
mint action, `Revoke` spends and burns, and `Renew` is **spend-only**: the
`member_id` token moves to a replacement box at the same script, so the mint
field stays empty and the spend handler validates the replacement (ADR 0008 §5).
A builder that tries to express renewal as a burn plus a mint nets to zero and
still never invokes the mint handler.

Every KYC transaction reads the config as a reference input. `txInfoSignatories`
is the transaction's required-signer list, so a builder must add the issuer's
address explicitly; paying the fee is not enough. `issued_at` equals the
transaction's validity lower bound as seen on-chain, which is the start of the
slot enclosing the `validFrom` time, not the wall-clock value.

## Emulator support (answered 2026-11-07)

ADR 0008 asked whether Lucid Evolution's emulator supports CIP-31 reference
inputs and CIP-33 reference scripts with Plutus V3.

**Yes, both**, as verified by an emulator probe before ticket #21 removed it
with `validators/probe.ak` (the test is in git history):

- the applied script hash matches the blueprint hash;
- a Plutus V3 spend succeeds when it reads a reference input;
- the same script runs from a reference-script UTxO with no inline script;
- the same spend fails when no reference input is supplied.

Caveat: Lucid documents its emulator as simplified validation. The probe covers
the features M1 relies on. If a ledger-rule discrepancy appears, the fallback is
the Scalus JS emulator, which runs the real ledger rules and publishes a Lucid
provider adapter. Yaci DevKit stays the last resort.

The emulator exposes submitted outputs only after a block is produced, so the
tests call `emulator.awaitBlock(1)` after each submit.
