# Sequoia on Cardano

Member-owned Indonesian co-op with Member Capital equity, at-risk
`Capital Participation`, one member one vote, founder vesting, on-chain governance, and
bank IDR custody.

Architecture: modular monolith + DDD + hexagonal ports/adapters.

## Status

Pilot harness MVP (tickets 03–10). Next: **M1 — Aiken config and membership**
(ADR 0008, GitHub milestone `M1: Config + Membership`).

Implemented:

- append-only audit trail: `audit_events` with an UPDATE/DELETE trigger, an
  `AuditLog` port with in-memory and Postgres adapters, `SEQUOIA_OPERATOR`
  recorded on every KYC write, and `sequoia audit list`;
- IDR amount and basis-point value objects;
- parameterized contribution split primitive, defaulting to 70/30 for every
  member;
- contribution years and snapshots: fixed annual amount and split per year,
  active-member/current-KYC eligibility, applied split bps, resulting bigint
  unit amounts, a required unused bank attestation, a `PILOT` source marker,
  and a `CONTRIBUTION_RECORDED` audit row committed with the snapshot,
  Postgres/PGlite repositories, and `sequoia contribution` CLI commands;
- mock bank attestations: one row per unique bank reference for a member and
  configured year, amount matched to the year's fixed annual amount, actor and
  timestamp recorded, and a `BANK_ATTESTATION_CREATED` audit row written in the
  same transaction;
- founder vesting: 50% at year 4 and 50% at year 5;
- Elysia API; membership domain, Postgres repository, migrations, citty CLI, CIP-30 auth with durable nonces, EdDSA JWT claims with `kid`, public JWKS, package-based auth rate limiting, and `/members/me` with the member's KYC block and contribution summary;
- identity context with manual KYC attestations: issuers, expiry, structured
  revocation reason codes, an optional `retain_until` marker, renewal, and an
  admission gate that requires a valid attestation and a board approval
  reference (standard members only). Evidence pointers stay database-only and
  never appear in CLI or API output;
- one end-to-end pilot flow on PGlite and Postgres: KYC issue → board-approved
  admission → contribution year → mock bank attestation → contribution →
  `/members/me`;
- Docker Compose stack and integration tests against real PostgreSQL.

Test suite: 233 unit tests (`bun run check`, PGlite included) and 43 Postgres
integration tests (`bun run test:integration`).

The pilot is synthetic and preprod: no real IDR, no chain, and no real personal
data. Its rows are provisional, not the co-op ledger. See
`docs/plan/sequoia-pilot-mvp/`, ADR 0004's pilot-exception section, and ADR 0007.

Not built yet: Aiken contracts (next, M1), provisioned KYC provider/bank
adapters, the full capital context beyond contribution years, snapshots, and
bank attestations, distributions, exits, the governance context, and the web
app.

## Commands

```sh
bun install
bun run check
bun run test:integration             # requires TEST_DATABASE_URL
bun run dev:api
bun run sequoia migrate
SEQUOIA_OPERATOR=ray bun run sequoia kyc issue --owner-pkh ... --evidence-ref s3://bucket/member-1/
SEQUOIA_OPERATOR=ray bun run sequoia kyc revoke <attestation-id> --reason-code SANCTIONS
bun run sequoia kyc list --expiring-within 30
bun run sequoia kyc list --status REVOKED
bun run sequoia audit list --actor ray --limit 20
SEQUOIA_OPERATOR=ray bun run sequoia member admit --owner-pkh ... --attestation <attestation-id> --approval-ref BOARD-2026-004
SEQUOIA_OPERATOR=ray bun run sequoia contribution year set --contribution-year 2026 --annual-amount 1000000 --approval-ref BOARD-2026-001
SEQUOIA_OPERATOR=ray bun run sequoia contribution record --member-id <member-id> --contribution-year 2026 --bank-attestation <attestation-id>
SEQUOIA_OPERATOR=ray bun run sequoia contribution attest --member-id <member-id> --contribution-year 2026 --amount 1000000 --bank-ref BANK-REF-001
```

KYC, admission, `contribution year set`, `contribution attest`, and
`contribution record` refuse to run without `SEQUOIA_OPERATOR`, a lower-case slug
naming the operator (`ray`, `board-ops`). Admission and `contribution year set`
also require a board approval reference.

`GET /health` returns the service name and version. `GET /.well-known/jwks.json`
publishes the JWT verification keys.

## Local stack

```sh
cp .env.example .env
# Add JWT_PRIVATE_KEYS to .env using the command below.
docker compose up --build
```

This starts PostgreSQL 18, Redis 7, a one-shot migration service, and the API
with healthchecks. Redis is available but not yet wired into the API.
Use `docker compose down -v` to reset local data.

PostgreSQL 18 changed its data volume path. If you previously ran this stack
with PostgreSQL 17, remove the old volume once before starting v18:

```sh
docker compose down -v
```

Run the integration tests against PostgreSQL:

```sh
docker compose --profile test run --rm test
```

Or against any PostgreSQL database you control:

```sh
TEST_DATABASE_URL=postgres://sequoia:sequoia@localhost:5432/sequoia_test bun run test:integration
```

The target database must already exist. The Compose test service creates
`sequoia_test` automatically on a fresh volume.

## Auth configuration

The API needs `DATABASE_URL` and `JWT_PRIVATE_KEYS`. Generate an Ed25519 key and
base64-encode its PKCS#8 PEM:

```sh
openssl genpkey -algorithm ed25519 -out jwt.pem
base64 -w0 jwt.pem    # JWT_PRIVATE_KEYS=<output>
```

`JWT_PRIVATE_KEYS` accepts comma-separated keys. The last key signs; all keys
verify and appear in the JWKS, so append a new key before retiring an old one.
Keep the old key for at least the 1-hour access-token lifetime. Signing keys are
separate from Cardano wallet keys; production keys belong in a secret manager.

## Layout

```text
packages/shared/    domain primitives
apps/               API, web, indexer, issuer (later)
contracts/          Aiken validators (M1, ADR 0008)
docs/adr/           architecture decisions
```

## Architecture

```text
domain <- application <- adapters
```

The domain must not import Elysia, Drizzle, Lucid, Bun APIs, `process.env`, or
HTTP types. Concrete adapters are wired only in the composition root.

Full plan: [docs/plan/sequoia-plan.md](docs/plan/sequoia-plan.md).
