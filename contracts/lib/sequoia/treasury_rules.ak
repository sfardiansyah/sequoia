use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Script, VerificationKey}
use cardano/assets.{AssetName, PolicyId, quantity_of, tokens}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use sequoia/config_ref
use sequoia/config_rules
use sequoia/tx.{
  inline_datum, lower_bound, one_token_output, require_key_signer, upper_bound,
}
use sequoia/types.{
  Cancel, ConfigDatum, Executed, Milestone, Passed, PoolDatum, Project,
  ProjectCancelled, ProjectClosed, ProjectDatum, ProjectOpen, ProjectSpec,
  ProjectStatus, ProposalDatum, pool_asset_name,
}
use sequoia/voting

/// Treasury rules (ADR 0010 §1–§2). The treasury holds no money: the pool box
/// carries the treasurer-attested IDR figures and the cash stays at the bank.
fn datum_of(output: Output) -> PoolDatum {
  expect datum: PoolDatum = inline_datum(output)
  datum
}

fn project_datum_of(output: Output) -> ProjectDatum {
  expect datum: ProjectDatum = inline_datum(output)
  datum
}

fn proposal_datum_of(output: Output) -> ProposalDatum {
  expect datum: ProposalDatum = inline_datum(output)
  datum
}

/// The one input holding the pool token. The token is the identity: a project
/// box carries a `PROJECT` NFT instead.
fn only_pool_input(state_nft_policy: PolicyId, self: Transaction) -> Input {
  let holders = list.filter(
    self.inputs,
    fn(input) {
      quantity_of(input.output.value, state_nft_policy, pool_asset_name) == 1
    },
  )
  when holders is {
    [input] -> input
    _ -> fail @"treasury: exactly one pool input required"
  }
}

fn spent_pool_input(
  state_nft_policy: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> Input {
  let input = only_pool_input(state_nft_policy, self)
  if input.output_reference != own_ref {
    fail @"treasury: attestation must spend the pool box"
  } else {
    input
  }
}

fn only_pool_output(
  input: Input,
  self: Transaction,
  state_nft_policy: PolicyId,
) -> Output {
  let holders = list.filter(
    self.outputs,
    fn(output) {
      quantity_of(output.value, state_nft_policy, pool_asset_name) == 1
    },
  )
  when holders is {
    [output] ->
      if output.address != input.output.address {
        fail @"treasury: the pool must stay at its script"
      } else {
        output
      }
    _ -> fail @"treasury: exactly one pool output required"
  }
}

/// `AttestPool` (ADR 0010 §2, spec §7): the treasurer writes the absolute
/// balance and `committed` is unchanged. The figure may fall below `committed`,
/// because refusing bad news would leave a stale, higher figure on chain.
pub fn attest_pool(
  state_nft_policy: PolicyId,
  balance: Int,
  bank_ref_hash: ByteArray,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let input = spent_pool_input(state_nft_policy, own_ref, self)
  let old = datum_of(input.output)
  let config = config_ref.find(state_nft_policy, self)
  expect _treasurer = require_key_signer(config.bank_issuer, self)
  if balance < 0 {
    fail @"treasury: the attested balance cannot be negative"
  } else if bank_ref_hash == #"" {
    fail @"treasury: the bank reference hash must not be empty"
  } else if quantity_of(self.mint, state_nft_policy, pool_asset_name) != 0 {
    fail @"treasury: the pool token cannot be minted or burned"
  } else {
    let written = datum_of(only_pool_output(input, self, state_nft_policy))
    if written != PoolDatum { balance, committed: old.committed } {
      fail @"treasury: attestation writes the balance and keeps committed"
    } else {
      True
    }
  }
}

/// The treasury policy is the script hash of the pool box's address: the pool
/// token is spent from, and written to, this script (ADR 0010 §1). The name
/// `PROJECT` mints under it, so the mint purpose reads the policy here rather
/// than taking its own hash as a parameter.
fn treasury_policy(pool: Input) -> PolicyId {
  when pool.output.address.payment_credential is {
    Script(hash) -> hash
    VerificationKey(_) ->
      fail @"treasury: the pool must be at the treasury script"
  }
}

