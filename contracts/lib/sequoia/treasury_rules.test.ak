use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/treasury_rules
use sequoia/types.{ConfigDatum, PoolDatum, pool_asset_name}

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const governance_policy_id: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const ballot_policy_id: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const treasury_script: ByteArray =
  #"12121212121212121212121212121212121212121212121212121212"

const treasurer: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const tx_id: ByteArray =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const bank_ref: ByteArray = #"0102"

fn ref(index: Int) -> OutputReference {
  OutputReference { transaction_id: tx_id, output_index: index }
}

fn config() -> ConfigDatum {
  ConfigDatum {
    contribution_year: 2026,
    annual_amount: 1_000_000,
    member_capital_bps: 7_000,
    capital_participation_bps: 3_000,
    standard_capital_participation_max_bps: 5_000,
    board_keys: [treasurer],
    board_threshold: 1,
    kyc_issuer: VerificationKey(treasurer),
    bank_issuer: VerificationKey(treasurer),
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

fn config_input() -> Input {
  Input {
    output_reference: ref(0),
    output: Output {
      address: from_script(state_policy_id),
      value: assets.from_asset(state_policy_id, "STATE", 1),
      datum: InlineDatum(config()),
      reference_script: None,
    },
  }
}

fn empty_pool() -> PoolDatum {
  PoolDatum { balance: 0, committed: 0 }
}

/// A box at the treasury script holding one `POOL`.
fn pool_input(datum: PoolDatum, index: Int) -> Input {
  Input { output_reference: ref(index), output: pool_output(datum) }
}

fn pool_output(datum: PoolDatum) -> Output {
  Output {
    address: from_script(treasury_script),
    value: assets.from_asset(state_policy_id, pool_asset_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(datum: PoolDatum) -> Output {
  Output {
    address: from_verification_key(treasurer),
    value: assets.from_asset(state_policy_id, pool_asset_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn attest_tx(old: PoolDatum, new: PoolDatum) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [pool_input(old, 3)],
    reference_inputs: [config_input()],
    extra_signatories: [treasurer],
    outputs: [pool_output(new)],
  }
}

test attest_raises_the_balance() {
  treasury_rules.attest_pool(
    state_policy_id,
    5_000_000,
    bank_ref,
    ref(3),
    attest_tx(empty_pool(), PoolDatum { balance: 5_000_000, committed: 0 }),
  )
}

test attest_lowers_the_balance_below_committed() {
  let old = PoolDatum { balance: 9_000_000, committed: 7_000_000 }
  treasury_rules.attest_pool(
    state_policy_id,
    1_000_000,
    bank_ref,
    ref(3),
    attest_tx(old, PoolDatum { balance: 1_000_000, committed: 7_000_000 }),
  )
}

test attest_rejects_a_missing_treasurer() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    extra_signatories: [],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_a_negative_balance() fail {
  treasury_rules.attest_pool(
    state_policy_id,
    -1,
    bank_ref,
    ref(3),
    attest_tx(empty_pool(), PoolDatum { balance: -1, committed: 0 }),
  )
}

test attest_rejects_an_empty_bank_reference() fail {
  treasury_rules.attest_pool(
    state_policy_id,
    1_000_000,
    #"",
    ref(3),
    attest_tx(empty_pool(), PoolDatum { balance: 1_000_000, committed: 0 }),
  )
}

test attest_rejects_a_changed_committed() fail {
  let old = PoolDatum { balance: 0, committed: 2_000_000 }
  treasury_rules.attest_pool(
    state_policy_id,
    1_000_000,
    bank_ref,
    ref(3),
    attest_tx(old, PoolDatum { balance: 1_000_000, committed: 2_000_001 }),
  )
}

test attest_rejects_a_wrong_balance_in_the_datum() fail {
  treasury_rules.attest_pool(
    state_policy_id,
    1_000_000,
    bank_ref,
    ref(3),
    attest_tx(empty_pool(), PoolDatum { balance: 999_999, committed: 0 }),
  )
}

test attest_rejects_an_output_outside_the_treasury() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    outputs: [wallet_output(empty_pool())],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_two_pool_outputs() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    outputs: [pool_output(empty_pool()), pool_output(empty_pool())],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_spending_a_box_without_the_pool_token() fail {
  let fake = Input {
    output_reference: ref(3),
    output: Output {
      address: from_script(treasury_script),
      value: assets.from_lovelace(5_000_000),
      datum: InlineDatum(empty_pool()),
      reference_script: None,
    },
  }
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    inputs: [fake],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_a_second_pool_input() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    inputs: [pool_input(empty_pool(), 3), pool_input(empty_pool(), 4)],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_spending_another_box_beside_the_pool() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    inputs: [pool_input(empty_pool(), 4)],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_a_missing_config_reference() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    reference_inputs: [],
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}

test attest_rejects_minting_the_pool_token() fail {
  let tx = Transaction {
    ..attest_tx(empty_pool(), empty_pool()),
    mint: assets.from_asset(state_policy_id, pool_asset_name, 1),
  }
  treasury_rules.attest_pool(state_policy_id, 0, bank_ref, ref(3), tx)
}
