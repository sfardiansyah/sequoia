# Sequoia on Cardano

Member-owned Indonesian co-op with Member Capital equity, at-risk
`Capital Participation`, one member one vote, founder vesting, on-chain governance, and
bank IDR custody.

Architecture: modular monolith + DDD + hexagonal ports/adapters.

## Status

Milestone 15: Capital primitives.

Implemented:

- IDR amount and basis-point value objects;
- parameterized contribution split primitive, defaulting to 70/30 for every
  member; contribution persistence and the applied-bps snapshot arrive with the
  capital context;
- founder vesting: 50% at year 4 and 50% at year 5;
- Elysia API; membership domain, Postgres repository, migrations, citty CLI, CIP-30 auth with durable nonces, EdDSA JWT claims with `kid`, public JWKS, package-based auth rate limiting, and `/members/me`;
- identity context with manual KYC attestations: issuers, expiry, revocation, renewal, and an admission gate that requires a valid attestation;
- Docker Compose stack and integration tests against real PostgreSQL.

Not built yet: Aiken contracts, provisioned KYC provider/bank adapters, the capital
context beyond the shared primitives, the governance context, web app.

## Commands

```sh
bun install
bun run check
bun run test:integration             # requires TEST_DATABASE_URL
bun run dev:api
bun run sequoia migrate
bun run sequoia kyc issue --owner-pkh ... --evidence-ref s3://bucket/member-1/
bun run sequoia kyc revoke <attestation-id> --reason "..."
bun run sequoia kyc list --expiring-within 30
bun run sequoia kyc list --status REVOKED
bun run sequoia member admit --owner-pkh ... --attestation <attestation-id>
```

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
contracts/          Aiken validators (later)
docs/adr/           architecture decisions
```

## Architecture

```text
domain <- application <- adapters
```

The domain must not import Elysia, Drizzle, Lucid, Bun APIs, `process.env`, or
HTTP types. Concrete adapters are wired only in the composition root.

Full plan: [docs/plan/sequoia-plan.md](docs/plan/sequoia-plan.md).