fn sum_milestones(milestones: List<Milestone>) -> Int {
  list.foldl(milestones, 0, fn(milestone, total) { total + milestone.amount })
}

fn remaining_amount(project: ProjectDatum) -> Int {
  sum_milestones(list.drop(project.spec.milestones, project.next_milestone))
}

/// The spent `Passed` project proposal. Exactly one input holds this governance
/// policy's token under the project name, and its payload is the approved spec:
/// the kind tag and the terms members voted on come from the chain, not the
/// builder.
fn approved_project_spec(
  config: ConfigDatum,
  project_id: AssetName,
  self: Transaction,
) -> ProjectSpec {
  let proposals = list.filter(
    self.inputs,
    fn(input) {
      quantity_of(input.output.value, config.governance_policy, project_id) == 1
    },
  )
  when proposals is {
    [input] -> {
      expect proposal: ProposalDatum = inline_datum(input.output)
      if proposal.id != project_id {
        fail @"treasury: the proposal id must be the project name"
      } else if proposal.status != Passed {
        fail @"treasury: the project vote must have passed"
      } else {
        when proposal.payload is {
          Project(spec) -> spec
          _ -> fail @"treasury: only a project proposal creates a project"
        }
      }
    }
    _ -> fail @"treasury: exactly one passed project proposal required"
  }
}

/// The `PROJECT` mint (spec §7, ADR 0010 §1, §4): a passed project proposal
/// becomes the project box and the pool reserves the budget. `committed` rises
/// by the budget; `balance` belongs to the treasurer. The spend purpose passes
/// its `own_ref`; the mint has none.
pub fn reserve_project(
  state_nft_policy: PolicyId,
  spent_ref: Option<OutputReference>,
  self: Transaction,
) -> Bool {
  let pool = only_pool_input(state_nft_policy, self)
  let policy_id = treasury_policy(pool)
  expect [Pair(project_id, 1)] = tokens(self.mint, policy_id)
    |> dict.to_pairs()
  let old = datum_of(pool.output)
  let written = datum_of(only_pool_output(pool, self, state_nft_policy))
  let spec = approved_project_spec(
    config_ref.find(state_nft_policy, self),
    project_id,
    self,
  )
  let project = project_datum_of(
    one_token_output(policy_id, project_id, policy_id, self),
  )
  let budget = sum_milestones(spec.milestones)
  let spends_the_pool = when spent_ref is {
    Some(own_ref) -> pool.output_reference == own_ref
    None -> True
  }
  if !spends_the_pool {
    fail @"treasury: the reserve must spend the pool box"
  } else if project.project_id != project_id {
    fail @"treasury: the project datum must name the token"
  } else if project.spec != spec {
    fail @"treasury: the project must carry the approved spec"
  } else if project.next_milestone != 0 {
    fail @"treasury: a new project starts at milestone zero"
  } else if project.status != ProjectOpen {
    fail @"treasury: a new project is open"
  } else if written.balance != old.balance {
    fail @"treasury: approval must not change the balance"
  } else if written.committed != old.committed + budget {
    fail @"treasury: approval must reserve the budget"
  } else if old.committed + budget > old.balance {
    fail @"treasury: the pool cannot be oversubscribed"
  } else {
    True
  }
}

/// The one input at the treasury script holding a `PROJECT` token, with its
/// datum. The token name is the project id; the pool box holds `POOL` instead.
fn only_project_input(
  treasury_policy: PolicyId,
  self: Transaction,
) -> (Input, ProjectDatum) {
  let holders = list.filter(
    self.inputs,
    fn(input) {
      and {
        input.output.address.payment_credential == Script(treasury_policy),
        !dict.is_empty(tokens(input.output.value, treasury_policy)),
      }
    },
  )
  when holders is {
    [input] -> {
      expect [Pair(project_id, 1)] = tokens(input.output.value, treasury_policy)
        |> dict.to_pairs()
      let datum = project_datum_of(input.output)
      if datum.project_id != project_id {
        fail @"treasury: the project datum must name its token"
      } else {
        (input, datum)
      }
    }
    _ -> fail @"treasury: exactly one project input required"
  }
}

