use aiken/interval
use cardano/address.{
  Script, VerificationKey, from_script, from_verification_key,
}
use cardano/assets
use cardano/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  placeholder,
}
use sequoia/bank_rules
use sequoia/types.{BankProofDatum, ConfigDatum}

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const other_policy_id: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const bank_issuer_hash: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const other_key: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const tx_id: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const member_a: ByteArray = #"01"

const member_too_long: ByteArray =
  #"000000000000000000000000000000000000000000000000000000000000000000"

const nonce_a: ByteArray = #"0a0b"

const nonce_b: ByteArray = #"0c0d"

const issued_at: Int = 1_000

const proof_ref: OutputReference =
  OutputReference { transaction_id: tx_id, output_index: 10 }

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
    board_keys: [],
    board_threshold: 1,
    kyc_issuer: VerificationKey(other_key),
    bank_issuer: VerificationKey(bank_issuer_hash),
    network: 0,
    membership_policy: membership_policy_id,
    kyc_policy: kyc_policy_id,
    bank_policy: bank_policy_id,
  }
}

fn script_issuer_config() -> ConfigDatum {
  ConfigDatum { ..config(), bank_issuer: Script(bank_issuer_hash) }
}

fn config_input_at(index: Int, datum: Datum) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(state_policy_id),
      value: assets.from_asset(state_policy_id, "STATE", 1),
      datum,
      reference_script: None,
    },
  }
}

fn config_input() -> Input {
  config_input_at(0, InlineDatum(config()))
}

fn proof_datum(
  member: ByteArray,
  year: Int,
  amount: Int,
  nonce: ByteArray,
  issued_at: Int,
) -> BankProofDatum {
  BankProofDatum {
    issuer: bank_issuer_hash,
    member_id: member,
    contribution_year: year,
    amount,
    bank_ref_hash: #"cc",
    nonce,
    issued_at,
  }
}

fn base_tx() -> Transaction {
  Transaction {
    ..placeholder,
    reference_inputs: [config_input()],
    validity_range: interval.between(1_000, 2_000),
    extra_signatories: [bank_issuer_hash],
  }
}

fn proof_output(nonce: ByteArray, datum: BankProofDatum) -> Output {
  Output {
    address: from_script(bank_policy_id),
    value: assets.from_asset(membership_policy_id, nonce, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(nonce: ByteArray) -> Output {
  Output {
    address: from_verification_key(other_key),
    value: assets.from_asset(membership_policy_id, nonce, 1),
    datum: NoDatum,
    reference_script: None,
  }
}

fn issue_tx(nonce: ByteArray, datum: BankProofDatum) -> Transaction {
  Transaction {
    ..base_tx(),
    mint: assets.from_asset(membership_policy_id, nonce, 1),
    outputs: [proof_output(nonce, datum)],
  }
}

fn proof_input(nonce: ByteArray, datum: BankProofDatum) -> Input {
  Input { output_reference: proof_ref, output: proof_output(nonce, datum) }
}

fn guard_tx(nonce: ByteArray, datum: BankProofDatum) -> Transaction {
  Transaction {
    ..base_tx(),
    inputs: [proof_input(nonce, datum)],
    mint: assets.from_asset(membership_policy_id, nonce, -1),
  }
}

// ## Issue

test issue_accepts_a_valid_proof() {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test issue_rejects_a_script_issuer() fail {
  bank_rules.issue(
    script_issuer_config(),
    membership_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test issue_rejects_a_missing_signature() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction {
      ..issue_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      extra_signatories: [],
    },
  )
}

test issue_rejects_a_policy_mismatch() fail {
  bank_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test issue_rejects_a_nonce_mismatch() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_b, issued_at),
    ),
  )
}

test issue_rejects_an_empty_nonce() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(#"", proof_datum(member_a, 2026, 1_000_000, #"", issued_at)),
  )
}

test issue_rejects_a_year_mismatch() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_a, 2025, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test issue_rejects_an_amount_mismatch() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(nonce_a, proof_datum(member_a, 2026, 999_999, nonce_a, issued_at)),
  )
}

test issue_rejects_an_empty_member_id() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(nonce_a, proof_datum(#"", 2026, 1_000_000, nonce_a, issued_at)),
  )
}

