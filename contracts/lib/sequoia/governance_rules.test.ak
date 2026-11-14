use aiken/collection/list
use aiken/interval
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/governance_rules
use sequoia/types.{
  Active, Config, ConfigDatum, Executed, Inactive, KycDatum, MemberDatum, No,
  Open, Passed, ProposalDatum, Rejected, Standard, VoteDatum, Yes,
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

const nullifier_a: ByteArray =
  #"1212121212121212121212121212121212121212121212121212121212121212"

const nullifier_b: ByteArray =
  #"1313131313131313131313131313131313131313131313131313131313131313"

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

fn proposal_input(datum: ProposalDatum) -> Input {
  Input {
    output_reference: ref(3),
    output: Output {
      address: from_script(governance_policy_id),
      value: assets.from_asset(governance_policy_id, datum.id, 1),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

fn vote_datum(id: ByteArray) -> VoteDatum {
  VoteDatum {
    proposal_id: id,
    end: proposal_datum().end,
    reveal_end: proposal_datum().reveal_end,
    choice_commitment: #"3434343434343434343434343434343434343434343434343434343434343434",
    revealed: None,
  }
}

fn ballot_input(vote: VoteDatum, index: Int) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(ballot_policy_id),
      value: assets.from_asset(ballot_policy_id, nullifier_a, 1),
      datum: InlineDatum(vote),
      reference_script: None,
    },
  }
}

fn cast_tx(
  old: ProposalDatum,
  new: ProposalDatum,
  nullifier: ByteArray,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(old)],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: assets.from_asset(ballot_policy_id, nullifier, 1),
    outputs: [proposal_output(new)],
  }
}

fn discard_tx(
  old: ProposalDatum,
  new: ProposalDatum,
  ballots: List<Input>,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(old), ..ballots],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: assets.from_asset(ballot_policy_id, nullifier_a, -1),
    outputs: [proposal_output(new)],
  }
}

test cast_accepts_a_valid_ballot() {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a] }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
  )
}

test cast_rejects_a_ballot_after_end_with_a_stale_lower_bound() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a] }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.end - 1_000, old.end + 1),
  )
}

test cast_rejects_a_ballot_before_start() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a] }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start - 1_000, old.start + 1_000),
  )
}

test cast_rejects_a_duplicate_nullifier() fail {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a, nullifier_a] }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
  )
}

test cast_rejects_a_changed_counter() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a], discarded: 1 }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
  )
}

test cast_rejects_a_changed_status() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a], status: Passed }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
  )
}

test cast_rejects_a_changed_proposed_config() fail {
  let old = proposal_datum()
  let new = ProposalDatum {
    ..old,
    nullifiers: [nullifier_a],
    proposed_config: ConfigDatum { ..config(), annual_amount: 2_000_000 },
  }
  governance_rules.cast(
    config(),
    ref(3),
    cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
  )
}

test cast_rejects_a_wrong_mint_quantity() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, nullifiers: [nullifier_a] }
  let tx = Transaction {
    ..cast_tx(old, new, nullifier_a, old.start, old.start + 1_000),
    mint: assets.from_asset(ballot_policy_id, nullifier_a, 2),
  }
  governance_rules.cast(config(), ref(3), tx)
}

test discard_accepts_one_unrevealed_ballot() {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(old.id), 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_discard_before_reveal_end() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(old.id), 4)],
      old.reveal_end - 1,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_no_ballot() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(old, new, [], old.reveal_end, old.reveal_end + 1_000),
  )
}

test discard_rejects_two_ballots() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(old.id), 4), ballot_input(vote_datum(old.id), 5)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_ballot_from_another_proposal() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  let other = #"abababababababababababababababababababababababababababababababab"
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(other), 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_missing_increment() fail {
  let old = proposal_datum()
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      old,
      [ballot_input(vote_datum(old.id), 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_double_increment() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 2 }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(old.id), 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_changed_nullifier_list() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1, nullifiers: [nullifier_a] }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote_datum(old.id), 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

fn ballot_input_named(
  vote: VoteDatum,
  nullifier: ByteArray,
  index: Int,
) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(ballot_policy_id),
      value: assets.from_asset(ballot_policy_id, nullifier, 1),
      datum: InlineDatum(vote),
      reference_script: None,
    },
  }
}

fn burns(names: List<ByteArray>) -> assets.Assets {
  list.foldl(
    names,
    assets.zero,
    fn(name, total) {
      assets.merge(total, assets.from_asset(ballot_policy_id, name, -1))
    },
  )
}

