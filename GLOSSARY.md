# Glossary

Vocabulary for the Sequoia co-op. Use these terms exactly; the "avoid" column
lists the synonyms the plan uses loosely and that we do not use in code, issues,
or tests.

The plan at `docs/plan/sequoia-plan.md` is the source of the rules. This file is
the source of the *names*. For the statutory terms behind these English names,
see `docs/legal/cooperative-membership-and-surplus.md`.

## Capital

| Term | Meaning | Avoid |
|---|---|---|
| **Contribution** | The annual fixed IDR payment a member makes into the co-op. One per member per contribution year. | "deposit" for the payment, "payment" |
| **Member Capital** (`MCAP`) | The redeemable equity tranche of a contribution: 70% for every member. 1 unit = 1 IDR, booked as Member Equity, 100% redeemed at the exit window from the redemption reserve, subject to solvency/liquidity; deferred in request order if the reserve is short. Earns a variable return on capital. | "deposit", "refundable deposit", "IDR deposit", "deposit receipt", "savings" |
| **Capital Participation** (`PROJ`) | The at-risk tranche of a contribution: 30% for every member, plus any additional founder initial commitment. 1 unit = 1 IDR contributed; value moves with the pool; settled at audited book value. | "project share", "at-risk capital", "equity", "PROJ tokens" |
| **Founder Initial Commitment** | An optional additional Capital Participation amount a founder may commit at inception. 100% at-risk, subject to the founder lock-up/vesting. It is not a different contribution split. | "first deposit", "founder deposit" |
| **Contribution Split** | The Member Capital / Capital Participation division applied to one contribution, in basis points: `7000/3000` for every member. | "the 70/30", "allocation" |
| **Annual Amount** | The fixed IDR contribution for one contribution year, announced before enrollment. Not a default — it is stated per year. | "membership fee", "dues" |
| **Member Equity** | The cooperative's own-equity capital category. Member Capital is booked here. It is not the same as the capital weight base. | "own capital", "total equity" |
| **Capital Weight Base** | Member Capital + Capital Participation at contributed value. The weight for the 25% capital tranche. | "total equity", "capital share" |
| **Capital Position** | A member's current Member Capital and Capital Participation balances. Mutable: losses reduce Capital Participation; redemption reduces Member Capital. | "wallet balance", "holdings" |

Three things are easy to confuse:

- **Contribution** is the money in.
- **Member Capital** is the redeemable equity tranche, and stays a balance.
- A **bank contribution attestation** is evidence that a contribution reached the
  bank account. It is neither of the above; say "bank attestation."

## Redemption

| Term | Meaning |
|---|---|
| **Redemption Reserve** | Liquid IDR equal to 100% of outstanding Member Capital, funded by the 70% cash tranche. A liquidity policy, not a liability and not bankruptcy-remote. |
| **Redeem** | Pay Member Capital at 100% of the contributed amount at the exit window, from the Redemption Reserve. |
| **Defer** | Move a redemption that the reserve cannot meet to the next exit window, in request order. The 100% nominal promise remains. |
| **Settle** | Pay Capital Participation at audited book value. Can be more or less than the contributed amount. |

## Time

Three different clocks. Never store one in another's column.

| Term | Meaning |
|---|---|
| **Membership Age** | Months since the member's `joinedAt`. Drives founder vesting only. |
| **Contribution Year** | The calendar enrollment window a contribution belongs to. Drives the once-per-year contribution rule. |
| **Fiscal Year** | The accounting year surplus is computed and distributed for. Drives patronage weights and the distribution itself. |

Founders vest on membership age; contributions are collected per contribution
year; surplus is computed per fiscal year. A founder who joins in October vests
from October but contributes in the same window as everyone else.

## Vesting

| Term | Meaning |
|---|---|
| **Vesting** | A founder's Capital Participation becoming redeemable over time: nothing before month 36, 50% at month 48, 100% at month 60. |
| **Vested** | Cumulative entitlement by schedule, as a fraction of founder Capital Participation. |
| **Redeemable** | Vested minus already redeemed. What can actually be taken at an exit window. |
| **Released** | Same as fully vested (100%). Prefer "vested". |

