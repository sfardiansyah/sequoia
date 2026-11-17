use aiken/interval
use cardano/address.{VerificationKey, from_script, from_verification_key}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use sequoia/treasury_rules
use sequoia/types.{
  Config, ConfigDatum, Milestone, Passed, PoolDatum, Project, ProjectCancelled,
  ProjectClosed, ProjectDatum, ProjectOpen, ProjectSpec, ProposalDatum,
  ProposalPayload, ProposalStatus, Rejected, pool_asset_name,
}

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

const board: ByteArray =
  #"78787878787878787878787878787878787878787878787878787878"

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
    board_keys: [board],
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

// Project reservation: executing a passed `Project` proposal spends the pool,
// mints the `PROJECT` NFT, and writes the project box (spec §7).

const project_id: ByteArray =
  #"dededededededededededededededededededededededededededededededede"

const other_project_id: ByteArray =
  #"dfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdf"

const foreign_policy_id: ByteArray =
  #"9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a"

const recipient: ByteArray =
  #"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

const evidence_a: ByteArray =
  #"a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2"

const evidence_b: ByteArray =
  #"a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3"

const leaf: ByteArray =
  #"b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1"

fn project_spec() -> ProjectSpec {
  ProjectSpec {
    recipient_commitment: recipient,
    deadline: 2_000_000_000,
    milestones: [
      Milestone { amount: 3_000_000, evidence_commitment: evidence_a },
      Milestone { amount: 2_000_000, evidence_commitment: evidence_b },
    ],
  }
}

fn open_project() -> ProjectDatum {
  ProjectDatum {
    project_id,
    spec: project_spec(),
    next_milestone: 0,
    status: ProjectOpen,
  }
}

fn project_output(datum: ProjectDatum) -> Output {
  Output {
    address: from_script(treasury_script),
    value: assets.from_asset(treasury_script, datum.project_id, 1),
    datum: InlineDatum(datum),
    reference_script: None,
  }
}

fn project_proposal(
  payload: ProposalPayload,
  status: ProposalStatus,
) -> ProposalDatum {
  ProposalDatum {
    id: project_id,
    proposer: treasurer,
    payload,
    eligible_leaves: [leaf],
    start: 0,
    end: 1,
    reveal_end: 2,
    nullifiers: [],
    discarded: 0,
    tallied: 0,
    yes: 0,
    no: 0,
    abstain: 0,
    status,
    finalized_at: None,
  }
}

fn proposal_input(proposal: ProposalDatum) -> Input {
  named_proposal_input(proposal, proposal.id)
}

fn named_proposal_input(proposal: ProposalDatum, name: ByteArray) -> Input {
  Input {
    output_reference: ref(4),
    output: Output {
      address: from_script(governance_policy_id),
      value: assets.from_asset(governance_policy_id, name, 1),
      datum: InlineDatum(proposal),
      reference_script: None,
    },
  }
}

fn project_mint() {
  assets.from_asset(treasury_script, project_id, 1)
}

fn reserve_tx(
  old: PoolDatum,
  new: PoolDatum,
  project: ProjectDatum,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [
      pool_input(old, 3),
      proposal_input(project_proposal(Project(project_spec()), Passed)),
    ],
    reference_inputs: [config_input()],
    mint: project_mint(),
    outputs: [pool_output(new), project_output(project)],
  }
}

test reserve_accepts_a_funded_project() {
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 2_000_000 },
      PoolDatum { balance: 10_000_000, committed: 7_000_000 },
      open_project(),
    ),
  )
}

test reserve_accepts_the_spent_pool_box() {
  treasury_rules.reserve_project(
    state_policy_id,
    Some(ref(3)),
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
  )
}

test reserve_rejects_an_unfunded_pool() fail {
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 4_000_000, committed: 0 },
      PoolDatum { balance: 4_000_000, committed: 5_000_000 },
      open_project(),
    ),
  )
}

test reserve_rejects_a_tampered_spec() fail {
  let tampered = ProjectDatum {
    ..open_project(),
    spec: ProjectSpec { ..project_spec(), milestones: [] },
  }
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      tampered,
    ),
  )
}

test reserve_rejects_a_project_that_names_another_token() fail {
  let renamed = ProjectDatum { ..open_project(), project_id: other_project_id }
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      renamed,
    ),
  )
}

test reserve_rejects_a_missing_mint() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    mint: assets.zero,
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_second_project_name() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    mint: assets.from_asset_list(
      [Pair(treasury_script, [Pair(project_id, 1), Pair(other_project_id, 1)])],
    ),
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_mint_from_another_policy() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    mint: assets.from_asset(foreign_policy_id, project_id, 1),
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_changed_balance() fail {
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 9_000_000, committed: 5_000_000 },
      open_project(),
    ),
  )
}

