use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{
  AssetName, Assets, PolicyId, flatten, quantity_of, tokens, without_lovelace,
}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use sequoia/tx.{
  inline_datum, lower_bound, one_token_output, spent_input, upper_bound,
}
use sequoia/types.{
  Abstain, Choice, ConfigDatum, No, Open, ProposalDatum, VoteDatum, Yes,
}
use sequoia/voting

/// Ballot actions (ADR 0009 §5). The ballot validator is parameterized by the
/// state NFT policy, so `Cast` and `Discard` find the config; `Reveal` is
/// self-contained and needs no reference input.
pub type BallotRedeemer {
  Cast { leaf: ByteArray }
  Reveal { choice: Choice, reveal_salt: ByteArray }
  Discard
}

fn datum_of(output: Output) -> VoteDatum {
  expect datum: VoteDatum = inline_datum(output)
  datum
}

fn proposal_datum_of(output: Output) -> ProposalDatum {
  expect datum: ProposalDatum = inline_datum(output)
  datum
}

/// The single proposal box spent by a ballot or governance action. Ballot
/// actions serialize on this box (m2-governance §9).
fn proposal_input(config: ConfigDatum, self: Transaction) -> ProposalDatum {
  let found = list.filter(
    self.inputs,
    fn(input) {
      input.output.address.payment_credential == Script(
        config.governance_policy,
      )
    },
  )
  when found is {
    [input] -> proposal_datum_of(input.output)
    _ -> fail @"ballot_rules: exactly one proposal input required"
  }
}

/// A vote box holds its VOTE NFT and lovelace, nothing else. That keeps the
/// reveal path config-free: it can find the NFT without knowing the policy id.
fn single_vote(value: Assets) -> (PolicyId, AssetName) {
  expect [(policy_id, asset_name, 1)] = flatten(without_lovelace(value))
  (policy_id, asset_name)
}

fn choice_index(choice: Choice) -> Int {
  when choice is {
    Yes -> 0
    No -> 1
    Abstain -> 2
  }
}

/// Reveal may change only `revealed`; the voted identity stays fixed.
fn keep_vote(old: VoteDatum, new: VoteDatum) -> Bool {
  and {
    new.proposal_id == old.proposal_id,
    new.end == old.end,
    new.reveal_end == old.reveal_end,
    new.choice_commitment == old.choice_commitment,
  }
}

/// Minting a VOTE is the cast: the asset name is the nullifier, the leaf must be
/// eligible, both deadlines are copied from the proposal, and the choice is
/// committed (ADR 0009 §2, §3, §5).
pub fn cast(
  config: ConfigDatum,
  policy_id: PolicyId,
  leaf: ByteArray,
  self: Transaction,
) -> Bool {
  if config.ballot_policy != policy_id {
    fail @"ballot_rules: config names a different ballot policy"
  } else {
    expect [Pair(nullifier, 1)] = tokens(self.mint, policy_id)
      |> dict.to_pairs()
    let proposal = proposal_input(config, self)
    let output = one_token_output(policy_id, nullifier, policy_id, self)
    let vote = datum_of(output)
    if bytearray.length(nullifier) != 32 {
      fail @"ballot_rules: nullifier must be 32 bytes"
    } else if bytearray.length(leaf) != 32 {
      fail @"ballot_rules: eligible leaf must be 32 bytes"
    } else if !list.has(proposal.eligible_leaves, leaf) {
      fail @"ballot_rules: leaf is not eligible for this proposal"
    } else if proposal.status != Open {
      fail @"ballot_rules: cast on a closed proposal"
    } else if !voting.not_before(lower_bound(self), proposal.start) {
      fail @"ballot_rules: cast before the voting window"
    } else if !voting.not_after(upper_bound(self), proposal.end) {
      fail @"ballot_rules: cast after the voting window"
    } else if list.has(proposal.nullifiers, nullifier) {
      fail @"ballot_rules: nullifier already cast"
    } else if flatten(without_lovelace(output.value)) != [
      (policy_id, nullifier, 1),
    ] {
      fail @"ballot_rules: the vote box holds only the VOTE NFT"
    } else if vote.proposal_id != proposal.id {
      fail @"ballot_rules: vote must name the proposal"
    } else if vote.end != proposal.end {
      fail @"ballot_rules: vote must copy the voting deadline"
    } else if vote.reveal_end != proposal.reveal_end {
      fail @"ballot_rules: vote must copy the reveal deadline"
    } else if bytearray.length(vote.choice_commitment) != 32 {
      fail @"ballot_rules: choice commitment must be 32 bytes"
    } else if vote.revealed != None {
      fail @"ballot_rules: a cast vote is unrevealed"
    } else {
      True
    }
  }
}

