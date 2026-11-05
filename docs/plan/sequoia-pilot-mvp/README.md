# Sequoia pilot harness MVP

**Spec:** `spec.md`. Read it first.
**Tickets:** GitHub Issues on `sfardiansyah/sequoia`. The tracker is the single
source of truth; this directory keeps no ticket copies.

## Boundary

Preprod and synthetic: no real IDR, no real personal data, no chain. The rows the
harness writes are provisional, not the co-op ledger — see ADR 0004's
pilot-exception section and ADR 0007.

## Milestones

- **M17: Pilot boundary + audit** — shipped tickets 01 and 02 (closed).
- **M18: Audit transaction scope** — shipped ticket 11 (closed).
- **Pilot harness MVP** — tickets 03–10, the remaining pilot work.

## Finding the frontier

```sh
gh issue list --state open --json number,title,blockedBy \
  --jq '.[] | select([.blockedBy.nodes[] | select(.state == "OPEN")] | length == 0) | "#\(.number) \(.title)"'
```

A ticket is ready when every blocker is closed. Dependencies are GitHub's native
blocked-by edges; the `**Blocked by:**` line in a body is a human-readable mirror
of them. Do not add a dependency only to the body.

## Assumptions

- Preprod synthetic pilot, not a real-money pilot.
- Real KYC provider, real bank, chain, distributions, exits, founder extra
  capital, and governance votes are out of scope.
- The pilot admits only standard members.
- The plan defaults are fixed: 70/30 split and 5000 bps Capital Participation cap.
- Off-chain records are provisional; they are not the co-op ledger.

If any assumption changes, update `spec.md` before starting.
