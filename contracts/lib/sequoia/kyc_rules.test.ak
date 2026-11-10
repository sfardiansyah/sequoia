use aiken/interval
use cardano/address.{
  Script, VerificationKey, from_script, from_verification_key,
}
use cardano/assets
use cardano/transaction.{
  Datum, InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
  placeholder,
}
use sequoia/kyc_rules
use sequoia/types.{ConfigDatum, KycDatum}

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const issuer_hash: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const other_key: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const tx_id: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const member_a: ByteArray = #"01"

const member_b: ByteArray = #"02"

const issued_at: Int = 1_000

const old_ref: OutputReference =
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
    kyc_issuer: VerificationKey(issuer_hash),
    bank_issuer: VerificationKey(issuer_hash),
    network: 0,
    membership_policy: membership_policy_id,
    kyc_policy: kyc_policy_id,
    bank_policy: bank_policy_id,
  }
}

fn script_issuer_config() -> ConfigDatum {
  ConfigDatum { ..config(), kyc_issuer: Script(issuer_hash) }
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

fn kyc_output(asset_name: ByteArray, datum: KycDatum) -> Output {
  Output {
    address: from_script(kyc_policy_id),
    value: assets.from_asset(kyc_policy_id, asset_name, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(asset_name: ByteArray) -> Output {
  Output {
    address: from_verification_key(other_key),
    value: assets.from_asset(kyc_policy_id, asset_name, 1),
    datum: NoDatum,
    reference_script: None,
  }
}

fn kyc_datum(
  member: ByteArray,
  level: Int,
  issued_at: Int,
  expires_at: Int,
) -> KycDatum {
  KycDatum {
    issuer: issuer_hash,
    member_id: member,
    commitment: #"aabbcc",
    level,
    issued_at,
    expires_at,
  }
}

fn base_tx() -> Transaction {
  Transaction {
    ..placeholder,
    reference_inputs: [config_input()],
    validity_range: interval.between(1_000, 2_000),
    extra_signatories: [issuer_hash],
  }
}

fn issue_tx(asset_name: ByteArray, datum: KycDatum) -> Transaction {
  Transaction {
    ..base_tx(),
    mint: assets.from_asset(kyc_policy_id, asset_name, 1),
    outputs: [kyc_output(asset_name, datum)],
  }
}

fn kyc_input(asset_name: ByteArray, datum: KycDatum) -> Input {
  Input { output_reference: ref(10), output: kyc_output(asset_name, datum) }
}

fn renew_tx(
  asset_name: ByteArray,
  old_datum: KycDatum,
  new_datum: KycDatum,
) -> Transaction {
  Transaction {
    ..base_tx(),
    inputs: [kyc_input(asset_name, old_datum)],
    outputs: [kyc_output(asset_name, new_datum)],
  }
}

fn revoke_tx(asset_name: ByteArray, datum: KycDatum) -> Transaction {
  Transaction {
    ..base_tx(),
    inputs: [kyc_input(asset_name, datum)],
    mint: assets.from_asset(kyc_policy_id, asset_name, -1),
  }
}

// ## Issue

test issue_accepts_a_valid_attestation() {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
  )
}

test issue_rejects_a_member_id_mismatch() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_b, 1, issued_at, 5_000)),
  )
}

test issue_rejects_a_level_below_one() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 0, issued_at, 5_000)),
  )
}

test issue_rejects_an_empty_commitment() fail {
  let datum = KycDatum {
    ..kyc_datum(member_a, 1, issued_at, 5_000),
    commitment: #"",
  }
  kyc_rules.issue(config(), kyc_policy_id, issue_tx(member_a, datum))
}

test issue_rejects_a_backdated_issue_time() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 1, 999, 5_000)),
  )
}

test issue_rejects_an_expiry_at_issue_time() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 1, issued_at, issued_at)),
  )
}

test issue_rejects_a_script_issuer() fail {
  kyc_rules.issue(
    script_issuer_config(),
    kyc_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
  )
}

test issue_rejects_a_missing_signature() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    Transaction {
      ..issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
      extra_signatories: [],
    },
  )
}

test issue_rejects_a_mismatched_config_policy() fail {
  kyc_rules.issue(
    config(),
    membership_policy_id,
    issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
  )
}

test issue_rejects_a_wallet_output() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    Transaction {
      ..issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
      outputs: [wallet_output(member_a)],
    },
  )
}

test issue_rejects_an_extra_holder() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    Transaction {
      ..issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
      outputs: [
        kyc_output(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
        wallet_output(member_a),
      ],
    },
  )
}

test issue_rejects_a_missing_mint() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    Transaction {
      ..issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
      mint: assets.zero,
    },
  )
}

