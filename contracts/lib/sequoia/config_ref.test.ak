use cardano/address.{VerificationKey, from_script}
use cardano/assets
use cardano/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  placeholder,
}
use sequoia/config_ref
use sequoia/types.{ConfigDatum}

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const other_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const tx_id: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

fn config() -> ConfigDatum {
  ConfigDatum {
    contribution_year: 2026,
    annual_amount: 1_000_000,
    member_capital_bps: 7_000,
    capital_participation_bps: 3_000,
    standard_capital_participation_max_bps: 5_000,
    board_keys: [],
    board_threshold: 1,
    kyc_issuer: VerificationKey(#"55"),
    bank_issuer: VerificationKey(#"55"),
    network: 0,
    membership_policy: other_policy_id,
    kyc_policy: other_policy_id,
    bank_policy: other_policy_id,
    governance_policy: other_policy_id,
    ballot_policy: other_policy_id,
    quorum_bps: 5_000,
    project_threshold_bps: 5_001,
    structural_threshold_bps: 6_667,
    timelock_days: 7,
    voting_days: 7,
    reveal_days: 3,
  }
}

fn state_input(index: Int, datum: Datum) -> Input {
  Input {
    output_reference: OutputReference {
      transaction_id: tx_id,
      output_index: index,
    },
    output: Output {
      address: from_script(state_policy_id),
      value: assets.from_asset(state_policy_id, "STATE", 1),
      datum,
      reference_script: None,
    },
  }
}

fn base_tx() -> Transaction {
  Transaction {
    ..placeholder,
    reference_inputs: [state_input(0, InlineDatum(config()))],
  }
}

test config_ref_accepts_one_inline_reference_input() {
  config_ref.find(state_policy_id, base_tx()) == config()
}

test config_ref_rejects_a_missing_reference_input() fail {
  let found = config_ref.find(
    state_policy_id,
    Transaction { ..base_tx(), reference_inputs: [] },
  )
  found == config()
}

test config_ref_rejects_two_reference_inputs() fail {
  let found = config_ref.find(
    state_policy_id,
    Transaction {
      ..base_tx(),
      reference_inputs: [
        state_input(0, InlineDatum(config())),
        state_input(1, InlineDatum(config())),
      ],
    },
  )
  found == config()
}

test config_ref_rejects_a_non_inline_datum() fail {
  let found = config_ref.find(
    state_policy_id,
    Transaction { ..base_tx(), reference_inputs: [state_input(0, NoDatum)] },
  )
  found == config()
}

test config_ref_rejects_a_spent_config() fail {
  let found = config_ref.find(
    state_policy_id,
    Transaction {
      ..base_tx(),
      reference_inputs: [],
      inputs: [state_input(0, InlineDatum(config()))],
    },
  )
  found == config()
}

test config_ref_rejects_a_foreign_state_policy() fail {
  let found = config_ref.find(other_policy_id, base_tx())
  found == config()
}

test config_ref_ignores_a_box_without_the_state_token() fail {
  let input = Input {
    output_reference: OutputReference { transaction_id: tx_id, output_index: 0 },
    output: Output {
      address: from_script(state_policy_id),
      value: assets.from_lovelace(5_000_000),
      datum: InlineDatum(config()),
      reference_script: None,
    },
  }
  let found = config_ref.find(
    state_policy_id,
    Transaction { ..base_tx(), reference_inputs: [input] },
  )
  found == config()
}
