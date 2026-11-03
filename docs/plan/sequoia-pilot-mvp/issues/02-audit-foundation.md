# 02: Audit foundation and operator identity

**What to build:** Every admin action has a named actor and an append-only audit row.

- Add an `audit_events` table: actor, action, entity type, entity id, timestamp, and a non-PII detail string.
- Add an `AuditLog` port with Postgres and in-memory adapters.
- Require `SEQUOIA_OPERATOR` for CLI write commands; fail the command when it is missing.
- Record audit events for KYC issue and revoke. Later tickets add admission, year setup, bank attestation, and contribution events.

**Blocked by:** None (can start immediately).

**Status:** done (milestone 17)

- [x] `kyc issue` and `kyc revoke` write one audit row with actor and action.
- [x] A write command without an operator fails before changing data.
- [x] Audit rows never contain `evidence_ref`, free-text revocation reasons, or KYC identity details.
- [x] In-memory and Postgres audit repositories pass the same contract tests.

## Notes

- `sequoia audit list` was added so the trail is inspectable without a database client.
- The audit row and the mutation are not atomic yet; that is ticket 11.
