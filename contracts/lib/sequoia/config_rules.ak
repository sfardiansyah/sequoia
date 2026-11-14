use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use sequoia/split
use sequoia/types.{ConfigDatum}

/// Config rules for M2 (ADR 0009 §8). Creation and execution of a config
/// proposal call these; genesis is deployer-trusted and does not.
/// The fields governance can never change, whatever the vote says. The policy
/// ids are immutable so a governance script cannot be swapped out from under
/// the boxes it guards.
pub fn immutable_unchanged(old: ConfigDatum, new: ConfigDatum) -> Bool {
  and {
    old.network == new.network,
    old.membership_policy == new.membership_policy,
    old.kyc_policy == new.kyc_policy,
    old.bank_policy == new.bank_policy,
    old.governance_policy == new.governance_policy,
    old.ballot_policy == new.ballot_policy,
  }
}

fn is_bps(value: Int) -> Bool {
  value >= 0 && value <= 10_000
}

fn is_threshold_bps(value: Int) -> Bool {
  value >= 1 && value <= 10_000
}

fn distinct_board_keys(keys: List<VerificationKeyHash>) -> Bool {
  list.length(list.unique(keys)) == list.length(keys)
}

/// Structural invariants: a vote may choose any policy inside these ranges, but
/// it cannot install a config that breaks the scripts. The split must fund the
/// contribution, the board must be able to sign, and the windows must be long
/// enough for a ballot to exist.
pub fn invariants_hold(config: ConfigDatum) -> Bool {
  and {
    config.annual_amount > 0,
    split.valid_split(
      config.member_capital_bps,
      config.capital_participation_bps,
    ),
    is_bps(config.standard_capital_participation_max_bps),
    config.standard_capital_participation_max_bps >= config.capital_participation_bps,
    !list.is_empty(config.board_keys),
    distinct_board_keys(config.board_keys),
    config.board_threshold >= 1,
    config.board_threshold <= list.length(config.board_keys),
    is_threshold_bps(config.quorum_bps),
    is_threshold_bps(config.project_threshold_bps),
    is_threshold_bps(config.structural_threshold_bps),
    config.voting_days >= 1,
    config.reveal_days >= 1,
    config.timelock_days >= 0,
  }
}
