use aiken/interval
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, placeholder,
}
use sequoia/member_rules
use sequoia/types.{
  Active, BankProofDatum, ConfigDatum, Founder, Inactive, KycDatum, MemberDatum,
  Standard, capital_participation_asset_name, member_capital_asset_name,
}

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const owner_a: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const owner_b: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const board_a: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const board_b: ByteArray =
  #"88888888888888888888888888888888888888888888888888888888"

const board_c: ByteArray =
  #"99999999999999999999999999999999999999999999999999999999"

const tx_id: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const member_a: ByteArray = #"01"

const member_b: ByteArray = #"02"

const member_too_long: ByteArray =
  #"000000000000000000000000000000000000000000000000000000000000000000"

const joined_at: Int = 1_000

const nonce_a: ByteArray = #"0a0b"

const nonce_b: ByteArray = #"0c0d"

const member_ref: OutputReference =
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
    board_keys: [board_a, board_b, board_c],
    board_threshold: 2,
    kyc_issuer: VerificationKey(owner_a),
    bank_issuer: VerificationKey(owner_a),
    network: 0,
    membership_policy: membership_policy_id,
    kyc_policy: kyc_policy_id,
    bank_policy: bank_policy_id,
    governance_policy: bank_policy_id,
    ballot_policy: kyc_policy_id,
    quorum_bps: 5_000,
    project_threshold_bps: 5_001,
    structural_threshold_bps: 6_667,
    timelock_days: 7,
    voting_days: 7,
    reveal_days: 3,
  }
}

fn member_datum(
  member: ByteArray,
  owner: ByteArray,
  joined_at: Int,
) -> MemberDatum {
  MemberDatum {
    owner,
    member_id: member,
    class: Standard,
    status: Active,
    joined_at,
    last_contribution_year: None,
  }
}

fn member_value(
  member: ByteArray,
  member_capital: Int,
  participation: Int,
) -> assets.Assets {
  let base = assets.from_asset(membership_policy_id, member, 1)
  let with_member_capital = assets.add(
    base,
    membership_policy_id,
    member_capital_asset_name,
    member_capital,
  )
  assets.add(
    with_member_capital,
    membership_policy_id,
    capital_participation_asset_name,
    participation,
  )
}

fn member_output(
  member: ByteArray,
  datum: MemberDatum,
  member_capital: Int,
  participation: Int,
) -> Output {
  Output {
    address: from_script(membership_policy_id),
    value: member_value(member, member_capital, participation),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(
  policy_id: ByteArray,
  member: ByteArray,
  member_capital: Int,
  participation: Int,
) -> Output {
  let base = assets.from_asset(policy_id, member, 1)
  let with_member_capital = assets.add(
    base,
    policy_id,
    member_capital_asset_name,
    member_capital,
  )
  Output {
    address: from_verification_key(owner_b),
    value: assets.add(
      with_member_capital,
      policy_id,
      capital_participation_asset_name,
      participation,
    ),
    datum: NoDatum,
    reference_script: None,
  }
}

fn kyc_datum(member: ByteArray, level: Int, expires_at: Int) -> KycDatum {
  KycDatum {
    issuer: owner_a,
    member_id: member,
    commitment: #"aabbcc",
    level,
    issued_at: joined_at,
    expires_at,
  }
}

fn kyc_input_at(
  index: Int,
  member: ByteArray,
  level: Int,
  expires_at: Int,
) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(kyc_policy_id),
      value: assets.from_asset(kyc_policy_id, member, 1),
      datum: InlineDatum(kyc_datum(member, level, expires_at)),
      reference_script: None,
    },
  }
}

fn kyc_input(member: ByteArray) -> Input {
  kyc_input_at(1, member, 1, 5_000)
}

fn join_tx(asset_name: ByteArray, datum: MemberDatum) -> Transaction {
  Transaction {
    ..placeholder,
    reference_inputs: [kyc_input(asset_name)],
    validity_range: interval.between(joined_at, 2_000),
    extra_signatories: [owner_a, board_a, board_b],
    mint: assets.from_asset(membership_policy_id, asset_name, 1),
    outputs: [member_output(asset_name, datum, 0, 0)],
  }
}

fn member_input(
  member: ByteArray,
  datum: MemberDatum,
  member_capital: Int,
  participation: Int,
) -> Input {
  Input {
    output_reference: member_ref,
    output: member_output(member, datum, member_capital, participation),
  }
}

