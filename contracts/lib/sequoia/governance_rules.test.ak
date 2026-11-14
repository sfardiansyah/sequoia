use aiken/interval
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/governance_rules
use sequoia/types.{
  Active, Config, ConfigDatum, Inactive, KycDatum, MemberDatum, Open, Passed,
  ProposalDatum, Standard,
}
use sequoia/voting

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const kyc_policy_id: ByteArray =
  #"22222222222222222222222222222222222222222222222222222222"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const governance_policy_id: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const ballot_policy_id: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const owner_a: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const owner_b: ByteArray =
  #"88888888888888888888888888888888888888888888888888888888"

const board_a: ByteArray =
  #"99999999999999999999999999999999999999999999999999999999"

const board_b: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const board_c: ByteArray =
  #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const tx_id: ByteArray =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const member_a: ByteArray = #"01"

const proposal_id: ByteArray =
  #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

const leaf_a: ByteArray =
  #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

const leaf_b: ByteArray =
  #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

const joined_at: Int = 1_000

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

fn member_datum() -> MemberDatum {
  MemberDatum {
    owner: owner_a,
    member_id: member_a,
    class: Standard,
    status: Active,
    joined_at,
    last_contribution_year: None,
  }
}

fn kyc_datum(expires_at: Int) -> KycDatum {
  KycDatum {
    issuer: owner_a,
    member_id: member_a,
    commitment: #"aabbcc",
    level: 1,
    issued_at: joined_at,
    expires_at,
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

fn member_input(datum: MemberDatum) -> Input {
  Input {
    output_reference: ref(1),
    output: Output {
      address: from_script(membership_policy_id),
      value: assets.from_asset(membership_policy_id, datum.member_id, 1),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

fn kyc_input(expires_at: Int) -> Input {
  Input {
    output_reference: ref(2),
    output: Output {
      address: from_script(kyc_policy_id),
      value: assets.from_asset(kyc_policy_id, member_a, 1),
      datum: InlineDatum(kyc_datum(expires_at)),
      reference_script: None,
    },
  }
}

fn proposal_output(datum: ProposalDatum) -> Output {
  Output {
    address: from_script(governance_policy_id),
    value: assets.from_asset(governance_policy_id, datum.id, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(datum: ProposalDatum) -> Output {
  Output {
    address: from_verification_key(owner_b),
    value: assets.from_asset(governance_policy_id, datum.id, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn proposal_datum() -> ProposalDatum {
  let end = voting.end_of_voting(joined_at, 7)
  ProposalDatum {
    id: proposal_id,
    proposer: owner_a,
    kind: Config,
    proposed_config: config(),
    eligible_leaves: [leaf_a, leaf_b],
    start: joined_at,
    end,
    reveal_end: voting.end_of_reveal(end, 3),
    nullifiers: [],
    discarded: 0,
    tallied: 0,
    yes: 0,
    no: 0,
    abstain: 0,
    status: Open,
    finalized_at: None,
  }
}

fn create_tx(datum: ProposalDatum) -> Transaction {
  Transaction {
    ..placeholder,
    reference_inputs: [
      config_input(),
      member_input(member_datum()),
      kyc_input(5_000),
    ],
    validity_range: interval.between(joined_at, joined_at + 1_000),
    extra_signatories: [owner_a, board_a, board_b],
    mint: assets.from_asset(governance_policy_id, datum.id, 1),
    outputs: [proposal_output(datum)],
  }
}

test create_proposal_accepts_a_board_signed_proposal() {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(proposal_datum()),
  )
}

test create_proposal_rejects_a_single_board_signature() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    extra_signatories: [owner_a, board_a],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_a_non_member_proposer() fail {
  let datum = ProposalDatum { ..proposal_datum(), proposer: owner_b }
  let tx = Transaction {
    ..create_tx(datum),
    extra_signatories: [owner_b, board_a, board_b],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_an_inactive_member() fail {
  let datum = member_datum()
  let member = MemberDatum { ..datum, status: Inactive }
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    reference_inputs: [config_input(), member_input(member), kyc_input(5_000)],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_a_missing_kyc() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    reference_inputs: [config_input(), member_input(member_datum())],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_an_expired_kyc() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    reference_inputs: [
      config_input(),
      member_input(member_datum()),
      kyc_input(joined_at + 1_000),
    ],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_an_empty_leaf_list() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(ProposalDatum { ..proposal_datum(), eligible_leaves: [] }),
  )
}

test create_proposal_rejects_a_short_leaf() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(
      ProposalDatum { ..proposal_datum(), eligible_leaves: [leaf_a, #"01"] },
    ),
  )
}

test create_proposal_accepts_a_window_of_exactly_one_hour() {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    reference_inputs: [
      config_input(),
      member_input(member_datum()),
      kyc_input(joined_at + voting.max_window_ms + 1),
    ],
    validity_range: interval.between(
      joined_at,
      joined_at + voting.max_window_ms,
    ),
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_a_window_over_one_hour() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    validity_range: interval.between(
      joined_at,
      joined_at + voting.max_window_ms + 1,
    ),
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_a_wrong_start() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(ProposalDatum { ..proposal_datum(), start: joined_at + 1 }),
  )
}

test create_proposal_rejects_a_wrong_voting_end() fail {
  let datum = proposal_datum()
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(ProposalDatum { ..datum, end: datum.end + 1 }),
  )
}

test create_proposal_rejects_a_wrong_reveal_end() fail {
  let datum = proposal_datum()
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(ProposalDatum { ..datum, reveal_end: datum.reveal_end + 1 }),
  )
}

test create_proposal_rejects_a_finalized_proposal() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(
      ProposalDatum {
        ..proposal_datum(),
        status: Passed,
        finalized_at: Some(joined_at),
      },
    ),
  )
}

test create_proposal_rejects_a_nonempty_nullifier_list() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(ProposalDatum { ..proposal_datum(), nullifiers: [leaf_a] }),
  )
}

test create_proposal_rejects_an_immutable_config_change() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(
      ProposalDatum {
        ..proposal_datum(),
        proposed_config: ConfigDatum { ..config(), network: 1 },
      },
    ),
  )
}

test create_proposal_rejects_a_config_that_breaks_an_invariant() fail {
  governance_rules.create_proposal(
    config(),
    governance_policy_id,
    create_tx(
      ProposalDatum {
        ..proposal_datum(),
        proposed_config: ConfigDatum { ..config(), member_capital_bps: 6_000 },
      },
    ),
  )
}

test create_proposal_rejects_a_wrong_governance_policy() fail {
  let config = ConfigDatum { ..config(), governance_policy: state_policy_id }
  governance_rules.create_proposal(
    config,
    governance_policy_id,
    create_tx(proposal_datum()),
  )
}

test create_proposal_rejects_a_short_proposal_id() fail {
  let id = #"dd"
  let datum = ProposalDatum { ..proposal_datum(), id }
  let tx = Transaction {
    ..create_tx(datum),
    mint: assets.from_asset(governance_policy_id, id, 1),
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_a_wrong_mint_quantity() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    mint: assets.from_asset(governance_policy_id, proposal_id, 2),
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test create_proposal_rejects_an_output_at_a_wallet() fail {
  let tx = Transaction {
    ..create_tx(proposal_datum()),
    outputs: [wallet_output(proposal_datum())],
  }
  governance_rules.create_proposal(config(), governance_policy_id, tx)
}

test keep_proposal_accepts_unchanged_identity() {
  governance_rules.keep_proposal(proposal_datum(), proposal_datum())
}

test keep_proposal_rejects_changed_identity() {
  let old = proposal_datum()
  and {
    !governance_rules.keep_proposal(
      old,
      ProposalDatum {
        ..old,
        proposed_config: ConfigDatum { ..config(), annual_amount: 2_000_000 },
      },
    ),
    !governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, eligible_leaves: [leaf_a] },
    ),
    !governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, proposer: owner_b },
    ),
    !governance_rules.keep_proposal(
      old,
      ProposalDatum {
        ..old,
        id: #"abababababababababababababababababababababababababababababababab",
      },
    ),
    !governance_rules.keep_proposal(old, ProposalDatum { ..old, start: 0 }),
    !governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, end: old.end + 1 },
    ),
    !governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, reveal_end: old.reveal_end + 1 },
    ),
  }
}

test keep_proposal_leaves_action_fields_to_the_action() {
  let old = proposal_datum()
  and {
    governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, nullifiers: [leaf_a] },
    ),
    governance_rules.keep_proposal(old, ProposalDatum { ..old, tallied: 1 }),
    governance_rules.keep_proposal(old, ProposalDatum { ..old, discarded: 1 }),
    governance_rules.keep_proposal(old, ProposalDatum { ..old, status: Passed }),
    governance_rules.keep_proposal(
      old,
      ProposalDatum { ..old, finalized_at: Some(joined_at) },
    ),
  }
}
