# Sequoia on Cardano

Member-owned Indonesian co-op with member-only IDR deposit receipts, at-risk
project capital, one member one vote, founder vesting, on-chain governance, and
bank IDR custody.

Architecture: modular monolith + DDD + hexagonal ports/adapters.

## Status

Milestone 10: Auth stabilization.

Implemented:

- IDR amount and basis-point value objects;
- standard 70/30 and founder 20/80 contribution splits;
- founder vesting: 50% at year 4 and 50% at year 5;
- Elysia API; membership domain, Postgres repository, migrations, citty CLI, CIP-30 auth with durable nonces, JWT claims, rate limiting, and `/members/me`.

Not built yet: database, Aiken contracts, KYC/bank adapters, web app.

## Commands

```sh
bun install
bun run check
bun run dev:api
bun run sequoia migrate
bun run sequoia member admit --owner-pkh ... --kyc-commitment ...
```

`GET /health` returns the service name and version.

## Layout

```text
packages/shared/    domain primitives
apps/               API, web, indexer, issuer (later)
contracts/          Aiken validators (later)
docs/adr/           architecture decisions
```

## Architecture

```text
domain <- application <- adapters
```

The domain must not import Elysia, Drizzle, Lucid, Bun APIs, `process.env`, or
HTTP types. Concrete adapters are wired only in the composition root.

Full plan: `/home/raynord/.opencode/plan/sequoia-plan.md`
