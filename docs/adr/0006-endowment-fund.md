# ADR 0006: The Endowment Reserve is the cooperative's own risk capital

## Status

Accepted. Amended 2026-10-25: the endowment is designated the Endowment Reserve, its
draws are limited to capital-loss absorption and development, and exit settlement
is removed.

## Context

ADR 0005 allocates 20% of surplus to an endowment. The plan owner designates that
endowment as the cooperative's Endowment Reserve (Article 41(2)(c), Article 45(2)–(3)).
That fits: both are equity capital, funded from surplus, and never distributed to
members. It also answers the original open question in this ADR about whether a
separate reserve fund is needed.

The original decision gave the endowment two draws: loss absorption and exit
settlement. Exit settlement pulled the fund toward a liquidity facility and away
from the ordinary purpose of an Endowment Reserve (losses and development). It also
made the fund compete with the project pool for exit liquidity. This amendment
removes that draw. Exit shortfalls are now deferred or claimed against the project
pool, not paid from the endowment.

The 2.5% Education Fund allocation is separate. It does not come out of the endowment.

## Decision

- **The endowment is the Endowment Reserve**, held outside `PROJ`
  supply. It holds no units, earns no surplus share, and is never distributed to
  members.
- **It is a fourth segregated bank account** (§5.4), in the co-op's name, in
  addition to the redemption reserve, project account, and operating account. It is
  not the operating reserve (§3.12).
- **It is funded by retention only:** the 20% surplus tranche (ADR 0005). Members do
  not contribute to it directly.
- **It has exactly two draw reasons:**
  1. **Loss absorption.** Project losses reduce the endowment before they reduce
     `Capital Participation`.
  2. **Development.** Approved co-op capital expenditure, technology, or member
     services. Development does not include operating costs, member distributions,
     or exit settlement.
- **No exit settlement.** At an exit window, a shortfall against `Capital Participation` is deferred or converted to an `ExitClaim`; the endowment is not
  touched. `Member Capital` is paid from the separate redemption reserve.
- **Development is budgeted and capped.** The board proposes a development budget;
  the members' meeting or the board, as the articles provide, approves it. Every
  draw is chain-authorized by a treasury attestation, exactly as a contribution
  is (§5.5).
- **The endowment UTxO records** `balance`, `absorbed_losses`, and
  `development_spent`.
- **It appears on the public dashboard** as balance, cumulative losses absorbed,
  and development spent. `Member Capital` coverage is shown separately.
- **The articles must name it the Endowment Reserve.** The members' meeting sets or confirms
  the 20% amount each year (Article 45(3)); the articles cannot silently treat the
  endowment as a fund alongside the statutory reserve.

## Consequences

- Book value is unchanged: it remains `pool value / PROJ supply` (§5.1), because
  the endowment holds no units. Losses simply reach `Capital Participation` later.
- Exit liquidity now depends on the project pool and the redemption reserve, not
  the endowment. The year-5 redemption wave is mitigated by graded founder
  release, project maturity, and deferral/`ExitClaim`, not by an endowment draw.
- Development spending reduces the loss buffer. The budget and cap are the
  control; a bad year can halve the fund.
- The fund does not compound. It grows only from the 20% tranche. If that proves
  too thin, the lever is the allocation ratio (ADR 0005), not a new funding
  source.
- Counsel should confirm that an Endowment Reserve used for development and loss
  absorption, with no exit settlement, is permissible and how it is presented in
  the annual financial statements. The articles must also confirm that the 20%
  satisfies the statutory reserve allocation and that the 2.5% Education Fund is
  separate.
- Lowering members' at-risk share for *new* contributions needs no new
  machinery: once the fund is large enough, the members' meeting can lower the
  standard `Capital Participation` share through the existing split parameter (ADR
  0003, §3.17 `capital_participation_bps`).

## Sources

- Law No. 25 of 1992 Article 41(2)(c), 45(2)–(3).
- Plan §3.5, §3.6, §5.4; ADR 0005.
- `docs/legal/cooperative-membership-and-surplus.md`.
