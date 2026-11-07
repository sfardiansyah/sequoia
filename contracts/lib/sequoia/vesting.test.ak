use aiken/collection/list
use aiken/fuzz
use sequoia/vectors.{vesting_cases}
use sequoia/vesting.{vested_bps}

test vesting_matches_shared_vectors() {
  list.all(
    vesting_cases,
    fn(vector) {
      let (months, vested) = vector
      vested_bps(months) == vested
    },
  )
}

test vesting_is_in_bounds(months via fuzz.int_between(0, 240)) {
  let vested = vested_bps(months)
  vested >= 0 && vested <= 10_000
}

test vesting_is_monotonic(months via fuzz.int_between(0, 239)) {
  vested_bps(months) <= vested_bps(months + 1)
}
