# 05: Contribution-year approval and hard cap

**What to build:** A contribution year is configured only from the plan defaults, with a recorded approval reference and an unchangeable 50% cap.

- Add `approval_ref` to `contribution_years`.
- Require the approval reference in the CLI and domain.
- Fix the pilot split to `7000/3000`; remove the CLI split and cap overrides.
- Enforce a hard `5000` bps Capital Participation cap in the domain and database.
- Record an audit event for year configuration.

**Blocked by:** 02 (audit foundation).

**Status:** ready-for-agent

- [ ] A year cannot be configured without an approval reference.
- [ ] A split other than `7000/3000` is rejected in the pilot.
- [ ] A Capital Participation share above `5000` bps is rejected in the domain and by PostgreSQL.
- [ ] A valid year can be configured once and cannot be silently overwritten.
- [ ] Year configuration writes an audit row.
