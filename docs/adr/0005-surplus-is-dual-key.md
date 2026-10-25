# ADR 0005: Surplus is dual-key — patronage and the capital weight base

## Status

Accepted. Amended 2026-10-25: Member Capital is equity, the capital weight base is
Member Capital plus Capital Participation, the education allocation is added, and
founders no longer use a 20/80 split.

## Context

Plan §3.5 originally shared profit and loss pro-rata by project capital (`PROJ`).
That is an equity model, and it is not the cooperative model.

Law No. 25 of 1992 Article 5(1)(c) requires surplus to be shared "secara adil
sebanding dengan besarnya jasa usaha masing-masing anggota" — fairly, in
proportion to each member's service to the co-op — and Article 5(1)(d) requires
"pemberian balas jasa yang terbatas terhadap modal" — a *limited* return on
capital. A co-op that distributes its entire surplus in proportion to capital has
replaced the patronage key with the capital key, which is the objection the
Constitutional Court echoed when it annulled Law No. 17 of 2012 (Constitutional
Court decision 28/PUU-XI/2013).

The plan now treats the redeemable tranche as Member Capital (`MCAP`), which is
Member Equity, and the at-risk tranche as Capital Participation (`PROJ`). Both are
equity-like. The old rule that only `PROJ` is capital, and that the redeemable
tranche never earns surplus, no longer fits an equity tranche. Founders also no
longer get a 20/80 split: every member uses 70/30, and a founder may commit an
additional initial Capital Participation.

Funding a 20% Endowment Reserve gives the co-op a mechanism to protect capital; a
2.5% retained Education Fund satisfies the statutory education use.

## Decision

- **Surplus is split on two keys plus the Endowment Reserve and Education Fund.**
  Default allocation of surplus, after tax, project costs, operating costs, and the
  §3.12 operating reserve top-up: **20% Endowment Reserve / 2.5% Education Fund /
  52.5% patronage / 25% capital** (§3.17). The members' meeting may change the
  proportions by the structural threshold — two thirds of votes cast, 50% quorum,
  7-day timelock (§3.9).
- **The capital weight base is Member Capital plus Capital Participation** at
  contributed value. Member Capital therefore earns a variable return on capital;
  it is not a fixed return and not interest. `PROJ` is weighted at
  contributed value, not book value, so a loss does not change the weight.
- **Patronage is measured in IDR transaction value** with the co-op over the
  fiscal year. Not margin contributed: margin weighting makes every pricing
  decision a governance fight and is not reconstructible from invoices.
- **Patronage is attested annually, not recorded per transaction.** The figure
  comes from the co-op's accounting, attested by treasurer and auditor the way
  contributions are (§5.5, ADR 0002). Per-transaction UTxOs would put thousands of
  small records of private commercial data on chain.
- **The allocation is snapshotted into each distribution.** A vote that changes
  the proportions never applies retroactively — the same reasoning as ADR 0003 for
  the contribution split.
- **Weights are committed, not recomputed on chain.** The distribution carries a
  Merkle root over `(member_id, patronageWeight, capitalWeight)` plus both class
  totals. The validator checks root membership, one claim per member, and
  per-tranche conservation; the members' vote authorizes the root, so the root
  needs no other authority.
- **No double count.** The annual capital distribution and the `PROJ` book value
  are two channels for the same surplus. The distribution reduces the project pool
  book value by the amount paid from the pool; if the surplus is retained, it is
  not also paid as a distribution. The distribution datum records the
  post-distribution book value.
- **Rounding is always down**, per member and per tranche; the remainder accrues
  to the Endowment Reserve.
- **A zero denominator is not a windfall.** If `total_patronage = 0` — no member
  transacted in the year — that tranche accrues to the Endowment Reserve, not to
  capital.
- **Loss handling is unchanged in shape and changed in order.** Losses do not
  follow the surplus split; they reduce Capital Participation, after the Endowment
  Reserve has absorbed its share (ADR 0006). Member Capital is protected by the
  100% redemption reserve, which is a liquidity policy, not an insolvency
  guarantee.
- **Education is retained.** The 2.5% is a restricted Education Fund, not a member
  distribution. The Endowment Reserve is the cooperative's own risk capital.
- **Founders take more risk, not more votes.** Every member uses 70/30. A founder
  may commit an additional initial Capital Participation; that extra is at-risk and
  follows the founder lock-up/vesting. One member, one vote is unchanged.

## Consequences

- Founders holding extra Capital Participation receive more of the 25% capital
  tranche. The 25% cap and the 52.5% patronage tranche limit that advantage.
- Member Capital now earns a return on capital, so the old "redeemable tranche
  never earns surplus" rule is removed. The per-unit capital return is lower than a
  `PROJ`-only base because the capital base is larger.
- The distribution has two member-facing pools (patronage and capital) plus two
  retained allocations (Endowment Reserve and Education Fund). The distribution
  validator checks conservation per tranche.
- `ConfigDatum` gains `surplus_education_bps` and `redemption_reserve_bps`; the
  founder split fields are removed. `DistributionDatum` gains `education_bps`,
  `education_amount`, and `book_value_after`; `total_capital` is the capital
  weight base.
- Meaningful surplus is impossible until the co-op actually transacts with
  members. An early distribution may have no patronage, with the 52.5% patronage
  tranche accruing to the Endowment Reserve, leaving the 25% capital tranche as the
  only member pool. The articles of association must anticipate that.
- Counsel should confirm that an articles of association defining patronage as a
  member's transaction value — with a 25% capital share and 2.5% Education Fund — 
  satisfies Article 5(1)(c)–(d) and Article 45(2). See
  `docs/legal/cooperative-membership-and-surplus.md`.
- The capital-weight date (year-end contributed value or time-weighted average)
  is still a policy choice; it must be fixed before the first distribution.

## Sources

- Law No. 25 of 1992, Articles 5(1)(c)–(d), 41(2), 42, 45(2)–(3).
- Plan §3.5, §3.17, §4.5; ADR 0006.
- `docs/legal/cooperative-membership-and-surplus.md`.
