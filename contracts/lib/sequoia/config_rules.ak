use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Script}
use cardano/assets.{PolicyId, quantity_of}
use cardano/transaction.{Input, OutputReference, Transaction}
use sequoia/split
use sequoia/tx.{inline_datum, lower_bound, signed, spent_input}
use sequoia/types.{Config, ConfigDatum, Passed, ProposalDatum, state_asset_name}
use sequoia/voting

/// Config rules for M2 (ADR 0009 §6, §8). Creation and execution of a config
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

/// The one output that recreates the config box: the same address as the input
/// it replaces, holding exactly one STATE.
fn returned_config(
  state_nft_policy: PolicyId,
  old_input: Input,
  self: Transaction,
) -> ConfigDatum {
  let holders = list.filter(
    self.outputs,
    fn(output) {
      and {
        output.address == old_input.output.address,
        quantity_of(output.value, state_nft_policy, state_asset_name) == 1,
      }
    },
  )
  when holders is {
    [output] -> {
      expect datum: ConfigDatum = inline_datum(output)
      datum
    }
    _ -> fail @"config_rules: exactly one config output holding the STATE token"
  }
}

/// The proposal being executed: exactly one input at the governance script the
/// config names.
fn passed_proposal(config: ConfigDatum, self: Transaction) -> ProposalDatum {
  let proposals = list.filter(
    self.inputs,
    fn(input) {
      input.output.address.payment_credential == Script(
        config.governance_policy,
      )
    },
  )
  when proposals is {
    [input] -> {
      expect proposal: ProposalDatum = inline_datum(input.output)
      proposal
    }
    _ -> fail @"config_rules: exactly one governance input required"
  }
}

/// The config box's only spend: a passed `Config` proposal, after the timelock,
/// writes its `proposed_config` (ADR 0009 §4, §6, §8). The governance validator
/// records the status change and requires this write; the timelock, immutability,
/// and invariant checks live here, where the config is written.
pub fn execute(
  state_nft_policy: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let old_input = spent_input(own_ref, self)
  expect old: ConfigDatum = inline_datum(old_input.output)
  let new = returned_config(state_nft_policy, old_input, self)
  let proposal = passed_proposal(old, self)
  if !immutable_unchanged(old, new) {
    fail @"config_rules: immutable config fields must not change"
  } else if !invariants_hold(new) {
    fail @"config_rules: the executed config breaks the invariants"
  } else if proposal.status != Passed {
    fail @"config_rules: only a passed proposal can execute"
  } else if proposal.kind != Config {
    fail @"config_rules: only a config proposal can execute the config"
  } else if proposal.proposed_config != new {
    fail @"config_rules: the executed config must be the proposed config"
  } else {
    expect Some(finalized_at) = proposal.finalized_at
    if !voting.not_before(
      lower_bound(self),
      voting.timelock_end(finalized_at, old.timelock_days),
    ) {
      fail @"config_rules: the timelock has not elapsed"
    } else {
      True
    }
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

/// Board approval: `board_threshold` distinct board keys are required signers.
pub fn board_signers(config: ConfigDatum, self: Transaction) -> Int {
  list.count(config.board_keys, fn(key) { signed(self, key) })
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
