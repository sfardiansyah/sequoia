use aiken/collection/list
use aiken/interval
use aiken/primitive/bytearray
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/ballot_rules
use sequoia/types.{
  Abstain, Config, ConfigDatum, No, Open, Passed, ProposalDatum, VoteDatum, Yes,
}
use sequoia/voting

const state_policy_id: ByteArray =
  #"11111111111111111111111111111111111111111111111111111111"

const membership_policy_id: ByteArray =
  #"33333333333333333333333333333333333333333333333333333333"

const bank_policy_id: ByteArray =
  #"44444444444444444444444444444444444444444444444444444444"

const governance_policy_id: ByteArray =
  #"55555555555555555555555555555555555555555555555555555555"

const ballot_policy_id: ByteArray =
  #"66666666666666666666666666666666666666666666666666666666"

const other_policy_id: ByteArray =
  #"67676767676767676767676767676767676767676767676767676767"

const owner_a: ByteArray =
  #"77777777777777777777777777777777777777777777777777777777"

const board_a: ByteArray =
  #"99999999999999999999999999999999999999999999999999999999"

const tx_id: ByteArray =
  #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

const proposal_id: ByteArray =
  #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

const other_proposal_id: ByteArray =
  #"dededededededededededededededededededededededededededededededede"

const leaf_a: ByteArray =
  #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

const leaf_b: ByteArray =
  #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

const leaf_c: ByteArray =
  #"1010101010101010101010101010101010101010101010101010101010101010"

const nullifier_a: ByteArray =
  #"1212121212121212121212121212121212121212121212121212121212121212"

const nullifier_b: ByteArray =
  #"1313131313131313131313131313131313131313131313131313131313131313"

const extra_nullifier: ByteArray =
  #"1414141414141414141414141414141414141414141414141414141414141414"

const salt: ByteArray =
  #"2222222222222222222222222222222222222222222222222222222222222222"

const other_salt: ByteArray =
  #"2323232323232323232323232323232323232323232323232323232323232323"

const start: Int = 1_000

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
    board_keys: [board_a],
    board_threshold: 1,
    kyc_issuer: VerificationKey(owner_a),
    bank_issuer: VerificationKey(owner_a),
    network: 0,
    membership_policy: membership_policy_id,
    kyc_policy: #"88888888888888888888888888888888888888888888888888888888",
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

fn proposal_datum() -> ProposalDatum {
  let end = voting.end_of_voting(start, 7)
  ProposalDatum {
    id: proposal_id,
    proposer: owner_a,
    kind: Config,
    proposed_config: config(),
    eligible_leaves: [leaf_a, leaf_b],
    start,
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

fn vote_datum(commitment: ByteArray) -> VoteDatum {
  let proposal = proposal_datum()
  VoteDatum {
    proposal_id: proposal.id,
    end: proposal.end,
    reveal_end: proposal.reveal_end,
    choice_commitment: commitment,
    revealed: None,
  }
}

fn commitment() -> ByteArray {
  voting.choice_commitment(0, salt)
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

fn vote_input(datum: VoteDatum, nullifier: ByteArray) -> Input {
  Input {
    output_reference: ref(4),
    output: Output {
      address: from_script(ballot_policy_id),
      value: assets.from_asset(ballot_policy_id, nullifier, 1),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

fn vote_output(datum: VoteDatum, nullifier: ByteArray) -> Output {
  Output {
    address: from_script(ballot_policy_id),
    value: assets.from_asset(ballot_policy_id, nullifier, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn wallet_output(datum: VoteDatum, nullifier: ByteArray) -> Output {
  Output {
    address: from_verification_key(owner_a),
    value: assets.from_asset(ballot_policy_id, nullifier, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn cast_tx(
  proposal: ProposalDatum,
  vote: VoteDatum,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(proposal)],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: assets.from_asset(ballot_policy_id, nullifier_a, 1),
    outputs: [vote_output(vote, nullifier_a)],
  }
}

fn reveal_tx(
  old: VoteDatum,
  new: VoteDatum,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [vote_input(old, nullifier_a)],
    validity_range: interval.between(lower, upper),
    outputs: [vote_output(new, nullifier_a)],
  }
}

fn discard_tx(
  proposal: ProposalDatum,
  vote: VoteDatum,
  burn: Int,
  outputs: List<Output>,
  lower: Int,
  upper: Int,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [proposal_input(proposal), vote_input(vote, nullifier_a)],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: assets.from_asset(ballot_policy_id, nullifier_a, burn),
    outputs,
  }
}

test cast_accepts_an_eligible_leaf() {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_an_ineligible_leaf() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_c,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_cast_after_end_with_a_stale_lower_bound() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.end - 1_000, proposal.end + 1),
  )
}

test cast_rejects_a_duplicate_nullifier() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_wrong_policy() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  ballot_rules.cast(
    ConfigDatum { ..config(), ballot_policy: other_policy_id },
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_wrong_proposal_id() fail {
  let proposal = proposal_datum()
  let vote = VoteDatum {
    ..vote_datum(commitment()),
    proposal_id: other_proposal_id,
  }
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_copied_deadline_that_differs() fail {
  let proposal = proposal_datum()
  let vote = VoteDatum { ..vote_datum(commitment()), end: proposal.end + 1 }
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_short_commitment() fail {
  let proposal = proposal_datum()
  let vote = VoteDatum { ..vote_datum(#"01"), choice_commitment: #"01" }
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_revealed_datum() fail {
  let proposal = proposal_datum()
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.cast(
    config(),
    ballot_policy_id,
    leaf_a,
    cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
  )
}

test cast_rejects_a_vote_box_at_a_wallet() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  let tx = Transaction {
    ..cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
    outputs: [wallet_output(vote, nullifier_a)],
  }
  ballot_rules.cast(config(), ballot_policy_id, leaf_a, tx)
}

test cast_rejects_extra_assets_in_the_vote_box() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  let tx = Transaction {
    ..cast_tx(proposal, vote, proposal.start, proposal.start + 1_000),
    outputs: [
      Output {
        address: from_script(ballot_policy_id),
        value: assets.merge(
          assets.from_asset(ballot_policy_id, nullifier_a, 1),
          assets.from_asset(other_policy_id, #"01", 1),
        ),
        datum: InlineDatum(vote),
        reference_script: None,
      },
    ],
  }
  ballot_rules.cast(config(), ballot_policy_id, leaf_a, tx)
}

test reveal_accepts_the_matching_choice_and_salt() {
  let old = vote_datum(commitment())
  let new = VoteDatum { ..old, revealed: Some(Yes) }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, new, old.end, old.end + 1_000),
  )
}

test reveal_rejects_a_wrong_salt() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum { ..old, revealed: Some(Yes) }
  ballot_rules.reveal(
    ref(4),
    Yes,
    other_salt,
    reveal_tx(old, new, old.end, old.end + 1_000),
  )
}

test reveal_rejects_a_wrong_choice() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum { ..old, revealed: Some(No) }
  ballot_rules.reveal(
    ref(4),
    No,
    salt,
    reveal_tx(old, new, old.end, old.end + 1_000),
  )
}

test reveal_rejects_a_reveal_before_end() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum { ..old, revealed: Some(Yes) }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, new, old.end - 1, old.end + 1_000),
  )
}

test reveal_rejects_a_reveal_after_reveal_end() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum { ..old, revealed: Some(Yes) }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, new, old.reveal_end, old.reveal_end + 1),
  )
}

test reveal_rejects_an_already_revealed_vote() fail {
  let old = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, old, old.end, old.end + 1_000),
  )
}

