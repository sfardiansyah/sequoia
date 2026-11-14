use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId, quantity_of, tokens}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use sequoia/config_rules
use sequoia/kyc_rules
use sequoia/tx.{
  inline_datum, lower_bound, one_token_output, signed, spent_input, upper_bound,
}
use sequoia/types.{
  Active, Config, ConfigDatum, MemberDatum, Open, ProposalDatum, VoteDatum,
}
use sequoia/voting

/// Governance proposal rules (ADR 0009 §1, §2, §4, §6). Creation, cast, and
/// discard are #29–#30; tally, finalize, and execute land in #31–#33.
fn datum_of(output: Output) -> ProposalDatum {
  expect datum: ProposalDatum = inline_datum(output)
  datum
}

/// The proposer's own member box, matched by owner and required to be active and
/// to hold its `MEMBER` NFT. Exactly one may be referenced.
fn member_reference(
  config: ConfigDatum,
  proposer: VerificationKeyHash,
  self: Transaction,
) -> MemberDatum {
  let found = list.filter(
    self.reference_inputs,
    fn(input) {
      if input.output.address.payment_credential != Script(
        config.membership_policy,
      ) {
        False
      } else {
        expect datum: MemberDatum = inline_datum(input.output)
        and {
          datum.owner == proposer,
          datum.status == Active,
          quantity_of(
            input.output.value,
            config.membership_policy,
            datum.member_id,
          ) == 1,
        }
      }
    },
  )
  when found is {
    [input] -> {
      expect datum: MemberDatum = inline_datum(input.output)
      datum
    }
    _ ->
      fail @"governance_rules: exactly one active member reference input required"
  }
}

fn fresh_proposal(datum: ProposalDatum) -> Bool {
  and {
    datum.nullifiers == [],
    datum.discarded == 0,
    datum.tallied == 0,
    datum.yes == 0,
    datum.no == 0,
    datum.abstain == 0,
    datum.status == Open,
    datum.finalized_at == None,
  }
}

/// Creation is the PROPOSAL NFT mint: one proposal box, one board-attested
/// eligible leaf set, and the proposed config fixed for the whole vote.
pub fn create_proposal(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  expect [Pair(id, 1)] = tokens(self.mint, policy_id) |> dict.to_pairs()
  let output = one_token_output(policy_id, id, policy_id, self)
  let datum = datum_of(output)
  let lower = lower_bound(self)
  let upper = upper_bound(self)
  let member = member_reference(config, datum.proposer, self)
  let kyc = kyc_rules.live_kyc(config, member.member_id, self)
  if config.governance_policy != policy_id {
    fail @"governance_rules: config names a different governance policy"
  } else if bytearray.length(id) != 32 {
    fail @"governance_rules: proposal id must be 32 bytes"
  } else if datum.id != id {
    fail @"governance_rules: datum id must match the token name"
  } else if datum.kind != Config {
    fail @"governance_rules: only config proposals are supported"
  } else if !signed(self, datum.proposer) {
    fail @"governance_rules: proposer must sign"
  } else if config.board_threshold < 1 {
    fail @"governance_rules: board threshold must be at least 1"
  } else if config_rules.board_signers(config, self) < config.board_threshold {
    fail @"governance_rules: board threshold not met"
  } else if kyc.member_id != member.member_id {
    fail @"governance_rules: KYC member id must match"
  } else if kyc.level < 1 {
    fail @"governance_rules: KYC level must be at least 1"
  } else if kyc.expires_at <= upper {
    fail @"governance_rules: KYC attestation has expired"
  } else if list.is_empty(datum.eligible_leaves) {
    fail @"governance_rules: the eligible leaf list must not be empty"
  } else if !list.all(
    datum.eligible_leaves,
    fn(leaf) { bytearray.length(leaf) == 32 },
  ) {
    fail @"governance_rules: eligible leaves must be 32 bytes"
  } else if !config_rules.immutable_unchanged(config, datum.proposed_config) {
    fail @"governance_rules: immutable config fields must not change"
  } else if !config_rules.invariants_hold(datum.proposed_config) {
    fail @"governance_rules: proposed config breaks the invariants"
  } else if !voting.window_is_tight(lower, upper) {
    fail @"governance_rules: creation window must be at most one hour"
  } else if datum.start != lower {
    fail @"governance_rules: start must equal the validity lower bound"
  } else if datum.end != voting.end_of_voting(lower, config.voting_days) {
    fail @"governance_rules: voting end must follow the config"
  } else if datum.reveal_end != voting.end_of_reveal(
    datum.end,
    config.reveal_days,
  ) {
    fail @"governance_rules: reveal end must follow the config"
  } else if !fresh_proposal(datum) {
    fail @"governance_rules: a new proposal is open with empty counters"
  } else {
    True
  }
}