fn transfer_tx(
  old_datum: MemberDatum,
  new_datum: MemberDatum,
  member_capital_in: Int,
  participation_in: Int,
  member_capital_out: Int,
  participation_out: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [
      member_input(member_a, old_datum, member_capital_in, participation_in),
    ],
    outputs: [
      member_output(member_a, new_datum, member_capital_out, participation_out),
    ],
    extra_signatories: [owner_a],
  }
}

fn straight_transfer(old_datum: MemberDatum) -> Transaction {
  transfer_tx(old_datum, old_datum, 5, 2, 5, 2)
}

// ## Join

test join_accepts_a_standard_member() {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
  )
}

test join_accepts_a_founder() {
  let datum = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    class: Founder,
  }
  member_rules.join(config(), membership_policy_id, join_tx(member_a, datum))
}

test join_rejects_a_board_below_threshold() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      extra_signatories: [owner_a, board_a],
    },
  )
}

test join_rejects_a_zero_threshold() fail {
  let config = ConfigDatum { ..config(), board_threshold: 0 }
  member_rules.join(
    config,
    membership_policy_id,
    join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
  )
}

test join_rejects_a_missing_owner_signature() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      extra_signatories: [board_a, board_b],
    },
  )
}

test join_rejects_an_expired_kyc() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      reference_inputs: [kyc_input_at(1, member_a, 1, joined_at)],
    },
  )
}

test join_rejects_a_kyc_level_below_one() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      reference_inputs: [kyc_input_at(1, member_a, 0, 5_000)],
    },
  )
}

test join_rejects_a_kyc_member_id_mismatch() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      reference_inputs: [kyc_input(member_b)],
    },
  )
}

test join_rejects_a_missing_kyc() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      reference_inputs: [],
    },
  )
}

test join_rejects_a_kyc_box_at_a_wallet() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      reference_inputs: [
        Input {
          output_reference: ref(1),
          output: wallet_output(kyc_policy_id, member_a, 0, 0),
        },
      ],
    },
  )
}

test join_rejects_a_wrong_config_policy() fail {
  member_rules.join(
    config(),
    bank_policy_id,
    join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
  )
}

test join_rejects_a_datum_member_id_mismatch() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(member_a, member_datum(member_b, owner_a, joined_at)),
  )
}

test join_rejects_a_wallet_output() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      outputs: [wallet_output(membership_policy_id, member_a, 0, 0)],
    },
  )
}

test join_rejects_an_extra_asset_in_the_member_box() fail {
  let datum = member_datum(member_a, owner_a, joined_at)
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, datum),
      outputs: [member_output(member_a, datum, 5, 0)],
    },
  )
}

test join_rejects_a_piggybacked_mint() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      mint: assets.from_asset_list(
        [
          Pair(
            membership_policy_id,
            [Pair(member_a, 1), Pair(member_capital_asset_name, 5)],
          ),
        ],
      ),
    },
  )
}

test join_rejects_a_reserved_member_id() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(
      member_capital_asset_name,
      member_datum(member_capital_asset_name, owner_a, joined_at),
    ),
  )
}

test join_rejects_an_empty_member_id() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(#"", member_datum(#"", owner_a, joined_at)),
  )
}

test join_rejects_an_overlong_member_id() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(member_too_long, member_datum(member_too_long, owner_a, joined_at)),
  )
}

test join_rejects_a_non_active_status() fail {
  let datum = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    status: Inactive,
  }
  member_rules.join(config(), membership_policy_id, join_tx(member_a, datum))
}

test join_rejects_a_backdated_join_time() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    join_tx(member_a, member_datum(member_a, owner_a, 999)),
  )
}

test join_rejects_a_contribution_year() fail {
  let datum = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    last_contribution_year: Some(2026),
  }
  member_rules.join(config(), membership_policy_id, join_tx(member_a, datum))
}

test join_rejects_a_missing_lower_bound() fail {
  member_rules.join(
    config(),
    membership_policy_id,
    Transaction {
      ..join_tx(member_a, member_datum(member_a, owner_a, joined_at)),
      validity_range: interval.before(2_000),
    },
  )
}

// ## Transfer

test transfer_accepts_an_unchanged_box() {
  member_rules.transfer(
    member_ref,
    straight_transfer(member_datum(member_a, owner_a, joined_at)),
  )
}