/// `SpendTranche` (ADR 0010 §5, spec §7): one approved milestone pays out. The
/// board threshold and the treasurer sign; the amount and evidence are the next
/// milestone's, not the builder's. The tranche debits `balance` and `committed`
/// by the amount, and the last milestone closes the project in the same
/// transaction. The recipient and evidence stay opaque commitments.
pub fn spend_tranche(
  state_nft_policy: PolicyId,
  evidence_hash: ByteArray,
  bank_ref_hash: ByteArray,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let pool = only_pool_input(state_nft_policy, self)
  let policy_id = treasury_policy(pool)
  let old_pool = datum_of(pool.output)
  let (project, old) = only_project_input(policy_id, self)
  let config = config_ref.find(state_nft_policy, self)
  expect _treasurer = require_key_signer(config.bank_issuer, self)
  let written = project_datum_of(
    one_token_output(policy_id, old.project_id, policy_id, self),
  )
  let new_pool = datum_of(only_pool_output(pool, self, state_nft_policy))
  if own_ref != pool.output_reference && own_ref != project.output_reference {
    fail @"treasury: the tranche spends the project and the pool"
  } else if old.status != ProjectOpen {
    fail @"treasury: only an open project spends a tranche"
  } else if bank_ref_hash == #"" {
    fail @"treasury: the bank reference hash must not be empty"
  } else if !voting.not_after(upper_bound(self), old.spec.deadline) {
    fail @"treasury: the tranche is after the project deadline"
  } else if config_rules.board_signers(config, self) < config.board_threshold {
    fail @"treasury: board threshold not met"
  } else {
    expect Some(milestone) = list.at(old.spec.milestones, old.next_milestone)
    let amount = milestone.amount
    let next_milestone = old.next_milestone + 1
    let next_status = if next_milestone == list.length(old.spec.milestones) {
      ProjectClosed
    } else {
      ProjectOpen
    }
    if evidence_hash != milestone.evidence_commitment {
      fail @"treasury: the evidence must be the approved milestone's"
    } else if amount > old_pool.balance {
      fail @"treasury: the tranche exceeds the attested balance"
    } else if amount > old_pool.committed {
      fail @"treasury: the tranche exceeds committed"
    } else if written.project_id != old.project_id {
      fail @"treasury: the tranche must keep the project id"
    } else if written.spec != old.spec {
      fail @"treasury: the tranche must keep the approved spec"
    } else if written.next_milestone != next_milestone {
      fail @"treasury: the tranche must consume exactly one milestone"
    } else if written.status != next_status {
      fail @"treasury: only the last tranche closes the project"
    } else if new_pool.balance != old_pool.balance - amount {
      fail @"treasury: the tranche must debit the balance"
    } else if new_pool.committed != old_pool.committed - amount {
      fail @"treasury: the tranche must debit committed"
    } else {
      True
    }
  }
}