fn tally_tx(
  old: ProposalDatum,
  new: ProposalDatum,
  ballots: List<(VoteDatum, ByteArray)>,
  minted: List<ByteArray>,
  lower: Int,
  upper: Int,
) -> Transaction {
  let vote_inputs = list.indexed_map(
    ballots,
    fn(index, ballot) {
      let (vote, name) = ballot
      ballot_input_named(vote, name, index + 4)
    },
  )
  Transaction {
    ..placeholder,
    inputs: [proposal_input(old), ..vote_inputs],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: burns(minted),
    outputs: [proposal_output(new)],
  }
}

fn finalize_tx(
  old: ProposalDatum,
  new: ProposalDatum,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(old)],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    outputs: [proposal_output(new)],
  }
}

test tally_accepts_a_revealed_ballot() {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  let new = ProposalDatum { ..old, tallied: 1, yes: 1 }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(vote, nullifier_a)],
      [nullifier_a],
      old.end,
      old.end + 1_000,
    ),
  )
}

test tally_accepts_two_ballots() {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
  }
  let yes_vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  let no_vote = VoteDatum { ..vote_datum(old.id), revealed: Some(No) }
  let new = ProposalDatum { ..old, tallied: 2, yes: 1, no: 1 }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(yes_vote, nullifier_a), (no_vote, nullifier_b)],
      [nullifier_a, nullifier_b],
      old.end,
      old.end + 1_000,
    ),
  )
}

test tally_rejects_an_unrevealed_ballot() fail {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let new = ProposalDatum { ..old, tallied: 1, yes: 1 }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(vote_datum(old.id), nullifier_a)],
      [nullifier_a],
      old.end,
      old.end + 1_000,
    ),
  )
}

test tally_rejects_a_wrong_counter() fail {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  let new = ProposalDatum { ..old, tallied: 2, yes: 1 }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(vote, nullifier_a)],
      [nullifier_a],
      old.end,
      old.end + 1_000,
    ),
  )
}

test tally_rejects_before_end() fail {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  let new = ProposalDatum { ..old, tallied: 1, yes: 1 }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(vote, nullifier_a)],
      [nullifier_a],
      old.end - 1,
      old.end + 1_000,
    ),
  )
}

test tally_rejects_a_changed_nullifier_list() fail {
  let old = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  let new = ProposalDatum {
    ..old,
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 1,
    yes: 1,
  }
  governance_rules.tally(
    config(),
    ref(3),
    tally_tx(
      old,
      new,
      [(vote, nullifier_a)],
      [nullifier_a],
      old.end,
      old.end + 1_000,
    ),
  )
}

test finalize_accepts_a_passing_proposal() {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_rejects_before_reveal_end() fail {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end - 1, upper),
  )
}