test reveal_rejects_a_changed_deadline() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum {
    ..old,
    reveal_end: old.reveal_end + 1,
    revealed: Some(Yes),
  }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, new, old.end, old.end + 1_000),
  )
}

test reveal_rejects_a_changed_commitment() fail {
  let old = vote_datum(commitment())
  let new = VoteDatum {
    ..old,
    revealed: Some(Yes),
    choice_commitment: other_salt,
  }
  ballot_rules.reveal(
    ref(4),
    Yes,
    salt,
    reveal_tx(old, new, old.end, old.end + 1_000),
  )
}

test discard_accepts_an_unrevealed_ballot() {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(proposal, vote, -1, [], vote.reveal_end, vote.reveal_end + 1_000),
  )
}

test discard_rejects_a_discard_before_reveal_end() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(
      proposal,
      vote,
      -1,
      [],
      vote.reveal_end - 1,
      vote.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_revealed_ballot() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(proposal, vote, -1, [], vote.reveal_end, vote.reveal_end + 1_000),
  )
}

test discard_rejects_a_missing_burn() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(proposal, vote, 0, [], vote.reveal_end, vote.reveal_end + 1_000),
  )
}

test discard_rejects_a_recreated_vote() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(
      proposal,
      vote,
      -1,
      [vote_output(vote, nullifier_a)],
      vote.reveal_end,
      vote.reveal_end + 1_000,
    ),
  )
}

test discard_rejects_a_never_cast_nullifier() fail {
  let proposal = proposal_datum()
  let vote = vote_datum(commitment())
  ballot_rules.discard(
    config(),
    ref(4),
    discard_tx(proposal, vote, -1, [], vote.reveal_end, vote.reveal_end + 1_000),
  )
}

test discard_mint_accepts_the_burned_ballot() {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  ballot_rules.discard_mint(
    config(),
    ballot_policy_id,
    discard_tx(proposal, vote, -1, [], vote.reveal_end, vote.reveal_end + 1_000),
  )
}

test discard_mint_rejects_two_ballots() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = vote_datum(commitment())
  let tx = Transaction {
    ..discard_tx(
      proposal,
      vote,
      -1,
      [],
      vote.reveal_end,
      vote.reveal_end + 1_000,
    ),
    inputs: [
      proposal_input(proposal),
      vote_input(vote, nullifier_a),
      Input {
        output_reference: ref(5),
        output: Output {
          address: from_script(ballot_policy_id),
          value: assets.from_asset(
            ballot_policy_id,
            #"1313131313131313131313131313131313131313131313131313131313131313",
            1,
          ),
          datum: InlineDatum(vote),
          reference_script: None,
        },
      },
    ],
  }
  ballot_rules.discard_mint(config(), ballot_policy_id, tx)
}

