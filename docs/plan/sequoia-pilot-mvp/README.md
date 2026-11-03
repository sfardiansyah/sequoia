# Sequoia pilot MVP handoff

This directory contains the spec and tickets for the next session.

## Read first

1. `spec.md` — the pilot boundary, user stories, decisions, and out-of-scope list.
2. `issues/` — ten tickets, blockers first. Start with tickets 01 and 02; tickets 03, 04, and 05 become available after 02.

## Assumptions

- Preprod synthetic pilot, not a real-money pilot.
- Real KYC provider, real bank, chain, distributions, exits, founder extra capital, and governance votes are out of scope.
- The pilot admits only full standard members.
- The plan defaults are fixed: 70/30 split and 5000 bps Capital Participation cap.
- Off-chain records are provisional; they are not the co-op ledger.

If any assumption changes, update `spec.md` before starting.

## Current milestone context

Milestone 17 is complete: pilot boundary ADRs and the audit foundation. This pilot track is a bounded exception to ADR 0004's contracts-first product order — see ADR 0004's pilot-exception section. After the pilot, return to the product plan: Aiken config/membership first, then governance, treasury, distribution, and exit.

## Implementation order

Frontier: 03 and 11.
Then: 04.
Then: 05.
Then: 06.
Then: 07.
Then: 08.
Then: 09.
Finally: 10.

Ticket 11 is unblocked by 02 and blocks 04: it makes the audit row and the mutation commit together. Keep it before the first ticket that adds another audited write.

## Publishing note

These are in-repo draft artifacts, not GitHub issues. To publish them to `sfardiansyah/sequoia`, use the issue-tracker workflow from this directory.
