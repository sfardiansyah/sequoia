# ADR 0001: Modular monolith with DDD and hexagonal architecture

## Status

Accepted for the MVP.

## Context

The domain includes membership, capital accounts, founder vesting, governance,
project budgets, distributions, exits, bank attestations, and KYC. These rules
change independently of Cardano, the bank, and the web UI. A single deployable
is enough for the expected scale.

## Decision

Use a modular monolith:

- one Elysia API deployment and one PostgreSQL database;
- bounded contexts: identity, membership, capital, governance, projects,
  distributions, exits, banking;
- domain and application layers independent of infrastructure;
- inbound/outbound adapters around the domain;
- a composition root for dependency wiring.

```text
domain <- application <- adapters
composition -> everything
```

## Consequences

- Domain tests run without a database, chain, or HTTP server.
- Cardano, KYC, and bank integrations are replaceable adapters.
- The chain remains the source of truth for on-chain state; PostgreSQL is a
  projection plus off-chain data.
- Contexts communicate through use cases or domain events, not direct entity
  imports.
- A context can become a service later if scale or team ownership requires it.