test transfer_rejects_a_missing_owner_signature() fail {
  member_rules.transfer(
    member_ref,
    Transaction {
      ..straight_transfer(member_datum(member_a, owner_a, joined_at)),
      extra_signatories: [owner_b],
    },
  )
}

test transfer_rejects_a_changed_owner() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.transfer(
    member_ref,
    transfer_tx(old, member_datum(member_a, owner_b, joined_at), 5, 2, 5, 2),
  )
}

test transfer_rejects_a_changed_class() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..old, class: Founder }
  member_rules.transfer(member_ref, transfer_tx(old, new, 5, 2, 5, 2))
}

test transfer_rejects_a_changed_join_time() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.transfer(
    member_ref,
    transfer_tx(old, member_datum(member_a, owner_a, 999), 5, 2, 5, 2),
  )
}

test transfer_rejects_a_changed_status() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..old, status: Inactive }
  member_rules.transfer(member_ref, transfer_tx(old, new, 5, 2, 5, 2))
}

test transfer_rejects_a_changed_contribution_year() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..old, last_contribution_year: Some(2026) }
  member_rules.transfer(member_ref, transfer_tx(old, new, 5, 2, 5, 2))
}

test transfer_rejects_a_wallet_output() fail {
  member_rules.transfer(
    member_ref,
    Transaction {
      ..straight_transfer(member_datum(member_a, owner_a, joined_at)),
      outputs: [wallet_output(membership_policy_id, member_a, 5, 2)],
    },
  )
}

test transfer_rejects_a_lost_member_capital() fail {
  member_rules.transfer(
    member_ref,
    transfer_tx(
      member_datum(member_a, owner_a, joined_at),
      member_datum(member_a, owner_a, joined_at),
      5,
      2,
      0,
      2,
    ),
  )
}

test transfer_rejects_a_lost_participation() fail {
  member_rules.transfer(
    member_ref,
    transfer_tx(
      member_datum(member_a, owner_a, joined_at),
      member_datum(member_a, owner_a, joined_at),
      5,
      2,
      5,
      0,
    ),
  )
}

test transfer_rejects_tokens_in_another_output() fail {
  member_rules.transfer(
    member_ref,
    Transaction {
      ..straight_transfer(member_datum(member_a, owner_a, joined_at)),
      outputs: [
        member_output(
          member_a,
          member_datum(member_a, owner_a, joined_at),
          5,
          0,
        ),
        wallet_output(membership_policy_id, member_a, 0, 2),
      ],
    },
  )
}

test transfer_rejects_a_second_member_copy() fail {
  member_rules.transfer(
    member_ref,
    Transaction {
      ..straight_transfer(member_datum(member_a, owner_a, joined_at)),
      outputs: [
        member_output(
          member_a,
          member_datum(member_a, owner_a, joined_at),
          5,
          2,
        ),
        member_output(
          member_a,
          member_datum(member_a, owner_a, joined_at),
          0,
          0,
        ),
      ],
    },
  )
}

test transfer_rejects_a_member_id_mismatch() fail {
  member_rules.transfer(
    member_ref,
    transfer_tx(
      member_datum(member_b, owner_a, joined_at),
      member_datum(member_b, owner_a, joined_at),
      0,
      0,
      0,
      0,
    ),
  )
}

test transfer_rejects_a_box_at_a_wallet() fail {
  member_rules.transfer(
    member_ref,
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: member_ref,
          output: wallet_output(membership_policy_id, member_a, 0, 0),
        },
      ],
      outputs: [
        member_output(
          member_a,
          member_datum(member_a, owner_a, joined_at),
          0,
          0,
        ),
      ],
      extra_signatories: [owner_a],
    },
  )
}

// ## Contribute

fn proof_datum(
  member: ByteArray,
  year: Int,
  amount: Int,
  nonce: ByteArray,
) -> BankProofDatum {
  BankProofDatum {
    issuer: owner_b,
    member_id: member,
    contribution_year: year,
    amount,
    bank_ref_hash: #"cc",
    nonce,
    issued_at: joined_at,
  }
}

fn proof_input_with(
  member: ByteArray,
  year: Int,
  amount: Int,
  nonce: ByteArray,
) -> Input {
  Input {
    output_reference: ref(20),
    output: Output {
      address: from_script(bank_policy_id),
      value: assets.from_asset(membership_policy_id, nonce, 1),
      datum: InlineDatum(proof_datum(member, year, amount, nonce)),
      reference_script: None,
    },
  }
}