test reserve_rejects_an_unraised_committed() fail {
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 0 },
      open_project(),
    ),
  )
}

test reserve_rejects_a_project_outside_the_treasury() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    outputs: [
      pool_output(PoolDatum { balance: 10_000_000, committed: 5_000_000 }),
      Output {
        address: from_verification_key(treasurer),
        value: project_mint(),
        datum: InlineDatum(open_project()),
        reference_script: None,
      },
    ],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_rejected_proposal() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 0 }, 3),
      proposal_input(project_proposal(Project(project_spec()), Rejected)),
    ],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_proposal_whose_datum_names_another_id() fail {
  let proposal = ProposalDatum {
    ..project_proposal(Project(project_spec()), Passed),
    id: other_project_id,
  }
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 0 }, 3),
      named_proposal_input(proposal, project_id),
    ],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_config_proposal() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 0 }, 3),
      proposal_input(project_proposal(Config(config()), Passed)),
    ],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_missing_proposal() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    inputs: [pool_input(PoolDatum { balance: 10_000_000, committed: 0 }, 3)],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

test reserve_rejects_a_started_project() fail {
  let started = ProjectDatum { ..open_project(), next_milestone: 1 }
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      started,
    ),
  )
}

test reserve_rejects_a_closed_project() fail {
  let closed = ProjectDatum { ..open_project(), status: ProjectClosed }
  treasury_rules.reserve_project(
    state_policy_id,
    None,
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      closed,
    ),
  )
}

test reserve_rejects_another_spent_box() fail {
  treasury_rules.reserve_project(
    state_policy_id,
    Some(ref(7)),
    reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
  )
}

test reserve_rejects_a_second_pool_output() fail {
  let tx = Transaction {
    ..reserve_tx(
      PoolDatum { balance: 10_000_000, committed: 0 },
      PoolDatum { balance: 10_000_000, committed: 5_000_000 },
      open_project(),
    ),
    outputs: [
      pool_output(PoolDatum { balance: 10_000_000, committed: 5_000_000 }),
      pool_output(PoolDatum { balance: 10_000_000, committed: 5_000_000 }),
      project_output(open_project()),
    ],
  }
  treasury_rules.reserve_project(state_policy_id, None, tx)
}

// Tranche spending: one approved milestone per transaction, board and treasurer
// signed, debiting the pool and closing the project on the last milestone
// (spec §7, ADR 0010 §5–§6).

fn project_input(datum: ProjectDatum, index: Int) -> Input {
  Input { output_reference: ref(index), output: project_output(datum) }
}

fn tranche_tx(
  old_pool: PoolDatum,
  new_pool: PoolDatum,
  old_project: ProjectDatum,
  new_project: ProjectDatum,
  signers: List<ByteArray>,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [pool_input(old_pool, 3), project_input(old_project, 5)],
    reference_inputs: [config_input()],
    extra_signatories: signers,
    outputs: [pool_output(new_pool), project_output(new_project)],
    validity_range: interval.between(0, 1_000_000),
  }
}

fn first_tranche_tx() -> Transaction {
  tranche_tx(
    PoolDatum { balance: 10_000_000, committed: 5_000_000 },
    PoolDatum { balance: 7_000_000, committed: 2_000_000 },
    open_project(),
    ProjectDatum { ..open_project(), next_milestone: 1 },
    [board, treasurer],
  )
}

fn spend_first(tx: Transaction) -> Bool {
  treasury_rules.spend_tranche(
    state_policy_id,
    evidence_a,
    bank_ref,
    ref(5),
    tx,
  )
}

test tranche_spends_the_next_milestone() {
  spend_first(first_tranche_tx())
}

test tranche_spends_the_last_milestone_and_closes_the_project() {
  let started = ProjectDatum { ..open_project(), next_milestone: 1 }
  let closed = ProjectDatum {
    ..open_project(),
    next_milestone: 2,
    status: ProjectClosed,
  }
  treasury_rules.spend_tranche(
    state_policy_id,
    evidence_b,
    bank_ref,
    ref(5),
    tranche_tx(
      PoolDatum { balance: 10_000_000, committed: 2_000_000 },
      PoolDatum { balance: 8_000_000, committed: 0 },
      started,
      closed,
      [board, treasurer],
    ),
  )
}

test tranche_rejects_wrong_evidence() fail {
  treasury_rules.spend_tranche(
    state_policy_id,
    evidence_b,
    bank_ref,
    ref(5),
    first_tranche_tx(),
  )
}

