# Glossary

Vocabulary for the Sequoia co-op. Use these terms exactly; the "avoid" column
lists the synonyms the plan uses loosely and that we do not use in code, issues,
or tests.

The plan at `docs/plan/sequoia-plan.md` is the source of the rules. This file is
the source of the *names*.

## Capital

| Term | Meaning | Avoid |
|---|---|---|
| **Contribution** | The annual fixed IDR payment a member makes into the co-op. One per member per contribution year. | "deposit" for the payment, "payment" |
| **Deposit** (`IDR-DEP`) | The refundable tranche of a contribution: 70% for a standard member, 20% for a founder. 1 unit = 1 IDR, backed 1:1 by the segregated bank reserve, refunded in full at the exit window. | "refundable deposit", "IDR deposit", "deposit receipt" |
| **Project capital** (`PROJ`) | The at-risk tranche of a contribution: 30% standard, 80% founder. 1 unit = 1 IDR of contributed capital; value moves with the pool. | "project share", "at-risk capital", "equity", "PROJ tokens" |
| **Contribution split** | The deposit/project division applied to one contribution, in basis points. `7000/3000` standard, `2000/8000` founder by default. | "the 70/30", "allocation" |
| **Annual amount** | The fixed IDR contribution for one contribution year, announced before enrollment. Not a default — it is stated per year. | "membership fee", "dues" |
| **Capital position** | A member's current `IDR-DEP` and `PROJ` balances. Mutable: losses reduce `PROJ`. | "wallet balance", "holdings" |

Two deposits, one word — keep them apart:

- **Contribution** is the money in.
- **Deposit** is the refundable half of it, and stays a balance.
- A **bank deposit attestation** is evidence that a contribution reached the
  bank account. It is neither of the above; say "bank attestation".

## Time

Two different clocks. Never store one in the other's column.

| Term | Meaning |
|---|---|
| **Membership age** | Months since the member's `joinedAt`. Drives founder vesting only. |
| **Contribution year** | The calendar enrollment window a contribution belongs to. Drives the once-per-year contribution rule. |

Founders vest on membership age; contributions are collected per contribution
year. A founder who joins in October vests from October but contributes in the
same window as everyone else.

## Vesting

| Term | Meaning |
|---|---|
| **Vesting** | A founder's `PROJ` becoming redeemable over time: nothing before month 36, 50% at month 48, 100% at month 60. |
| **Vested** | Cumulative entitlement by schedule, as a fraction of founder `PROJ`. |
| **Redeemable** | Vested minus already redeemed. What can actually be taken at an exit window. |
| **Released** | Same as fully vested (100%). Prefer "vested". |

## Claims

Three things are called a claim. Say which:

| Term | Meaning |
|---|---|
| **`CLAIM`** | The token class for claims. Use only when naming the token. |
| **Exit claim** | A deferred payout owed to an exiting member when the project pool is illiquid. |
| **Founder claim** | A resigned founder's unvested `PROJ`, converted to a claim at book value that follows the vesting schedule. Has no vote and no future profit share. |

A founder claim is not an exit claim with a different cause: a founder claim
follows a vesting schedule and outlives the membership, while an exit claim is
settled as liquidity allows and ends the membership.

## Valuation

| Term | Meaning |
|---|---|
| **Book value** | Pool value divided by `PROJ` supply. A rational `{numerator, denominator}`, never a float. One term; do not also say "NAV". |
| **Audited book value** | The book value from the latest year-end audit. The only value an exit may settle at. |

## Membership

| Term | Meaning |
|---|---|
| **Member class** | `STANDARD` or `FOUNDER`. Decides the contribution split; changes to `STANDARD` automatically at month 60. |
| **Active member** | Status `ACTIVE`. The quorum denominator and the set allowed to vote. |
| **Exit window** | The 30 days after annual profit distribution when refunds and settlements happen. The only time exit is allowed. |

## Money

| Term | Meaning |
|---|---|
| **`IdrAmount`** | A non-negative safe integer number of IDR. Plain `number` for now; see plan §5.1. |
| **`BasisPoints`** | An integer `0..10000`. `7000` = 70%. |
| **Smallest unit** | Balances, quantities, and ledger amounts are integers. Decimals are display only. |

Rounding rule: floor the deposit, give the remainder to project capital. An odd
amount never over-promises a refund.