/// The shared close/cancel effect: the project keeps its id, spec, and
/// `next_milestone` and flips to the requested final status; the pool releases
/// the unspent milestones and keeps the balance (ADR 0010 §6, spec §7).
fn release_project(
  state_nft_policy: PolicyId,
  policy_id: PolicyId,
  status: ProjectStatus,
  own_ref: OutputReference,
  pool: Input,
  old_pool: PoolDatum,
  project: Input,
  old: ProjectDatum,
  self: Transaction,
) -> Bool {
  let written = project_datum_of(
    one_token_output(policy_id, old.project_id, policy_id, self),
  )
  let new_pool = datum_of(only_pool_output(pool, self, state_nft_policy))
  if own_ref != pool.output_reference && own_ref != project.output_reference {
    fail @"treasury: the release spends the project and the pool"
  } else if old.status != ProjectOpen {
    fail @"treasury: only an open project can be released"
  } else if written.project_id != old.project_id {
    fail @"treasury: the release must keep the project id"
  } else if written.spec != old.spec {
    fail @"treasury: the release must keep the approved spec"
  } else if written.next_milestone != old.next_milestone {
    fail @"treasury: the release must keep next_milestone"
  } else if written.status != status {
    fail @"treasury: the release must write the final status"
  } else if new_pool.balance != old_pool.balance {
    fail @"treasury: the release must not change the balance"
  } else if new_pool.committed != old_pool.committed - remaining_amount(old) {
    fail @"treasury: the release must free the remaining milestones"
  } else if new_pool.committed < 0 {
    fail @"treasury: committed cannot go negative"
  } else {
    True
  }
}

/// `CloseProject` (ADR 0010 §6, spec §7): the board threshold closes an open
/// project before its deadline; from the deadline it is permissionless, because
/// tranches have stopped and the only effect left is to return the remainder.
pub fn close_project(
  state_nft_policy: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let pool = only_pool_input(state_nft_policy, self)
  let policy_id = treasury_policy(pool)
  let old_pool = datum_of(pool.output)
  let (project, old) = only_project_input(policy_id, self)
  let permissionless = voting.not_before(lower_bound(self), old.spec.deadline)
  // A permissionless close reads no config: the deadline alone is the authority.
  let authorized = if permissionless {
    True
  } else {
    let config = config_ref.find(state_nft_policy, self)
    config_rules.board_signers(config, self) >= config.board_threshold
  }
  if authorized {
    release_project(
      state_nft_policy,
      policy_id,
      ProjectClosed,
      own_ref,
      pool,
      old_pool,
      project,
      old,
      self,
    )
  } else {
    fail @"treasury: a close before the deadline needs the board"
  }
}

/// The spent `Passed` cancel proposal for this project. The vote is the
/// authority, so no signature is required (ADR 0010 §6).
fn spent_cancel_proposal(
  config: ConfigDatum,
  project_id: AssetName,
  self: Transaction,
) -> ProposalDatum {
  let proposals = list.filter(
    self.inputs,
    fn(input) {
      if input.output.address.payment_credential != Script(
        config.governance_policy,
      ) {
        False
      } else {
        expect proposal: ProposalDatum = inline_datum(input.output)
        and {
          proposal.payload == Cancel(project_id),
          proposal.status == Passed,
        }
      }
    },
  )
  when proposals is {
    [input] -> {
      expect proposal: ProposalDatum = inline_datum(input.output)
      proposal
    }
    _ -> fail @"treasury: exactly one passed cancel proposal required"
  }
}

/// `CancelProject` (ADR 0010 §6, spec §7): execute a passed cancel proposal
/// against an open project. The treasury requires the spent proposal and its
/// `Executed` output; governance requires this project's `Cancelled` box, so
/// neither side can land alone.
pub fn cancel_project(
  state_nft_policy: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let pool = only_pool_input(state_nft_policy, self)
  let policy_id = treasury_policy(pool)
  let old_pool = datum_of(pool.output)
  let (project, old) = only_project_input(policy_id, self)
  let config = config_ref.find(state_nft_policy, self)
  let proposal = spent_cancel_proposal(config, old.project_id, self)
  let executed_proposal = proposal_datum_of(
    one_token_output(
      config.governance_policy,
      proposal.id,
      config.governance_policy,
      self,
    ),
  )
  if executed_proposal.status != Executed {
    fail @"treasury: the cancel proposal must execute in this transaction"
  } else {
    release_project(
      state_nft_policy,
      policy_id,
      ProjectCancelled,
      own_ref,
      pool,
      old_pool,
      project,
      old,
      self,
    )
  }
}
