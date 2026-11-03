# 09: End-to-end pilot flow

**What to build:** One verifiable pilot flow from KYC to contribution read.

- Issue a synthetic KYC attestation.
- Admit a full standard member with a board approval reference.
- Configure one contribution year with an approval reference.
- Create a mock bank attestation for that member and year.
- Record the contribution.
- Read `/members/me` and see the contribution summary.
- Run against the repository’s PGlite/Postgres test seam, not mocks of the whole flow.

**Blocked by:** 07 (contribution gate), 08 (profile summary).

**Status:** ready-for-agent

- [ ] One test or script runs the complete KYC → admission → year → bank attestation → contribution → profile flow.
- [ ] The flow fails if any required approval, KYC, member type, or bank attestation is missing.
- [ ] The final profile shows the contribution amounts as strings.
- [ ] The same flow works on the Postgres integration path.
