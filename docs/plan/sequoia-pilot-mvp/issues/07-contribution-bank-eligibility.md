# 07: Contribution requires bank attestation and eligibility

**What to build:** A contribution snapshot is recorded only when the member is eligible and the money has a matching bank attestation.

- Add a required `bank_attestation_id` to contributions; one attestation can fund one contribution.
- Add `source` with `PILOT` and a nullable `chain_tx` for future projection provenance.
- Require active `FULL` membership, board approval, current KYC, and a matching bank attestation.
- Validate that attestation member, year, and amount match the contribution.
- Record an audit event for the contribution.
- Keep the existing contribution-year snapshot fields and bigint unit amounts.

**Blocked by:** 04 (member type), 05 (year), 06 (bank attestation).

**Status:** ready-for-agent

- [ ] A contribution without a bank attestation fails.
- [ ] A contribution whose bank attestation does not match member, year, or amount fails.
- [ ] An inactive, non-full, unapproved, or KYC-invalid member cannot contribute.
- [ ] A valid contribution stores the attestation id, `source = PILOT`, and the year snapshot.
- [ ] A second contribution for the same member and year fails.
- [ ] The contribution command writes an audit row.