test tranche_rejects_an_empty_bank_reference() fail {
  treasury_rules.spend_tranche(
    state_policy_id,
    evidence_a,
    #"",
    ref(5),
    first_tranche_tx(),
  )
}

test tranche_rejects_a_late_spend() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    validity_range: interval.between(0, 2_000_000_001),
  }
  spend_first(tx)
}

test tranche_rejects_a_missing_board_signature() fail {
  let tx = Transaction { ..first_tranche_tx(), extra_signatories: [treasurer] }
  spend_first(tx)
}

test tranche_rejects_a_missing_treasurer_signature() fail {
  let tx = Transaction { ..first_tranche_tx(), extra_signatories: [board] }
  spend_first(tx)
}

test tranche_rejects_an_insufficient_balance() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 2_000_000, committed: 5_000_000 }, 3),
      project_input(open_project(), 5),
    ],
    outputs: [
      pool_output(PoolDatum { balance: 0, committed: 2_000_000 }),
      project_output(ProjectDatum { ..open_project(), next_milestone: 1 }),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_an_amount_above_committed() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 1_000_000 }, 3),
      project_input(open_project(), 5),
    ],
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 0 }),
      project_output(ProjectDatum { ..open_project(), next_milestone: 1 }),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_closed_project() fail {
  let closed = ProjectDatum { ..open_project(), status: ProjectClosed }
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 5_000_000 }, 3),
      project_input(closed, 5),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_cancelled_project() fail {
  let cancelled = ProjectDatum { ..open_project(), status: ProjectCancelled }
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 5_000_000 }, 3),
      project_input(cancelled, 5),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_fully_spent_project() fail {
  let spent = ProjectDatum { ..open_project(), next_milestone: 2 }
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 2_000_000 }, 3),
      project_input(spent, 5),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_tampered_spec() fail {
  let tampered = ProjectDatum {
    ..open_project(),
    next_milestone: 1,
    spec: ProjectSpec { ..project_spec(), recipient_commitment: evidence_a },
  }
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 2_000_000 }),
      project_output(tampered),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_skipped_milestone() fail {
  let skipped = ProjectDatum { ..open_project(), next_milestone: 2 }
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 2_000_000 }),
      project_output(skipped),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_an_early_close() fail {
  let closed = ProjectDatum {
    ..open_project(),
    next_milestone: 1,
    status: ProjectClosed,
  }
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 2_000_000 }),
      project_output(closed),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_renamed_project() fail {
  let renamed = ProjectDatum {
    ..open_project(),
    project_id: other_project_id,
    next_milestone: 1,
  }
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 2_000_000 }),
      project_output(renamed),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_wrong_balance_debit() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 6_000_000, committed: 2_000_000 }),
      project_output(ProjectDatum { ..open_project(), next_milestone: 1 }),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_wrong_committed_debit() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 1_000_000 }),
      project_output(ProjectDatum { ..open_project(), next_milestone: 1 }),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_project_outside_the_treasury() fail {
  let fake = Input {
    output_reference: ref(5),
    output: Output {
      address: from_verification_key(treasurer),
      value: assets.from_asset(treasury_script, project_id, 1),
      datum: InlineDatum(open_project()),
      reference_script: None,
    },
  }
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 5_000_000 }, 3),
      fake,
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_project_without_the_token() fail {
  let fake = Input {
    output_reference: ref(5),
    output: Output {
      address: from_script(treasury_script),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(open_project()),
      reference_script: None,
    },
  }
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [
      pool_input(PoolDatum { balance: 10_000_000, committed: 5_000_000 }, 3),
      fake,
    ],
  }
  spend_first(tx)
}

test tranche_rejects_a_missing_pool() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    inputs: [project_input(open_project(), 5)],
  }
  spend_first(tx)
}

test tranche_rejects_a_second_project_output() fail {
  let next = ProjectDatum { ..open_project(), next_milestone: 1 }
  let tx = Transaction {
    ..first_tranche_tx(),
    outputs: [
      pool_output(PoolDatum { balance: 7_000_000, committed: 2_000_000 }),
      project_output(next),
      project_output(next),
    ],
  }
  spend_first(tx)
}

test tranche_rejects_an_unbounded_validity_range() fail {
  let tx = Transaction {
    ..first_tranche_tx(),
    validity_range: interval.after(0),
  }
  spend_first(tx)
}

test tranche_accepts_the_pool_box_own_ref() {
  treasury_rules.spend_tranche(
    state_policy_id,
    evidence_a,
    bank_ref,
    ref(3),
    first_tranche_tx(),
  )
}
