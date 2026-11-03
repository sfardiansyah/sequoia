# 03: KYC privacy minimum

**What to build:** KYC records no longer depend on free-text sensitive reasons or expose evidence pointers in admin output.

- Replace free-text revocation with a structured reason code: `SANCTIONS`, `PEP`, `DOCUMENT_MISMATCH`, `OTHER`.
- Remove `evidence_ref` from `kyc list` human and JSON output; keep it as an internal pointer only.
- Add an optional `retain_until` field to KYC rows; no deletion job in the pilot.
- Keep the existing expiry, supersede, revoke, and current-KYC behaviour.

**Blocked by:** 02 (audit foundation).

**Status:** ready-for-agent

- [ ] Revoking KYC requires a known reason code, not free text.
- [ ] `kyc list` and its JSON output contain no `evidence_ref`.
- [ ] KYC rows can carry `retain_until` without changing current eligibility.
- [ ] Existing KYC status, supersede, renewal, and expiry tests still pass.
