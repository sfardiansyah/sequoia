# Aiken project structure in public repositories

**Status:** Research note for M1 (`config` + `membership`)  
**Date:** 2026-11-06  
**Question:** How do public Aiken projects lay out validators, shared code, tests, and the off-chain boundary, and what layout should Sequoia use for `contracts/`?

This note records what the official Aiken documentation and a sample of public
repositories actually do. It is input to the M1 datum ADR and the toolchain
ticket; it is not itself a decision.

## Method

- Read the official Aiken documentation for project scaffolding, tests, modules,
  environments, and configurations.
- Inspected the repository trees and `aiken.toml` files of published Aiken
  projects, preferring ones with multiple validators and a committed blueprint.
- Checked the off-chain integration pattern in two TypeScript projects that
  consume an Aiken blueprint.

GitHub's `--language=Aiken` search is incomplete because many projects do not
tag the language, so the sample is deliberately curated rather than ranked.

## Official structure

`aiken new foo/bar` scaffolds a project as:

```
.
├── README.md
├── aiken.toml
├── lib
│   └── bar
└── validators
```

The documentation splits source into **library code** (`lib/`) and
**application code** (`validators/`). `aiken build` compiles the project and
emits a Plutus blueprint at `plutus.json`; `aiken check` type-checks and runs
`test` blocks. The `aiken blueprint` command group generates addresses, applies
parameters, and converts the blueprint.

Tests are first-class: a `test` block lives anywhere in a module, takes no
arguments, and passes when it returns `True`. Property tests take an argument
with a `via` fuzzer, usually from `aiken-lang/fuzz`. `aiken check` discovers and
runs both, and supports filtering with `-m`.

Two optional configuration mechanisms exist for values that vary by environment:

- `env/default.ak`, `env/preprod.ak`, … conditional modules imported as `env`
  (Aiken ≥ 1.1).
- `[config.default]`, `[config.preview]`, … values in `aiken.toml`, injected as
  a `config` module.

Aiken workspaces (`members = [...]` in `aiken.toml`) are documented as "early
development"; they do not support local path dependencies, and each sub-project
fetches its own `build/` folder.

