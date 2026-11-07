use aiken/collection/list
use aiken/fuzz
use sequoia/split.{split, valid_split}
use sequoia/vectors.{split_cases}

const max_amount = 9_007_199_254_740_991

test split_matches_shared_vectors() {
  list.all(
    split_cases,
    fn(vector) {
      let  
          (
            amount,
            member_capital_bps,
            capital_participation_bps,
            member_capital,
            capital_participation,
          )
        = vector
      split(amount, member_capital_bps, capital_participation_bps) == (
        member_capital,
        capital_participation,
      )
    },
  )
}

test valid_split_accepts_the_default_split() {
  valid_split(7_000, 3_000)
}

test valid_split_rejects_a_broken_total() {
  !valid_split(7_000, 2_000)
}

test conservation(amount via fuzz.int_between(0, max_amount)) {
  let (member_capital, capital_participation) = split(amount, 7_000, 3_000)
  member_capital + capital_participation == amount
}

test member_capital_never_exceeds_amount(
  amount via fuzz.int_between(0, max_amount),
) {
  let (member_capital, _) = split(amount, 7_000, 3_000)
  member_capital >= 0 && member_capital <= amount
}

test both_tranches_are_non_negative(
  vector via fuzz.tuple(
    fuzz.int_between(0, max_amount),
    fuzz.int_between(0, 10_000),
  ),
) {
  let (amount, member_capital_bps) = vector
  let (member_capital, capital_participation) = split(
    amount,
    member_capital_bps,
    10_000 - member_capital_bps,
  )
  and {
    member_capital >= 0,
    capital_participation >= 0,
    member_capital + capital_participation == amount,
  }
}