test issue_rejects_an_oversized_member_id() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(
      nonce_a,
      proof_datum(member_too_long, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test issue_rejects_an_empty_bank_reference() fail {
  let datum = BankProofDatum {
    ..proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    bank_ref_hash: #"",
  }
  bank_rules.issue(config(), membership_policy_id, issue_tx(nonce_a, datum))
}

test issue_rejects_a_backdated_issue_time() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(nonce_a, proof_datum(member_a, 2026, 1_000_000, nonce_a, 999)),
  )
}

test issue_rejects_a_missing_lower_bound() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction {
      ..issue_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      validity_range: interval.before(2_000),
    },
  )
}

test issue_rejects_an_extra_asset_in_the_proof_box() fail {
  let datum = proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at)
  let output = Output {
    ..proof_output(nonce_a, datum),
    value: assets.add(
      assets.from_asset(membership_policy_id, nonce_a, 1),
      other_policy_id,
      #"02",
      1,
    ),
  }
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction { ..issue_tx(nonce_a, datum), outputs: [output] },
  )
}

test issue_rejects_a_wallet_output() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction {
      ..issue_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      outputs: [wallet_output(nonce_a)],
    },
  )
}

test issue_rejects_an_extra_holder() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction {
      ..issue_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      outputs: [
        proof_output(
          nonce_a,
          proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
        ),
        wallet_output(nonce_a),
      ],
    },
  )
}

test issue_rejects_a_missing_mint() fail {
  bank_rules.issue(
    config(),
    membership_policy_id,
    Transaction {
      ..issue_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      mint: assets.zero,
    },
  )
}

// ## Guard

test guard_accepts_a_burn() {
  bank_rules.guard(
    proof_ref,
    guard_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test guard_rejects_a_spend_without_a_burn() fail {
  bank_rules.guard(
    proof_ref,
    Transaction {
      ..guard_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      mint: assets.zero,
    },
  )
}

test guard_rejects_a_foreign_burn() fail {
  bank_rules.guard(
    proof_ref,
    Transaction {
      ..guard_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      mint: assets.from_asset(membership_policy_id, nonce_b, -1),
    },
  )
}

test guard_rejects_a_box_with_two_tokens() fail {
  let datum = proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at)
  let input = Input {
    ..proof_input(nonce_a, datum),
    output: Output {
      ..proof_output(nonce_a, datum),
      value: assets.add(
        assets.from_asset(membership_policy_id, nonce_a, 1),
        other_policy_id,
        #"02",
        1,
      ),
    },
  }
  bank_rules.guard(
    proof_ref,
    Transaction { ..guard_tx(nonce_a, datum), inputs: [input] },
  )
}

test guard_rejects_a_box_without_a_token() fail {
  let datum = proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at)
  let input = Input {
    output_reference: proof_ref,
    output: Output {
      address: from_script(bank_policy_id),
      value: assets.from_lovelace(5_000_000),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
  bank_rules.guard(
    proof_ref,
    Transaction { ..guard_tx(nonce_a, datum), inputs: [input] },
  )
}

// ## Cancel

test cancel_accepts_a_burn() {
  bank_rules.cancel(
    config(),
    membership_policy_id,
    guard_tx(
      nonce_a,
      proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
    ),
  )
}

test cancel_rejects_a_missing_signature() fail {
  bank_rules.cancel(
    config(),
    membership_policy_id,
    Transaction {
      ..guard_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      extra_signatories: [],
    },
  )
}

test cancel_rejects_a_wallet_source() fail {
  let datum = proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at)
  let input = Input {
    output_reference: proof_ref,
    output: wallet_output(nonce_a),
  }
  bank_rules.cancel(
    config(),
    membership_policy_id,
    Transaction { ..guard_tx(nonce_a, datum), inputs: [input] },
  )
}

test cancel_rejects_a_foreign_burn() fail {
  bank_rules.cancel(
    config(),
    membership_policy_id,
    Transaction {
      ..guard_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      mint: assets.from_asset(membership_policy_id, nonce_b, -1),
    },
  )
}

test cancel_rejects_a_recreated_proof() fail {
  let datum = proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at)
  bank_rules.cancel(
    config(),
    membership_policy_id,
    Transaction {
      ..guard_tx(nonce_a, datum),
      outputs: [proof_output(nonce_a, datum)],
    },
  )
}

test cancel_rejects_a_missing_burn() fail {
  bank_rules.cancel(
    config(),
    membership_policy_id,
    Transaction {
      ..guard_tx(
        nonce_a,
        proof_datum(member_a, 2026, 1_000_000, nonce_a, issued_at),
      ),
      mint: assets.zero,
    },
  )
}
