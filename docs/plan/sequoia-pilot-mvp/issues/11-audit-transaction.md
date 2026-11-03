# 11: Audit transaction scope

**What to build:** Make the audit row and the admin change commit together, so an audit write failure cannot leave an unaudited mutation and a mutation failure cannot leave an audit row.

- Add a transaction-scoped unit of work to the contexts that write domain data: identity, membership, capital.
- The unit of work owns the connection and hands repositories the transaction handle; repositories stop owning their connection for a write.
- `AuditLog.record` participates in the same transaction as the domain write.
- Issue KYC and revoke KYC keep their current `actor`/action contract; only the commit boundary changes.

**Blocked by:** 02 (audit foundation).

**Blocks:** 04 (board-approved admission).

**Status:** ready-for-agent

- [ ] A write command whose audit insert fails leaves no mutation behind.
- [ ] A write command whose mutation fails leaves no audit row.
- [ ] The in-memory unit of work has the same all-or-nothing behaviour as PostgreSQL.
- [ ] The identity, membership, and capital contract tests still pass.

## Out of scope

Rolling back across a chain transaction (plan §7.11 consistency); an outbox; retry policy for failed writes.
