use aiken/interval
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/config_rules
use sequoia/types.{
  Config, ConfigDatum, Open, Passed, ProposalDatum, Rejected, state_asset_name,
}
use sequoia/voting

const state_policy_id: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const config_policy_id: ByteArray =
  #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const tx_id: ByteArray =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const proposal_id: ByteArray =
  #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

const leaf_a: ByteArray =
  #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

const finalized_at: Int = 1_000_000

const membership_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const bank_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const governance_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const ballot_policy_id: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const issuer: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const board_a: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const board_b: ByteArray =
  #"88888888888888888888888888888888888888888888888888888888"

const board_c: ByteArray =
  #"99999999999999999999999999999999999999999999999999999999"

fn config() -> ConfigDatum {
  ConfigDatum {
    contribution_year: 2026,
    annual_amount: 1_000_000,
    member_capital_bps: 7_000,
    capital_participation_bps: 3_000,
    standard_capital_participation_max_bps: 5_000,
    board_keys: [board_a, board_b, board_c],
    board_threshold: 2,
    kyc_issuer: VerificationKey(issuer),
    bank_issuer: VerificationKey(issuer),
    network: 0,
    membership_policy: membership_policy_id,
    kyc_policy: kyc_policy_id,
    bank_policy: bank_policy_id,
    governance_policy: governance_policy_id,
    ballot_policy: ballot_policy_id,
    quorum_bps: 5_000,
    project_threshold_bps: 5_001,
    structural_threshold_bps: 6_667,
    timelock_days: 7,
    voting_days: 7,
    reveal_days: 3,
  }
}

test invariants_hold_accepts_the_default_config() {
  config_rules.invariants_hold(config())
}

test invariants_hold_rejects_a_zero_annual_amount() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), annual_amount: 0 })
}

test invariants_hold_rejects_split_bps_out_of_range() {
  !config_rules.invariants_hold(
    ConfigDatum {
      ..config(),
      member_capital_bps: 10_001,
      capital_participation_bps: -1,
    },
  )
}

test invariants_hold_rejects_a_split_that_does_not_total_10000() {
  !config_rules.invariants_hold(
    ConfigDatum { ..config(), capital_participation_bps: 2_999 },
  )
}

test invariants_hold_rejects_a_cap_above_10000() {
  !config_rules.invariants_hold(
    ConfigDatum { ..config(), standard_capital_participation_max_bps: 10_001 },
  )
}

test invariants_hold_rejects_a_cap_below_the_participation() {
  !config_rules.invariants_hold(
    ConfigDatum { ..config(), standard_capital_participation_max_bps: 2_999 },
  )
}

test invariants_hold_rejects_an_empty_board() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), board_keys: [] })
}

test invariants_hold_rejects_a_duplicate_board_key() {
  !config_rules.invariants_hold(
    ConfigDatum { ..config(), board_keys: [board_a, board_a, board_b] },
  )
}

test invariants_hold_rejects_a_board_threshold_of_zero() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), board_threshold: 0 })
}

test invariants_hold_rejects_a_board_threshold_above_the_key_count() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), board_threshold: 4 })
}

test invariants_hold_rejects_quorum_out_of_range() {
  and {
    !config_rules.invariants_hold(ConfigDatum { ..config(), quorum_bps: 0 }),
    !config_rules.invariants_hold(
      ConfigDatum { ..config(), quorum_bps: 10_001 },
    ),
  }
}

test invariants_hold_rejects_thresholds_out_of_range() {
  and {
    !config_rules.invariants_hold(
      ConfigDatum { ..config(), project_threshold_bps: 0 },
    ),
    !config_rules.invariants_hold(
      ConfigDatum { ..config(), structural_threshold_bps: 10_001 },
    ),
  }
}

test invariants_hold_rejects_a_zero_voting_window() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), voting_days: 0 })
}

test invariants_hold_rejects_a_zero_reveal_window() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), reveal_days: 0 })
}

test invariants_hold_rejects_a_negative_timelock() {
  !config_rules.invariants_hold(ConfigDatum { ..config(), timelock_days: -1 })
}

test immutable_unchanged_accepts_mutable_fields() {
  let old = config()
  config_rules.immutable_unchanged(
    old,
    ConfigDatum {
      ..old,
      contribution_year: 2027,
      annual_amount: 2_000_000,
      member_capital_bps: 6_000,
      capital_participation_bps: 4_000,
      board_keys: [board_c],
      board_threshold: 1,
      kyc_issuer: VerificationKey(board_a),
      bank_issuer: VerificationKey(board_b),
      quorum_bps: 6_000,
      project_threshold_bps: 5_500,
      structural_threshold_bps: 7_000,
      timelock_days: 1,
      voting_days: 3,
      reveal_days: 1,
    },
  )
}

