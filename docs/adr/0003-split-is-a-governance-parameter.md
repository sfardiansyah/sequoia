# ADR 0003: Contribution split is a governance parameter, not a constant

## Status

Accepted. Applies to every contribution record from the first capital milestone.

## Context

Plan §3.2 fixes the default split at 70/30 for standard members and 20/80 for
founders, but §3.9 requires a two-thirds member vote and a 7-day timelock to
change it, and §3.2 caps the standard project share at 50% "by governance".
§6.3 already carries `deposit_bps` and `project_bps` in `ConfigDatum`, so the
on-chain design treats the split as configuration.

The first capital primitives in `@sequoia/shared` read the opposite way:
`SPLITS` was a module constant and `splitContribution(amount, memberClass)`
looked the split up internally. That works until the first vote, and then it
does not work at all — a constant cannot be voted on, and every historical
contribution would silently reinterpret itself under the new split.

The alternative to passing parameters in is versioned constants with
effective-from dates. That is more machinery than the problem deserves: the
history only needs to be readable, not recomputable.

## Decision

- **The split is an input.** `splitContribution(amount, split)` receives the
  `ContributionSplitBps` to apply. It has no member class and no lookup.
- **Each contribution snapshots what it used.** The row stores the
  `depositBps`/`projectBps` actually applied, alongside the resulting deposit and
  project amounts. No versioning table, no effective-dating, no reinterpretation
  when a vote changes the split.
- **Defaults are defaults.** `DEFAULT_SPLITS` and `defaultSplitFor(memberClass)`
  stay in `@sequoia/shared` as the starting values a new year inherits.
  `CapitalParameters` bundles the annual amount, the standard cap, and the
  splits for one contribution year.
- **The annual amount has no default.** It is announced per year (§3.13), so
  `defaultCapitalParameters(annualAmount)` requires the caller to state it.
- **Validation runs once, at parameter load.** `validateCapitalParameters`
  checks each split totals 10000 bps, that the standard project share is within
  `standardProjectMaxBps`, and that the annual amount is a non-negative safe
  integer. It is the trust boundary; the pure split function does not re-check
  the cap.
- **Founder vesting stays out of `CapitalParameters`.** Cliff, tranches, and
  conversion are class rules, not per-year parameters, and nothing votes on
  them. They remain in `founder-vesting.ts`.

## Consequences

- Changing the split is a configuration write and a vote, not a deploy. The
  off-chain defaults and `ConfigDatum` stay in agreement because both are just
  values.
- Contribution history explains itself. Auditing a payout does not require
  knowing which release was deployed that year.
- Two extra columns per contribution row, and the split must be resolved before
  the split function is called, not inside it.
- `splitContribution` no longer knows about member classes, so a caller can pass
  a founder's split to a standard member. The cap check in
  `validateCapitalParameters` catches a bad *configuration*, not a bad *call* —
  the call site owns the lookup.
- When the split first changes, no migration is needed. When vesting terms
  change, `founder-vesting.ts` will need the effective-dating this ADR avoids,
  because vesting is a schedule over years, not a value per row.