fn returned_proposal(
  config: ConfigDatum,
  id: ByteArray,
  self: Transaction,
) -> ProposalDatum {
  datum_of(
    one_token_output(
      config.governance_policy,
      id,
      config.governance_policy,
      self,
    ),
  )
}

fn ballot_inputs(
  config: ConfigDatum,
  id: ByteArray,
  self: Transaction,
) -> List<Input> {
  list.filter(
    self.inputs,
    fn(input) {
      if input.output.address.payment_credential != Script(config.ballot_policy) {
        False
      } else {
        expect vote: VoteDatum = inline_datum(input.output)
        vote.proposal_id == id
      }
    },
  )
}

fn same_counters(old: ProposalDatum, new: ProposalDatum) -> Bool {
  and {
    new.tallied == old.tallied,
    new.yes == old.yes,
    new.no == old.no,
    new.abstain == old.abstain,
    new.status == old.status,
    new.finalized_at == old.finalized_at,
  }
}

fn unchanged_by_cast(old: ProposalDatum, new: ProposalDatum) -> Bool {
  and {
    same_counters(old, new),
    new.discarded == old.discarded,
  }
}

fn unchanged_by_discard(old: ProposalDatum, new: ProposalDatum) -> Bool {
  and {
    same_counters(old, new),
    new.nullifiers == old.nullifiers,
  }
}

/// `Cast` appends the freshly minted VOTE name to the proposal and changes
/// nothing else (ADR 0009 §6). The VOTE mint is checked here; the ballot mint
/// checks the vote box and eligibility.
pub fn cast(
  config: ConfigDatum,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let old = datum_of(spent_input(own_ref, self).output)
  expect [Pair(nullifier, 1)] = tokens(self.mint, config.ballot_policy)
    |> dict.to_pairs()
  let new = returned_proposal(config, old.id, self)
  if old.status != Open {
    fail @"governance_rules: cast on a closed proposal"
  } else if !voting.not_before(lower_bound(self), old.start) {
    fail @"governance_rules: cast before the voting window"
  } else if !voting.not_after(upper_bound(self), old.end) {
    fail @"governance_rules: cast after the voting window"
  } else if bytearray.length(nullifier) != 32 {
    fail @"governance_rules: nullifier must be 32 bytes"
  } else if list.has(old.nullifiers, nullifier) {
    fail @"governance_rules: nullifier already cast"
  } else if !keep_proposal(old, new) {
    fail @"governance_rules: cast must preserve the proposal identity"
  } else if new.nullifiers != list.concat(old.nullifiers, [nullifier]) {
    fail @"governance_rules: cast must append exactly the new nullifier"
  } else if !unchanged_by_cast(old, new) {
    fail @"governance_rules: cast must not touch counters or status"
  } else {
    True
  }
}

/// `Discard` burns one unrevealed ballot and records it so finalize can require
/// `tallied + discarded == cast`. One ballot per transaction (ADR 0009 §5).
pub fn discard(
  config: ConfigDatum,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let old = datum_of(spent_input(own_ref, self).output)
  let new = returned_proposal(config, old.id, self)
  let ballots = ballot_inputs(config, old.id, self)
  if old.status != Open {
    fail @"governance_rules: discard on a closed proposal"
  } else if !voting.not_before(lower_bound(self), old.reveal_end) {
    fail @"governance_rules: discard before the reveal window ends"
  } else if list.length(ballots) != 1 {
    fail @"governance_rules: discard spends exactly one ballot"
  } else if !keep_proposal(old, new) {
    fail @"governance_rules: discard must preserve the proposal identity"
  } else if new.discarded != old.discarded + 1 {
    fail @"governance_rules: discard must increment the counter by one"
  } else if !unchanged_by_discard(old, new) {
    fail @"governance_rules: discard must not touch other fields"
  } else {
    True
  }
}

/// The identity half of the proposal-datum invariant (ADR 0009 §6): every
/// action must keep these fields byte-identical. The action that owns a counter,
/// `status`, or `finalized_at` checks those fields itself.
pub fn keep_proposal(old: ProposalDatum, new: ProposalDatum) -> Bool {
  and {
    new.id == old.id,
    new.proposer == old.proposer,
    new.kind == old.kind,
    new.proposed_config == old.proposed_config,
    new.eligible_leaves == old.eligible_leaves,
    new.start == old.start,
    new.end == old.end,
    new.reveal_end == old.reveal_end,
  }
}
