# 01: Pilot boundary and privacy ADRs

**What to build:** Write the pilot boundary and privacy decisions before code, so the next session does not build the real product against a synthetic pilot.

- Add ADR 0007: no directly identifying personal data on chain; keyed commitments; secret ballot; aggregate dashboard; ADR 0004 transition note for the pilot exception.
- Mark the pilot as provisional in the plan: off-chain records are not the co-op ledger; contracts remain the next real-product milestone.
- State explicitly that the pilot uses synthetic KYC evidence and mock bank references.

**Blocked by:** None (can start immediately).

**Status:** done (milestone 17)

- [x] ADR 0007 exists and is referenced from ADR 0004.
- [x] ADR 0004 explains why the pilot is off-chain and how the product returns to contracts-first.
- [x] The plan has one clear “pilot harness” boundary and does not present pilot records as authoritative.
- [x] No runtime code changes in this ticket.
