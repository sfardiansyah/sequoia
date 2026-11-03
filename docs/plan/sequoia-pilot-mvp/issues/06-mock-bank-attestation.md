# 06: Mock bank attestation

**What to build:** A treasurer can create a mock bank attestation that proves a contribution amount and reference for one member and year.

- Add a `bank_attestations` table with member, contribution year, amount, unique bank reference, actor, and timestamp.
- Add a domain record and repository.
- Add a CLI command to create an attestation.
- Reject duplicate bank references and mismatched member/year data.
- Record an audit event for each attestation.

**Blocked by:** 04 (member type), 05 (configured year).

**Status:** ready-for-agent

- [ ] A bank attestation can be created for a full member and configured year.
- [ ] A duplicate bank reference is rejected.
- [ ] An attestation for an unknown member or unconfigured year is rejected.
- [ ] The attestation stores the actor and timestamp.
- [ ] The command writes an audit row.