fn proof_input(member: ByteArray) -> Input {
  proof_input_with(member, 2026, 1_000_000, nonce_a)
}

fn contribution_mint(
  nonce: ByteArray,
  member_capital: Int,
  participation: Int,
) -> assets.Assets {
  assets.from_asset_list(
    [
      Pair(
        membership_policy_id,
        [
          Pair(nonce, -1),
          Pair(member_capital_asset_name, member_capital),
          Pair(capital_participation_asset_name, participation),
        ],
      ),
    ],
  )
}

fn proof_nonce(proof: Input) -> ByteArray {
  when proof.output.datum is {
    InlineDatum(raw) -> {
      expect datum: BankProofDatum = raw
      datum.nonce
    }
    _ -> fail @"test: proof datum must be inline"
  }
}

fn contribution_tx_with(
  old_datum: MemberDatum,
  new_datum: MemberDatum,
  proof: Input,
  mint: assets.Assets,
  member_capital: Int,
  participation: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [member_input(member_a, old_datum, 0, 0), proof],
    reference_inputs: [kyc_input(member_a)],
    validity_range: interval.between(joined_at, 2_000),
    outputs: [member_output(member_a, new_datum, member_capital, participation)],
    extra_signatories: [owner_a],
    mint,
  }
}

fn contribution_tx(
  old_datum: MemberDatum,
  new_datum: MemberDatum,
  proof: Input,
  member_capital: Int,
  participation: Int,
) -> Transaction {
  contribution_tx_with(
    old_datum,
    new_datum,
    proof,
    contribution_mint(proof_nonce(proof), member_capital, participation),
    member_capital,
    participation,
  )
}

fn contributed(old_datum: MemberDatum) -> MemberDatum {
  MemberDatum { ..old_datum, last_contribution_year: Some(2026) }
}

fn standard_contribution() -> Transaction {
  let old = member_datum(member_a, owner_a, joined_at)
  contribution_tx(
    old,
    contributed(old),
    proof_input(member_a),
    700_000,
    300_000,
  )
}

fn leaked_output(participation: Int) -> Output {
  Output {
    address: from_verification_key(owner_b),
    value: assets.from_asset(
      membership_policy_id,
      capital_participation_asset_name,
      participation,
    ),
    datum: NoDatum,
    reference_script: None,
  }
}

test contribution_accepts_a_matching_proof() {
  let tx = standard_contribution()
  member_rules.contribute_mint(config(), membership_policy_id, tx) && member_rules.contribute_spend(
    config(),
    member_ref,
    tx,
  )
}

test contribution_floors_member_capital() {
  let config = ConfigDatum { ..config(), annual_amount: 1_000_001 }
  let old = member_datum(member_a, owner_a, joined_at)
  let tx = contribution_tx(
    old,
    contributed(old),
    proof_input_with(member_a, 2026, 1_000_001, nonce_a),
    700_000,
    300_001,
  )
  member_rules.contribute_mint(config, membership_policy_id, tx)
}

test contribution_rejects_a_standard_split_over_the_cap() fail {
  let config = ConfigDatum {
    ..config(),
    member_capital_bps: 4_000,
    capital_participation_bps: 6_000,
  }
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config,
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input(member_a),
      400_000,
      600_000,
    ),
  )
}

test contribution_accepts_a_founder_split_over_the_cap() {
  let config = ConfigDatum {
    ..config(),
    member_capital_bps: 4_000,
    capital_participation_bps: 6_000,
  }
  let old = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    class: Founder,
  }
  member_rules.contribute_mint(
    config,
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input(member_a),
      400_000,
      600_000,
    ),
  )
}

test contribution_rejects_a_wrong_year() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input_with(member_a, 2025, 1_000_000, nonce_a),
      700_000,
      300_000,
    ),
  )
}

test contribution_rejects_a_wrong_amount() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input_with(member_a, 2026, 999_999, nonce_a),
      700_000,
      300_000,
    ),
  )
}

test contribution_rejects_a_second_contribution() fail {
  let old = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    last_contribution_year: Some(2026),
  }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, old, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_an_inactive_member() fail {
  let old = MemberDatum {
    ..member_datum(member_a, owner_a, joined_at),
    status: Inactive,
  }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input(member_a),
      700_000,
      300_000,
    ),
  )
}