test immutable_unchanged_rejects_each_immutable_field() {
  let old = config()
  and {
    !config_rules.immutable_unchanged(old, ConfigDatum { ..old, network: 1 }),
    !config_rules.immutable_unchanged(
      old,
      ConfigDatum { ..old, membership_policy: kyc_policy_id },
    ),
    !config_rules.immutable_unchanged(
      old,
      ConfigDatum { ..old, kyc_policy: membership_policy_id },
    ),
    !config_rules.immutable_unchanged(
      old,
      ConfigDatum { ..old, bank_policy: membership_policy_id },
    ),
    !config_rules.immutable_unchanged(
      old,
      ConfigDatum { ..old, governance_policy: membership_policy_id },
    ),
    !config_rules.immutable_unchanged(
      old,
      ConfigDatum { ..old, ballot_policy: membership_policy_id },
    ),
  }
}

fn ref(index: Int) -> OutputReference {
  OutputReference { transaction_id: tx_id, output_index: index }
}

fn config_input() -> Input {
  Input {
    output_reference: ref(0),
    output: Output {
      address: from_script(config_policy_id),
      value: assets.from_asset(state_policy_id, state_asset_name, 1),
      datum: InlineDatum(config()),
      reference_script: None,
    },
  }
}

fn config_output(datum: ConfigDatum) -> Output {
  Output {
    address: from_script(config_policy_id),
    value: assets.from_asset(state_policy_id, state_asset_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(datum: ConfigDatum) -> Output {
  Output {
    address: from_verification_key(issuer),
    value: assets.from_asset(state_policy_id, state_asset_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn proposed_config() -> ConfigDatum {
  ConfigDatum { ..config(), contribution_year: 2027, annual_amount: 2_000_000 }
}

fn passed_proposal() -> ProposalDatum {
  ProposalDatum {
    id: proposal_id,
    proposer: issuer,
    kind: Config,
    proposed_config: proposed_config(),
    eligible_leaves: [leaf_a],
    start: finalized_at - 100_000,
    end: finalized_at - 50_000,
    reveal_end: finalized_at - 1_000,
    nullifiers: [proposal_id],
    discarded: 0,
    tallied: 1,
    yes: 1,
    no: 0,
    abstain: 0,
    status: Passed,
    finalized_at: Some(finalized_at),
  }
}

fn proposal_input(datum: ProposalDatum, index: Int) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(governance_policy_id),
      value: assets.from_asset(governance_policy_id, datum.id, 1),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

fn execute_tx(
  new: ConfigDatum,
  proposal: ProposalDatum,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [config_input(), proposal_input(proposal, 1)],
    validity_range: interval.between(lower, upper),
    outputs: [config_output(new)],
  }
}

fn timelock_end() -> Int {
  voting.timelock_end(finalized_at, config().timelock_days)
}

test execute_accepts_a_passed_proposal_after_the_timelock() {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_accepts_exactly_at_the_timelock_boundary() {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end(),
    ),
  )
}

test execute_rejects_before_the_timelock() fail {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end() - 1,
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_an_immutable_field_change() fail {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      ConfigDatum { ..proposed_config(), network: 1 },
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_a_config_that_breaks_the_invariants() fail {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      ConfigDatum { ..proposed_config(), annual_amount: 0 },
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_an_open_proposal() fail {
  let proposal = ProposalDatum {
    ..passed_proposal(),
    status: Open,
    finalized_at: None,
  }
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      proposal,
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_a_rejected_proposal() fail {
  let proposal = ProposalDatum { ..passed_proposal(), status: Rejected }
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      proposal,
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_a_config_that_is_not_the_proposed_one() fail {
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      ConfigDatum { ..proposed_config(), annual_amount: 3_000_000 },
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}

test execute_rejects_a_config_output_at_another_address() fail {
  let tx = Transaction {
    ..execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
    outputs: [wallet_output(proposed_config())],
  }
  config_rules.execute(state_policy_id, ref(0), tx)
}

test execute_rejects_a_config_output_without_the_state_token() fail {
  let tx = Transaction {
    ..execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
    outputs: [
      Output {
        address: from_script(config_policy_id),
        value: assets.from_lovelace(5_000_000),
        datum: InlineDatum(proposed_config()),
        reference_script: None,
      },
    ],
  }
  config_rules.execute(state_policy_id, ref(0), tx)
}

test execute_rejects_a_missing_proposal() fail {
  let tx = Transaction {
    ..execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
    inputs: [config_input()],
  }
  config_rules.execute(state_policy_id, ref(0), tx)
}

test execute_rejects_two_proposals() fail {
  let tx = Transaction {
    ..execute_tx(
      proposed_config(),
      passed_proposal(),
      timelock_end(),
      timelock_end() + 1_000,
    ),
    inputs: [
      config_input(),
      proposal_input(passed_proposal(), 1),
      proposal_input(passed_proposal(), 2),
    ],
  }
  config_rules.execute(state_policy_id, ref(0), tx)
}

test execute_rejects_a_passed_proposal_without_a_finalize_time() fail {
  let proposal = ProposalDatum { ..passed_proposal(), finalized_at: None }
  config_rules.execute(
    state_policy_id,
    ref(0),
    execute_tx(
      proposed_config(),
      proposal,
      timelock_end(),
      timelock_end() + 1_000,
    ),
  )
}
