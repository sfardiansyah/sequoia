# Sequoia contracts

Aiken project for the Sequoia co-op validators. M1 (`config` + `membership`) is
specified by `docs/adr/0008-m1-config-and-membership.md`.

## Toolchain

- Aiken `v1.1.24`, pinned as `compiler` in `aiken.toml`.
- `plutus = "v3"`.
- `aiken-lang/stdlib v4.0.0`, pinned in `aiken.lock`.

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

Parameters are applied at transaction-build time with Lucid's
`applyParamsToScript`, not with `aiken blueprint apply`. The state NFT policy
takes the seed `OutputReference`, which only exists at build time, and the other
scripts take the state NFT policy ID, which is derived from it.

## Layout

- `validators/` — one file per validator, entry point only.
- `lib/sequoia/` — shared logic; added by ticket #20.
- `*.test.ak` — unit and property tests, colocated with the code.

`validators/probe.ak` is a toolchain probe. Ticket #21 removes it when the
`config` validator lands.

## Emulator support (answered 2026-11-07)

ADR 0008 asked whether Lucid Evolution's emulator supports CIP-31 reference
inputs and CIP-33 reference scripts with Plutus V3.

**Yes, both**, verified by `packages/offchain/test/emulator-probe.test.ts`:

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