test contribution_rejects_a_missing_owner_signature() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction { ..standard_contribution(), extra_signatories: [owner_b] },
  )
}

test contribution_rejects_a_missing_proof() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      inputs: [
        member_input(member_a, member_datum(member_a, owner_a, joined_at), 0, 0),
      ],
    },
  )
}

test contribution_rejects_a_missing_burn() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      mint: assets.from_asset_list(
        [
          Pair(
            membership_policy_id,
            [
              Pair(member_capital_asset_name, 700_000),
              Pair(capital_participation_asset_name, 300_000),
            ],
          ),
        ],
      ),
    },
  )
}

test contribution_rejects_a_foreign_burn() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      mint: assets.from_asset_list(
        [
          Pair(
            membership_policy_id,
            [
              Pair(nonce_b, -1),
              Pair(member_capital_asset_name, 700_000),
              Pair(capital_participation_asset_name, 300_000),
            ],
          ),
        ],
      ),
    },
  )
}

test contribution_rejects_an_extra_mint() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      mint: assets.from_asset_list(
        [
          Pair(
            membership_policy_id,
            [
              Pair(member_b, 1),
              Pair(nonce_a, -1),
              Pair(member_capital_asset_name, 700_000),
              Pair(capital_participation_asset_name, 300_000),
            ],
          ),
        ],
      ),
    },
  )
}

test contribution_rejects_a_split_mismatch() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input(member_a),
      700_001,
      300_000,
    ),
  )
}

test contribution_rejects_an_expired_kyc() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      reference_inputs: [kyc_input_at(1, member_a, 1, joined_at)],
    },
  )
}

test contribution_rejects_a_kyc_member_id_mismatch() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      reference_inputs: [kyc_input(member_b)],
    },
  )
}

test contribution_rejects_a_changed_owner() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..contributed(old), owner: owner_b }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, new, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_a_changed_class() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..contributed(old), class: Founder }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, new, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_a_changed_status() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..contributed(old), status: Inactive }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, new, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_a_changed_join_time() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  let new = MemberDatum { ..contributed(old), joined_at: 999 }
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, new, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_a_missing_year_update() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, old, proof_input(member_a), 700_000, 300_000),
  )
}

test contribution_rejects_lost_participation() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(old, contributed(old), proof_input(member_a), 700_000, 0),
  )
}

test contribution_rejects_tokens_in_another_output() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      outputs: [
        member_output(
          member_a,
          contributed(member_datum(member_a, owner_a, joined_at)),
          700_000,
          0,
        ),
        leaked_output(300_000),
      ],
    },
  )
}

test contribution_rejects_a_member_id_nonce() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx(
      old,
      contributed(old),
      proof_input_with(member_a, 2026, 1_000_000, member_a),
      700_000,
      300_000,
    ),
  )
}

test contribution_rejects_a_reserved_nonce() fail {
  let old = member_datum(member_a, owner_a, joined_at)
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    contribution_tx_with(
      old,
      contributed(old),
      proof_input_with(member_a, 2026, 1_000_000, member_capital_asset_name),
      assets.from_asset(membership_policy_id, member_capital_asset_name, -1),
      700_000,
      300_000,
    ),
  )
}

test contribution_spend_rejects_a_foreign_box() fail {
  member_rules.contribute_spend(config(), ref(99), standard_contribution())
}

test contribution_spend_rejects_another_members_proof() fail {
  member_rules.contribute_spend(
    config(),
    member_ref,
    Transaction {
      ..standard_contribution(),
      inputs: [
        member_input(member_a, member_datum(member_a, owner_a, joined_at), 0, 0),
        proof_input(member_b),
      ],
    },
  )
}

test contribution_rejects_a_proof_at_a_wallet() fail {
  member_rules.contribute_mint(
    config(),
    membership_policy_id,
    Transaction {
      ..standard_contribution(),
      inputs: [
        member_input(member_a, member_datum(member_a, owner_a, joined_at), 0, 0),
        Input {
          output_reference: ref(20),
          output: Output {
            address: from_verification_key(owner_b),
            value: assets.from_asset(membership_policy_id, nonce_a, 1),
            datum: InlineDatum(proof_datum(member_a, 2026, 1_000_000, nonce_a)),
            reference_script: None,
          },
        },
      ],
    },
  )
}