/// `Reveal` reads the window and commitment from the vote box itself, so it
/// needs no proposal or config reference and members reveal in parallel.
pub fn reveal(
  own_ref: OutputReference,
  choice: Choice,
  reveal_salt: ByteArray,
  self: Transaction,
) -> Bool {
  let input = spent_input(own_ref, self)
  let (policy_id, nullifier) = single_vote(input.output.value)
  let old = datum_of(input.output)
  let output = one_token_output(policy_id, nullifier, policy_id, self)
  let new = datum_of(output)
  if old.revealed != None {
    fail @"ballot_rules: the vote is already revealed"
  } else if !voting.not_before(lower_bound(self), old.end) {
    fail @"ballot_rules: reveal before the voting window ends"
  } else if !voting.not_after(upper_bound(self), old.reveal_end) {
    fail @"ballot_rules: reveal after the reveal window ends"
  } else if !voting.commitment_matches(
    old.choice_commitment,
    choice_index(choice),
    reveal_salt,
  ) {
    fail @"ballot_rules: choice and salt do not open the commitment"
  } else if !keep_vote(old, new) {
    fail @"ballot_rules: reveal changes only the revealed choice"
  } else if new.revealed != Some(choice) {
    fail @"ballot_rules: reveal must record the choice"
  } else if flatten(without_lovelace(output.value)) != [
    (policy_id, nullifier, 1),
  ] {
    fail @"ballot_rules: the vote box holds only the VOTE NFT"
  } else {
    True
  }
}

fn discard_checks(config: ConfigDatum, input: Input, self: Transaction) -> Bool {
  let (policy_id, nullifier) = single_vote(input.output.value)
  let vote = datum_of(input.output)
  let proposal = proposal_input(config, self)
  if config.ballot_policy != policy_id {
    fail @"ballot_rules: config names a different ballot policy"
  } else if vote.revealed != None {
    fail @"ballot_rules: only an unrevealed vote can be discarded"
  } else if !voting.not_before(lower_bound(self), vote.reveal_end) {
    fail @"ballot_rules: discard before the reveal window ends"
  } else if proposal.id != vote.proposal_id {
    fail @"ballot_rules: vote must name the proposal"
  } else if proposal.status != Open {
    fail @"ballot_rules: discard on a closed proposal"
  } else if proposal.end != vote.end {
    fail @"ballot_rules: vote deadlines must match the proposal"
  } else if proposal.reveal_end != vote.reveal_end {
    fail @"ballot_rules: vote deadlines must match the proposal"
  } else if !list.has(proposal.nullifiers, nullifier) {
    fail @"ballot_rules: the vote was never cast"
  } else if quantity_of(self.mint, policy_id, nullifier) != -1 {
    fail @"ballot_rules: discard must burn the VOTE NFT"
  } else if list.any(
    self.outputs,
    fn(output) { quantity_of(output.value, policy_id, nullifier) != 0 },
  ) {
    fail @"ballot_rules: a discarded vote cannot be recreated"
  } else {
    True
  }
}

/// The spend half of discard: the burned vote is the input being spent.
pub fn discard(
  config: ConfigDatum,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  discard_checks(config, spent_input(own_ref, self), self)
}

/// The mint half of discard: a burn runs the policy with the same redeemer.
pub fn discard_mint(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  let ballots = list.filter(
    self.inputs,
    fn(input) { input.output.address.payment_credential == Script(policy_id) },
  )
  when ballots is {
    [input] -> discard_checks(config, input, self)
    _ -> fail @"ballot_rules: discard spends exactly one ballot"
  }
}
