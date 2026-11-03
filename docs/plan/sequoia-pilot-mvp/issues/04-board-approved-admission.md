# 04: Board-approved admission and member type

**What to build:** Admission records the board decision and distinguishes full from associate members.

- Add required `board_approval_ref` and `approved_at` to members.
- Add `member_type` with `FULL` and `ASSOCIATE`.
- Make `member admit` require `--approval-ref`; the pilot accepts only `FULL` `STANDARD` members.
- Reject `FOUNDER` and `ASSOCIATE` admission in the pilot until their rules are designed.
- Return the member type in `/members/me`.
- Record an audit event for admission.

**Blocked by:** 02 (audit foundation).

**Status:** ready-for-agent

- [ ] Admission without a board approval reference fails.
- [ ] A `FOUNDER` or `ASSOCIATE` cannot be admitted in the pilot.
- [ ] A full standard member can still be admitted with valid KYC.
- [ ] `/members/me` returns the member type.
- [ ] Admission writes an audit row with the approval reference.
