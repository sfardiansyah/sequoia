# 10: Docs and legal alignment

**What to build:** The docs describe the pilot that actually exists, and the legal review no longer understates the code.

- Update the plan’s public on-chain KYC, balance, and vote sections to ADR 0007’s no-PII-on-chain and secret-ballot decisions.
- Correct “possibly legal entities” and “foreign members” to the full/associate model from the legal research.
- Update the legal review’s P14: contribution recording is now gated; voting and exit are still pending.
- Add the contribution tables to the legal review’s privacy scope.
- Update README status, test count, and pilot boundary.
- Leave counsel-dependent founder, surplus, token, KSP, and foreign-rights questions open.

**Blocked by:** 01 (ADRs), 03 (KYC privacy), 04 (member type), 05 (year), 06 (bank), 07 (contribution), 08 (profile), 09 (end-to-end).

**Status:** ready-for-agent

- [ ] The plan no longer describes public on-chain PII or public-by-default votes as the target design.
- [ ] The plan and legal review agree on full vs associate membership.
- [ ] The legal review names contribution data in its scope and updates P14.
- [ ] README/plan status and test count match the implemented code.
- [ ] No unresolved counsel question is encoded as a fixed rule.