test finalize_rejects_a_missing_tally_or_discard() fail {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 1,
    yes: 1,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_rejects_a_tallied_votes_mismatch() fail {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 1,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_records_rejected_on_a_quorum_shortfall() {
  let old = ProposalDatum {
    ..proposal_datum(),
    eligible_leaves: [leaf_a, leaf_b, leaf_a, leaf_b, leaf_a],
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Rejected, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_records_rejected_for_two_of_three() {
  let old = ProposalDatum {
    ..proposal_datum(),
    eligible_leaves: [leaf_a, leaf_b, leaf_a],
    nullifiers: [nullifier_a, nullifier_b, nullifier_a],
    tallied: 3,
    yes: 2,
    no: 1,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Rejected, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_accepts_three_of_four() {
  let old = ProposalDatum {
    ..proposal_datum(),
    eligible_leaves: [leaf_a, leaf_b, leaf_a, leaf_b],
    nullifiers: [nullifier_a, nullifier_b, nullifier_a, nullifier_b],
    tallied: 4,
    yes: 3,
    no: 1,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_records_rejected_with_no_votes() {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a],
    discarded: 1,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Rejected, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_rejects_a_window_over_one_hour() fail {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + voting.max_window_ms + 1
  let new = ProposalDatum { ..old, status: Passed, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test finalize_rejects_a_wrong_timestamp() fail {
  let old = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum {
    ..old,
    status: Passed,
    finalized_at: Some(upper + 1),
  }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

test discard_rejects_a_revealed_ballot() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  let vote = VoteDatum { ..vote_datum(old.id), revealed: Some(Yes) }
  governance_rules.discard(
    config(),
    ref(3),
    discard_tx(
      old,
      new,
      [ballot_input(vote, 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_reveal_pairing() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, discarded: 1 }
  let vote = vote_datum(old.id)
  let tx = Transaction {
    ..discard_tx(
      old,
      new,
      [ballot_input(vote, 4)],
      old.reveal_end,
      old.reveal_end + 1_000,
    ),
    mint: assets.zero,
  }
  governance_rules.discard(config(), ref(3), tx)
}

test finalize_uses_the_live_config_not_the_proposed_config() {
  let old = ProposalDatum {
    ..proposal_datum(),
    proposed_config: ConfigDatum {
      ..config(),
      quorum_bps: 1,
      structural_threshold_bps: 1,
    },
    eligible_leaves: [leaf_a, leaf_b, leaf_a, leaf_b, leaf_a],
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
  }
  let upper = old.reveal_end + 1_000
  let new = ProposalDatum { ..old, status: Rejected, finalized_at: Some(upper) }
  governance_rules.finalize(
    config(),
    ref(3),
    finalize_tx(old, new, old.reveal_end, upper),
  )
}

const config_policy_id: ByteArray =
  #"5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a"

fn passed_proposal() -> ProposalDatum {
  let datum = proposal_datum()
  ProposalDatum {
    ..datum,
    proposed_config: ConfigDatum {
      ..config(),
      contribution_year: 2027,
      annual_amount: 2_000_000,
    },
    nullifiers: [nullifier_a, nullifier_b],
    tallied: 2,
    yes: 2,
    status: Passed,
    finalized_at: Some(datum.reveal_end + 1_000),
  }
}

fn config_spent_input() -> Input {
  Input {
    output_reference: ref(6),
    output: Output {
      address: from_script(config_policy_id),
      value: assets.from_asset(state_policy_id, "STATE", 1),
      datum: InlineDatum(config()),
      reference_script: None,
    },
  }
}

fn config_output(datum: ConfigDatum) -> Output {
  Output {
    address: from_script(config_policy_id),
    value: assets.from_asset(state_policy_id, "STATE", 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn execute_tx(
  old: ProposalDatum,
  new: ProposalDatum,
  configs: List<Input>,
  outputs: List<Output>,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(old), ..configs],
    validity_range: interval.between(old.reveal_end, old.reveal_end + 1_000),
    outputs: [proposal_output(new), ..outputs],
  }
}

fn execute_outputs(old: ProposalDatum) -> List<Output> {
  [config_output(old.proposed_config)]
}

test execute_accepts_a_passed_proposal() {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_an_open_proposal() fail {
  let old = proposal_datum()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_a_rejected_proposal() fail {
  let old = ProposalDatum { ..passed_proposal(), status: Rejected }
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_a_missing_config_box() fail {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [], execute_outputs(old)),
  )
}

test execute_rejects_two_config_boxes() fail {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input(), config_spent_input()], []),
  )
}

test execute_rejects_a_config_that_is_not_the_proposed_one() fail {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(
      old,
      new,
      [config_spent_input()],
      [config_output(ConfigDatum { ..config(), annual_amount: 9_000_000 })],
    ),
  )
}

test execute_rejects_a_config_output_at_another_address() fail {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(
      old,
      new,
      [config_spent_input()],
      [
        Output {
          address: from_script(governance_policy_id),
          value: assets.from_asset(state_policy_id, "STATE", 1),
          datum: InlineDatum(old.proposed_config),
          reference_script: None,
        },
      ],
    ),
  )
}

test execute_rejects_a_changed_counter() fail {
  let old = passed_proposal()
  let new = ProposalDatum { ..old, status: Executed, yes: old.yes + 1 }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_a_changed_finalize_time() fail {
  let old = passed_proposal()
  let new = ProposalDatum {
    ..old,
    status: Executed,
    finalized_at: Some(old.reveal_end),
  }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_a_changed_proposed_config() fail {
  let old = passed_proposal()
  let new = ProposalDatum {
    ..old,
    status: Executed,
    proposed_config: ConfigDatum { ..config(), annual_amount: 4_000_000 },
  }
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, new, [config_spent_input()], execute_outputs(old)),
  )
}

test execute_rejects_a_proposal_that_stays_passed() fail {
  let old = passed_proposal()
  governance_rules.execute(
    state_policy_id,
    ref(3),
    execute_tx(old, old, [config_spent_input()], execute_outputs(old)),
  )
}