test issue_rejects_a_missing_lower_bound() fail {
  kyc_rules.issue(
    config(),
    kyc_policy_id,
    Transaction {
      ..issue_tx(member_a, kyc_datum(member_a, 1, issued_at, 5_000)),
      validity_range: interval.before(2_000),
    },
  )
}

// ## Renew

test renew_accepts_a_later_expiry() {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    renew_tx(
      member_a,
      kyc_datum(member_a, 1, issued_at, 5_000),
      kyc_datum(member_a, 2, issued_at, 6_000),
    ),
  )
}

test renew_accepts_an_expired_record() {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, 500, 900),
    renew_tx(
      member_a,
      kyc_datum(member_a, 1, 500, 900),
      kyc_datum(member_a, 1, issued_at, 6_000),
    ),
  )
}

test renew_rejects_a_changed_member_id() fail {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    renew_tx(
      member_a,
      kyc_datum(member_a, 1, issued_at, 5_000),
      kyc_datum(member_b, 1, issued_at, 6_000),
    ),
  )
}

test renew_rejects_a_non_later_expiry() fail {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    renew_tx(
      member_a,
      kyc_datum(member_a, 1, issued_at, 5_000),
      kyc_datum(member_a, 1, issued_at, 5_000),
    ),
  )
}

test renew_rejects_a_missing_replacement() fail {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    Transaction {
      ..renew_tx(
        member_a,
        kyc_datum(member_a, 1, issued_at, 5_000),
        kyc_datum(member_a, 1, issued_at, 6_000),
      ),
      outputs: [],
    },
  )
}

test renew_rejects_a_wallet_replacement() fail {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    Transaction {
      ..renew_tx(
        member_a,
        kyc_datum(member_a, 1, issued_at, 5_000),
        kyc_datum(member_a, 1, issued_at, 6_000),
      ),
      outputs: [wallet_output(member_a)],
    },
  )
}

test renew_rejects_a_missing_signature() fail {
  kyc_rules.renew(
    config(),
    old_ref,
    kyc_datum(member_a, 1, issued_at, 5_000),
    Transaction {
      ..renew_tx(
        member_a,
        kyc_datum(member_a, 1, issued_at, 5_000),
        kyc_datum(member_a, 1, issued_at, 6_000),
      ),
      extra_signatories: [],
    },
  )
}

test renew_rejects_a_foreign_record() fail {
  let old = KycDatum {
    ..kyc_datum(member_a, 1, issued_at, 5_000),
    issuer: other_key,
  }
  kyc_rules.renew(
    config(),
    old_ref,
    old,
    renew_tx(member_a, old, kyc_datum(member_a, 1, issued_at, 6_000)),
  )
}

// ## Revoke

test revoke_accepts_a_burn() {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  let tx = revoke_tx(member_a, datum)
  kyc_rules.revoke(config(), old_ref, datum, tx) && kyc_rules.revoke_mint(
    config(),
    kyc_policy_id,
    tx,
  )
}

test revoke_rejects_a_missing_signature() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke(
    config(),
    old_ref,
    datum,
    Transaction { ..revoke_tx(member_a, datum), extra_signatories: [] },
  )
}

test revoke_mint_rejects_a_missing_signature() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke_mint(
    config(),
    kyc_policy_id,
    Transaction { ..revoke_tx(member_a, datum), extra_signatories: [] },
  )
}

test revoke_rejects_a_recreated_box() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke(
    config(),
    old_ref,
    datum,
    Transaction {
      ..revoke_tx(member_a, datum),
      outputs: [kyc_output(member_a, datum)],
    },
  )
}

test revoke_mint_rejects_a_recreated_box() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke_mint(
    config(),
    kyc_policy_id,
    Transaction {
      ..revoke_tx(member_a, datum),
      outputs: [kyc_output(member_a, datum)],
    },
  )
}

test revoke_rejects_a_missing_burn() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke(
    config(),
    old_ref,
    datum,
    Transaction { ..revoke_tx(member_a, datum), mint: assets.zero },
  )
}

test revoke_mint_rejects_a_wrong_burn() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke_mint(
    config(),
    kyc_policy_id,
    Transaction {
      ..revoke_tx(member_a, datum),
      mint: assets.from_asset(kyc_policy_id, member_b, -1),
    },
  )
}

test revoke_mint_rejects_a_box_at_a_wallet() fail {
  let datum = kyc_datum(member_a, 1, issued_at, 5_000)
  kyc_rules.revoke_mint(
    config(),
    kyc_policy_id,
    Transaction {
      ..revoke_tx(member_a, datum),
      inputs: [
        Input { output_reference: ref(10), output: wallet_output(member_a) },
      ],
    },
  )
}

test revoke_rejects_a_foreign_record() fail {
  let datum = KycDatum {
    ..kyc_datum(member_a, 1, issued_at, 5_000),
    issuer: other_key,
  }
  kyc_rules.revoke(config(), old_ref, datum, revoke_tx(member_a, datum))
}
