# Sequoia pilot harness MVP

**Status:** Draft for handoff  
**Scope:** Preprod synthetic pilot, not the co-op ledger  
**Current repo state:** Milestone 18 (audit transaction scope), `bun run check` clean  
**Source:** Analysis of code vs `docs/plan/sequoia-plan.md`, ADRs 0001–0006, `GLOSSARY.md`, and `docs/legal/*`

## Problem Statement

The code can record KYC attestations, admit members, configure a contribution year, and store contribution snapshots. It does not yet record the board decision behind admission, prove that a contribution was paid, or provide the privacy/audit controls the legal review requires. The current contribution config can also bypass the plan’s governance and cap rules.

A real-money pilot would be blocked by the legal review, the missing chain contracts, and the unresolved founder/surplus/token questions. A synthetic preprod pilot can still prove the member and contribution workflow safely.

## Solution

Build a bounded **synthetic pilot harness**:

- manual KYC with structured revocation and redacted evidence;
- board-approved admission;
- a contribution year with an approval reference, fixed 70/30 split, and hard 5000 bps cap;
- a mock bank attestation required before a contribution is recorded;
- contribution snapshots marked as provisional pilot records;
- an audit log for every admin action;
- `/members/me` showing the member’s contribution summary.

No chain, real money, real KYC provider, distribution, exit, founder extra capital, or governance vote is included.

## User Stories

1. As a board operator, I want to issue a manual KYC attestation for a test member, so that admission can be gated on a recorded verification.
2. As a board operator, I want to revoke KYC with a structured reason code, so that sensitive free text is not stored.
3. As a board operator, I want the KYC list to omit evidence references, so PII is not printed by the admin CLI.
4. As a board operator, I want to record a board approval reference when admitting a member, so the admission reflects a board decision.
5. As a board operator, I want the pilot to admit only standard members, so founder rights stay out of the pilot.
6. As a board operator, I want to configure a contribution year with an approval reference and the fixed 70/30 split, so the plan defaults are enforced.
7. As a board operator, I want the year setup to reject a Capital Participation share above 50%, so the governance cap cannot be bypassed.
8. As a treasurer, I want to create a mock bank attestation with a unique reference, so a contribution has payment evidence.
9. As a treasurer, I want to record a contribution only when it matches a bank attestation, so no unpaid contribution is recorded.
10. As a treasurer, I want a contribution to identify the bank attestation it used, so I can reconcile it later.
11. As a member, I want my profile to show my contribution for the year, so I can verify my capital position.
12. As an auditor, I want every admin action to record an actor, action, entity, and timestamp, so the pilot has an audit trail.
13. As an auditor, I want contribution rows marked as pilot records, so they are not mistaken for the chain ledger.
14. As a maintainer, I want the pilot boundary written down in ADRs, so the next session does not build the wrong architecture.
15. As a maintainer, I want one end-to-end pilot test, so the handoff can be verified with one command.
16. As counsel, I want unresolved legal choices kept out of fixed code, so the pilot does not decide the founder, surplus, token, KSP, or foreign-member questions.
17. As a member, I want only my own profile exposed through the API, so the pilot does not publish balances or votes.

## Implementation Decisions

- **Pilot boundary:** preprod only; synthetic KYC evidence and mock bank references. No real IDR or real personal data.
- **Provisional projection:** `contributions` is a pilot projection. Add a `source` marker with `PILOT`; reserve `chain_tx` for the future indexer. Do not treat the table as authoritative.
- **Member model:** add a required board approval reference and approval timestamp. The pilot admits `STANDARD` members only. Founder onboarding is out of scope; associate membership is not offered.
- **Admission:** board approval reference is required and recorded. KYC validity is still required.
- **Contribution year:** one row per year; required approval reference; fixed `7000/3000` split; hard cap `5000` bps. No CLI override of split or cap in the pilot.
- **Bank attestation:** minimal `bank_attestations` record with member, year, amount, unique bank reference, actor, and timestamp. A contribution must reference exactly one unused attestation that matches member, year, and amount.
- **Contribution eligibility:** active member, board approval present, current KYC valid, matching bank attestation. Existing KYC gate stays.
- **Audit:** append-only `audit_events` with actor, action, entity type/id, timestamp. Write commands require `SEQUOIA_OPERATOR`; no anonymous admin writes.
- **KYC privacy:** replace free-text revocation with a reason code; do not return evidence refs in list output. Evidence refs remain an internal pointer, not a proof.
- **Profile:** `/members/me` returns the member plus contribution summaries; no public dashboard.
- **Docs:** add ADR 0007 for no-PII-on-chain, keyed commitments, secret ballot, aggregate dashboard. Add an ADR 0004 transition note for the pilot exception. Update the plan and legal review after implementation.

## Testing Decisions

- Test external behaviour: commands, API responses, and database constraints. Do not assert private helper structure.
- Domain tests for approval references, fixed split, cap, bank-attestation matching, eligibility, and audit actor.
- Repository contract tests for every new table in memory and PGlite/Postgres.
- API tests through `app.handle` for `/members/me` contribution summaries.
- One end-to-end pilot test: issue KYC → admit with board approval → configure year → create mock bank attestation → record contribution → read `/members/me`.
- Existing seams: in-memory repositories, PGlite migrations, `app.handle`, and the Postgres integration suite.

## Out of Scope

- Aiken contracts, Lucid, indexer, chain data.
- On-chain KYC, balances, votes, or IPFS metadata.
- Real KYC provider, real bank integration, real IDR.
- Surplus, endowment, education fund, distributions.
- Exit, redemption reserve, book value, claims.
- Founder extra `modal penyertaan`, founder vesting, conversion.
- Associate membership under Pasal 18(2); PT and foreign members.
- Governance proposals, member votes, timelock.
- Frontend.
- Mainnet readiness.
- Real-data retention/erasure jobs; the pilot marks the fields but does not operate a PDP program.

## Further Notes

### Milestone position

- Milestone 18 is complete: audit and domain writes share one transaction.
- This pilot track is a bounded exception, not the next product milestone.
- After the pilot, return to the product plan. ADR 0004 still says contracts come first for the real product; this pilot must not become the authoritative ledger.
- The next product milestone remains Aiken config/membership (M1), then governance, treasury, distribution, and exit.

### Open decisions kept out of code

- Real-member pilot vs synthetic-only.
- Founder extra `modal penyertaan`, vesting, and conversion.
- 25% capital share and zero-patronage distribution.
- Token characterization and offering rules.
- KSP/USP licence question.
- Retention periods for real data.

### Assumptions for this spec

This spec assumes the MVP recommendation: synthetic preprod pilot, off-chain provisional records, standard members only. If a real-member pilot is chosen instead, the privacy and legal tickets become blockers and the scope must expand before implementation.