Sources: [Getting Started](https://aiken-lang.org/fundamentals/getting-started),
[Tests](https://aiken-lang.org/language-tour/tests),
[Modules](https://aiken-lang.org/language-tour/modules),
[Benchmarks](https://aiken-lang.org/language-tour/bench).

## Survey

| Repository | Kind | Layout | Tests | Blueprint |
|---|---|---|---|---|
| [`aiken-lang/stdlib`](https://github.com/aiken-lang/stdlib) | Library | `lib/aiken/**` | `*.test.ak` colocated | Not committed |
| [`Anastasia-Labs/aiken-design-patterns`](https://github.com/Anastasia-Labs/aiken-design-patterns) | Library + examples | `lib/aiken-design-patterns/**`, `validators/examples/**` | `lib/tests/**` | Not committed |
| [`SundaeSwap-finance/aicone`](https://github.com/SundaeSwap-finance/aicone) | Library | `lib/sundae/**` | Colocated in `lib/` | Not committed |
| [`cardano-foundation/cip113-programmable-tokens`](https://github.com/cardano-foundation/cip113-programmable-tokens) | Application | `lib/*.ak`, `validators/*.ak`, `validators/programmable_logic/**` | `*.test.ak` colocated with both `lib/` and `validators/`; `benchmarks.ak` colocated | `plutus.json` committed |
| [`pragma-org/amaru-treasury`](https://github.com/pragma-org/amaru-treasury) | Application | `lib/*.ak`, `validators/permissions.ak`, `journal/` for build scripts | `*.test.ak` colocated in `lib/` | `plutus.json` committed |
| [`strike-finance/perpetuals-smart-contracts`](https://github.com/strike-finance/perpetuals-smart-contracts) | Application | `lib/` shared logic, `validators/*.ak` one file per validator | `validators/tests/` | `plutus.json` committed |
| [`githoney-io/githoney-smart-contract`](https://github.com/githoney-io/githoney-smart-contract) | Application + off-chain | Aiken project plus `offchain/src/{operations,scripts.ts,plutus.ts}` | — | `plutus.json` consumed by `offchain` |
| [`MeshJS/aiken-next-ts-template`](https://github.com/MeshJS/aiken-next-ts-template) | Template | `aiken/` plus `data/plutus.json` and a Next app | — | Copied into the app |

### `aiken.toml` in practice

- Applications pin the compiler: `compiler = "v1.1.23"` in CIP-113 and Amaru,
  `v1.1.4` in Strike.
- Plutus V3 is explicit where used: `plutus = "v3"` in CIP-113 and Amaru.
- Dependencies are pinned to tags or commit hashes in `[[dependencies]]`.
- Per-network constants go in `[config.default]` / `[config.preview]`
  (Amaru), not in code.
- Libraries often omit `compiler` and `plutus` (stdlib, aicone).
- The latest Aiken release at the time of writing is **v1.1.24** (2026-09-26).

## Conventions that hold across the sample

1. **`lib/` holds logic, `validators/` holds entry points.** Validator files are
   thin: parameter declarations plus checks, delegating to `lib/` helpers.
2. **One file per validator** in `validators/`, with a subdirectory only when a
   validator spans several modules (CIP-113's `validators/programmable_logic/`).
3. **Two accepted test placements:** colocated `*.test.ak` (stdlib, CIP-113) or
   a `tests/` folder (design-patterns, Strike). The official docs require neither.
4. **`aiken.lock` is committed.** All application repositories do this.
5. **`plutus.json` is committed for applications, not for libraries.** The
   blueprint is the interface to the off-chain builder.
6. **`build/` is generated and ignored.** One surveyed repository commits
   `build/packages/`; that is an anti-pattern, not a convention.
7. **Per-network values live in `[config.*]` or `env/`, not in validator code**
   (Amaru is the clearest example).
8. **Parameters are applied at deploy time**, not hardcoded: CIP-113's
   `issuance_mint` takes a minting-logic credential and a params policy as
   parameters, and the blueprint is produced with those applied.
9. **Reference inputs are normal** in current applications (CIP-113 reads
   protocol params from `self.reference_inputs`), so the pattern is established
   on Cardano even though emulator support still needs checking.
10. **Off-chain code is a sibling of the Aiken project**, not inside `lib/` or
    `validators/`: a generated `plutus.ts` plus one function per transaction
    operation.

## Recommended layout for Sequoia

One Aiken project at `contracts/`, outside the Bun workspace globs. This follows
the official scaffold and the CIP-113 application layout:

```
contracts/
├── README.md
├── aiken.toml          # name, compiler pinned, plutus = "v3", stdlib + fuzz
├── aiken.lock
├── .gitignore          # build/
├── lib/sequoia/
│   ├── types.ak        # datums and redeemers
│   ├── split.ak        # contribution split math, mirrors @sequoia/shared
│   ├── vesting.ak      # founder vesting, mirrors founder-vesting.ts
│   ├── membership.ak   # member record helpers
│   ├── tx.ak           # asset and UTxO helpers
│   └── *.test.ak
├── validators/
│   ├── config.ak
│   ├── membership.ak
│   ├── kyc_attestation.ak
│   ├── bank_attestation.ak
│   └── *.test.ak
└── plutus.json         # committed
```

Rationale:

- **One project, not a workspace.** Aiken workspaces are early and cannot
  reference local dependencies by path; a single project with `lib/` and
  `validators/` is the documented path.
- **Colocated `*.test.ak`.** The invariant sits next to the code and
  `aiken check` discovers it; this is the stdlib and CIP-113 pattern.
- **`plutus.json` committed.** The Lucid builders and the emulator harness read
  it; without it every off-chain consumer would need an Aiken toolchain.
- **`build/` ignored.** Generated artifacts are not source.
- **No `env/` in M1 unless a value truly varies per network.** Governance
  parameters belong in the config datum; only deploy-time parameters belong in
  `[config.*]` or `env/`.
- **`contracts/` stays out of `package.json` workspaces.** Aiken is not a Bun
  package; CI invokes `aiken` directly.

## Open questions for the toolchain ticket

- Pin Aiken v1.1.24, or the newest version Lucid Evolution supports? Check
  Lucid's stated compatibility before pinning.
- Does the Lucid emulator support CIP-31 reference inputs and CIP-33 reference
  scripts with Plutus V3? If not, M1's end-to-end proof needs Yaci DevKit, which
  is a larger ticket.
- `aiken blueprint apply` versus Lucid-side parameter application for the
  one-shot state NFT policy ID: pick one and document it before the deploy
  script exists.
- Do we want `aiken-lang/fuzz` in M1, or only unit tests plus the emulator?
  Property tests are cheap for the split math and conservation rules; add the
  dependency only when the first property is written.

## Sources

- [Aiken — Getting Started](https://aiken-lang.org/fundamentals/getting-started)
- [Aiken — Tests](https://aiken-lang.org/language-tour/tests)
- [Aiken — Modules](https://aiken-lang.org/language-tour/modules)
- [Aiken — Benchmarks](https://aiken-lang.org/language-tour/bench)
- [Aiken releases](https://github.com/aiken-lang/aiken/releases)
- [aiken-lang/stdlib](https://github.com/aiken-lang/stdlib)
- [Anastasia-Labs/aiken-design-patterns](https://github.com/Anastasia-Labs/aiken-design-patterns)
- [SundaeSwap-finance/aicone](https://github.com/SundaeSwap-finance/aicone)
- [cardano-foundation/cip113-programmable-tokens](https://github.com/cardano-foundation/cip113-programmable-tokens)
- [pragma-org/amaru-treasury](https://github.com/pragma-org/amaru-treasury)
- [strike-finance/perpetuals-smart-contracts](https://github.com/strike-finance/perpetuals-smart-contracts)
- [githoney-io/githoney-smart-contract](https://github.com/githoney-io/githoney-smart-contract)
- [MeshJS/aiken-next-ts-template](https://github.com/MeshJS/aiken-next-ts-template)
