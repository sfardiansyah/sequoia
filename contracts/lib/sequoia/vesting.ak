/// Founder vesting: nothing before month 48, 50% at month 48, 100% at month 60.
///
/// The 36-month cliff is a lock-up marker, not a vesting step. The schedule is
/// hard-coded in M1 because the member datum does not carry it (ADR 0008 §8);
/// M4 moves it into config when lock-up is enforced.
pub const founder_cliff_months: Int = 36

pub const founder_first_vesting_month: Int = 48

pub const founder_conversion_month: Int = 60

pub fn vested_bps(months_since_join: Int) -> Int {
  if months_since_join < 0 {
    fail @"vesting: months since join must be non-negative"
  } else if months_since_join < founder_first_vesting_month {
    0
  } else if months_since_join < founder_conversion_month {
    5_000
  } else {
    10_000
  }
}
