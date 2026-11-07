/// Splits one contribution into Member Capital and Capital Participation.
///
/// The bps are passed in, never looked up: the config carries them, so a
/// governance change affects only future contributions. Member Capital floors,
/// and the remainder goes to at-risk Capital Participation, so an odd amount
/// never over-promises redemption.
pub fn split(
  amount: Int,
  member_capital_bps: Int,
  capital_participation_bps: Int,
) -> (Int, Int) {
  if !valid_split(member_capital_bps, capital_participation_bps) {
    fail @"split: basis points must total 10000"
  } else if amount < 0 {
    fail @"split: amount must be non-negative"
  } else {
    let member_capital = amount * member_capital_bps / 10_000
    (member_capital, amount - member_capital)
  }
}

pub fn valid_split(
  member_capital_bps: Int,
  capital_participation_bps: Int,
) -> Bool {
  member_capital_bps >= 0 && capital_participation_bps >= 0 && member_capital_bps + capital_participation_bps == 10_000
}