## Claims

Three things are called a claim. Say which:

| Term | Meaning |
|---|---|
| **`CLAIM`** | The token class for claims. Use only when naming the token. |
| **Exit Claim** | A deferred payout owed to an exiting member when the project pool is illiquid. |
| **Founder Claim** | A resigned founder's Capital Participation, converted to a claim at book value that follows the vesting schedule. Has no vote and no future surplus share. |

A Founder Claim is not an Exit Claim with a different cause: a Founder Claim
follows a vesting schedule and outlives the membership, while an Exit Claim is
settled as liquidity allows and ends the membership.

## Valuation

| Term | Meaning |
|---|---|
| **Pool Value** | The project pool's net asset value, after all distributions paid out of the pool. |
| **Book Value** | Pool value divided by `PROJ` supply. A rational `{numerator, denominator}`, never a float. One term; do not also say "NAV". |
| **Audited Book Value** | The book value from the latest year-end audit. The only value a Capital Participation exit may settle at. |

## Distribution

| Term | Meaning | Avoid |
|---|---|---|
| **Surplus** | Distributable surplus for a fiscal year: after tax, project costs, operating costs, and the §3.12 operating reserve top-up. Split 20/2.5/52.5/25 by default. | "profit", "dividend", "gross profit" |
| **Patronage** | A member's IDR transaction value with the co-op in one fiscal year. One of the two surplus keys; 52.5% by default. | "contribution" (that is capital), "transaction volume" |
| **Capital** | The Capital Weight Base. The other surplus key; 25% by default. | "capital share", "yield", "return on capital" when the weight is meant |
| **Return on Capital** | The variable surplus share paid on the Capital Weight Base. Not a fixed interest rate. | "interest", "yield" |
| **Distribution Policy** | The Endowment Reserve / Education Fund / Patronage / Capital split in basis points, snapshotted into each distribution. | "profit ratio", "sharing ratio" |
| **Endowment Reserve** | The cooperative's own risk capital, from 20% of surplus: held outside `PROJ` supply, absorbs capital losses first, funds approved development, never distributed, does not settle exits. | "reserve" (that is the operating reserve), "savings" |
| **Education Fund** | The retained education allocation, from 2.5% of surplus. Restricted; spent on cooperative education over time. | "training budget", "expense" when it is retained |
| **Operating Reserve** | Working capital for 6–12 months of operations, funded before distribution. | "endowment", "Endowment Reserve" |

The Endowment Reserve, the Education Fund, and the Operating Reserve are three
different things. The reserve is working capital; the Education Fund is a
restricted statutory use; the endowment is permanent risk capital. Never use one
word for all three.

For the statutory terms behind these English names, see
`docs/legal/cooperative-membership-and-surplus.md`.

## Membership

| Term | Meaning |
|---|---|
| **Member Class** | `STANDARD` or `FOUNDER`. Both use the same 70/30 split; a founder may commit additional initial Capital Participation. Changes to `STANDARD` at month 60. |
| **Active Member** | Status `ACTIVE`. The quorum denominator and the set allowed to vote. |
| **Pending Exit** | Status while a redemption is deferred because the reserve is short. The member waits in request order; the articles define voting rights during the wait. |
| **Exit Window** | The 30 days after the annual surplus distribution when redemptions and settlements happen. The only time exit is allowed. |

## Money

| Term | Meaning |
|---|---|
| **`IdrAmount`** | A non-negative safe integer number of IDR. Plain `number` for now; see plan §5.1. |
| **`BasisPoints`** | An integer `0..10000`. `7000` = 70%. |
| **Smallest Unit** | Balances, quantities, and ledger amounts are integers. Decimals are display only. |

Rounding rule: floor Member Capital, give the remainder to Capital Participation.
An odd amount never over-promises redemption.