fn vote_input_at(datum: VoteDatum, nullifier: ByteArray, index: Int) -> Input {
  Input {
    output_reference: ref(index),
    output: Output {
      address: from_script(ballot_policy_id),
      value: assets.from_asset(ballot_policy_id, nullifier, 1),
      datum: InlineDatum(datum),
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
  proposal: ProposalDatum,
  ballots: List<(VoteDatum, ByteArray)>,
  minted: List<ByteArray>,
  lower: Int,
  upper: Int,
) -> Transaction {
  let vote_inputs = list.indexed_map(
    ballots,
    fn(index, ballot) {
      let (datum, nullifier) = ballot
      vote_input_at(datum, nullifier, index + 4)
    },
  )
  Transaction {
    ..placeholder,
    inputs: [proposal_input(proposal), ..vote_inputs],
    reference_inputs: [config_input()],
    validity_range: interval.between(lower, upper),
    mint: burns(minted),
  }
}

test tally_accepts_one_revealed_ballot() {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  let counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  and {
    counts.count == 1,
    counts.yes == 1,
    counts.no == 0,
    counts.abstain == 0,
  }
}

test tally_accepts_two_ballots() {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
  }
  let yes_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  let no_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(No) }
  let counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(yes_vote, nullifier_a), (no_vote, nullifier_b)],
      [nullifier_a, nullifier_b],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  and {
    counts.count == 2,
    counts.yes == 1,
    counts.no == 1,
    counts.abstain == 0,
  }
}

test tally_accepts_an_abstention() {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Abstain) }
  let counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  and {
    counts.count == 1,
    counts.yes == 0,
    counts.no == 0,
    counts.abstain == 1,
  }
}

test tally_rejects_more_than_ten_ballots() fail {
  let names = list.map(
    list.range(1, 11),
    fn(index) { bytearray.from_int_big_endian(index, 32) },
  )
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: names }
  let ballots = list.map(
    names,
    fn(name) {
      (VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }, name)
    },
  )
  expect _counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(proposal, ballots, names, proposal.end, proposal.end + 1_000),
  )
  True
}

test tally_rejects_an_unrevealed_ballot() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  expect _counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(vote_datum(commitment()), nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  True
}

test tally_rejects_a_ballot_not_in_the_nullifier_list() fail {
  let proposal = proposal_datum()
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  expect _counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  True
}

test tally_rejects_a_missing_burn() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  expect _counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  True
}

test count_accepts_a_revealed_vote() {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.count(
    config(),
    ref(4),
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}

test count_rejects_before_end() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.count(
    config(),
    ref(4),
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end - 1,
      proposal.end + 1_000,
    ),
  )
}

test count_mint_accepts_the_batch() {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
  }
  let yes_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  let no_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(No) }
  ballot_rules.count_mint(
    config(),
    ballot_policy_id,
    tally_tx(
      proposal,
      [(yes_vote, nullifier_a), (no_vote, nullifier_b)],
      [nullifier_a, nullifier_b],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}

test count_mint_rejects_an_extra_burn() fail {
  let proposal = ProposalDatum { ..proposal_datum(), nullifiers: [nullifier_a] }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.count_mint(
    config(),
    ballot_policy_id,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a, extra_nullifier],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}

test count_mint_rejects_a_missing_burn() fail {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
  }
  let yes_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  let no_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(No) }
  ballot_rules.count_mint(
    config(),
    ballot_policy_id,
    tally_tx(
      proposal,
      [(yes_vote, nullifier_a), (no_vote, nullifier_b)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}

test tally_rejects_a_mixed_proposal_batch() fail {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a, nullifier_b],
  }
  let own_vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  let other_vote = VoteDatum {
    ..vote_datum(commitment()),
    proposal_id: other_proposal_id,
    revealed: Some(Yes),
  }
  expect _counts = ballot_rules.tally(
    config(),
    proposal,
    tally_tx(
      proposal,
      [(own_vote, nullifier_a), (other_vote, nullifier_b)],
      [nullifier_a, nullifier_b],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
  True
}

test count_rejects_a_closed_proposal() fail {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a],
    status: Passed,
  }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.count(
    config(),
    ref(4),
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}

test count_mint_rejects_a_closed_proposal() fail {
  let proposal = ProposalDatum {
    ..proposal_datum(),
    nullifiers: [nullifier_a],
    status: Passed,
  }
  let vote = VoteDatum { ..vote_datum(commitment()), revealed: Some(Yes) }
  ballot_rules.count_mint(
    config(),
    ballot_policy_id,
    tally_tx(
      proposal,
      [(vote, nullifier_a)],
      [nullifier_a],
      proposal.end,
      proposal.end + 1_000,
    ),
  )
}
