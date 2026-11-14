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

/// Ballot actions (ADR 0009 §5, §7). The ballot validator is parameterized by
/// the state NFT policy, so `Cast`, `Discard`, and `Count` find the config;
/// `Reveal` is self-contained and needs no reference input.
pub type BallotRedeemer {
  Cast { leaf: ByteArray }
  Reveal { choice: Choice, reveal_salt: ByteArray }
  Discard
  Count
}

pub type TallyCounts {
  count: Int,
  yes: Int,
  no: Int,
  abstain: Int,
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

fn ballot_inputs(config: ConfigDatum, self: Transaction) -> List<Input> {
  list.filter(
    self.inputs,
    fn(input) {
      input.output.address.payment_credential == Script(config.ballot_policy)
    },
  )
}

fn add_choice(total: (Int, Int, Int), choice: Choice) -> (Int, Int, Int) {
  let (yes, no, abstain) = total
  when choice is {
    Yes -> (yes + 1, no, abstain)
    No -> (yes, no + 1, abstain)
    Abstain -> (yes, no, abstain + 1)
  }
}

/// A ballot that a counting or discarding transaction may spend: of this
/// proposal, cast (its nullifier is in `nullifiers`), and burned here.
fn vote_checks(
  config: ConfigDatum,
  proposal: ProposalDatum,
  input: Input,
  expect_revealed: Bool,
  self: Transaction,
) -> VoteDatum {
  let (policy_id, nullifier) = single_vote(input.output.value)
  let vote = datum_of(input.output)
  if policy_id != config.ballot_policy {
    fail @"ballot_rules: config names a different ballot policy"
  } else if expect_revealed && vote.revealed == None {
    fail @"ballot_rules: only a revealed vote can be counted"
  } else if !expect_revealed && vote.revealed != None {
    fail @"ballot_rules: only an unrevealed vote can be discarded"
  } else if proposal.id != vote.proposal_id {
    fail @"ballot_rules: vote must name the proposal"
  } else if proposal.end != vote.end || proposal.reveal_end != vote.reveal_end {
    fail @"ballot_rules: vote deadlines must match the proposal"
  } else if !list.has(proposal.nullifiers, nullifier) {
    fail @"ballot_rules: the vote was never cast"
  } else if quantity_of(self.mint, policy_id, nullifier) != -1 {
    fail @"ballot_rules: the VOTE NFT must be burned"
  } else if list.any(
    self.outputs,
    fn(output) { quantity_of(output.value, policy_id, nullifier) != 0 },
  ) {
    fail @"ballot_rules: a counted or discarded vote cannot be recreated"
  } else {
    vote
  }
}

fn counted_vote(
  config: ConfigDatum,
  proposal: ProposalDatum,
  input: Input,
  self: Transaction,
) -> Choice {
  let vote = vote_checks(config, proposal, input, True, self)
  expect Some(choice) = vote.revealed
  choice
}

/// Sum 1–10 revealed ballots of this proposal. Every ballot input in the
/// transaction must be one of them; mixed proposals fail.
pub fn tally(
  config: ConfigDatum,
  proposal: ProposalDatum,
  self: Transaction,
) -> TallyCounts {
  let ballots = ballot_inputs(config, self)
  if list.is_empty(ballots) {
    fail @"ballot_rules: tally spends at least one ballot"
  } else if list.length(ballots) > voting.max_tally_batch {
    fail @"ballot_rules: tally batch is at most ten ballots"
  } else {
    let totals = list.foldl(
      ballots,
      (0, 0, 0),
      fn(input, total) {
        add_choice(total, counted_vote(config, proposal, input, self))
      },
    )
    let (yes, no, abstain) = totals
    TallyCounts { count: list.length(ballots), yes, no, abstain }
  }
}

/// The spend half of count: this vote is revealed and burned.
pub fn count(
  config: ConfigDatum,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let proposal = proposal_input(config, self)
  if proposal.status != Open {
    fail @"ballot_rules: count on a closed proposal"
  } else if !voting.not_before(lower_bound(self), proposal.end) {
    fail @"ballot_rules: count before the voting window ends"
  } else {
    expect _choice = counted_vote(
      config,
      proposal,
      spent_input(own_ref, self),
      self,
    )
    True
  }
}

/// The mint half of count: every burn belongs to a counted ballot and every
/// counted ballot is burned exactly once.
pub fn count_mint(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.ballot_policy != policy_id {
    fail @"ballot_rules: config names a different ballot policy"
  } else {
    let proposal = proposal_input(config, self)
    if proposal.status != Open {
      fail @"ballot_rules: count on a closed proposal"
    } else if !voting.not_before(lower_bound(self), proposal.end) {
      fail @"ballot_rules: count before the voting window ends"
    } else {
      let counts = tally(config, proposal, self)
      let names = list.map(
        ballot_inputs(config, self),
        fn(input) {
          let (_, name) = single_vote(input.output.value)
          name
        },
      )
      let mints = dict.to_pairs(tokens(self.mint, policy_id))
      if list.length(mints) != counts.count || list.length(mints) != list.length(
        names,
      ) {
        fail @"ballot_rules: count burns exactly the collected ballots"
      } else if !list.all(
        mints,
        fn(Pair(name, quantity)) { quantity == -1 && list.has(names, name) },
      ) {
        fail @"ballot_rules: count burns exactly the collected ballots"
      } else {
        True
      }
    }
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
  let proposal = proposal_input(config, self)
  if proposal.status != Open {
    fail @"ballot_rules: discard on a closed proposal"
  } else if !voting.not_before(lower_bound(self), proposal.reveal_end) {
    fail @"ballot_rules: discard before the reveal window ends"
  } else {
    expect _vote = vote_checks(config, proposal, input, False, self)
    True
  }
}

/// True when this transaction burns the input ballot's VOTE NFT and does not
/// recreate it. Governance `Discard` requires this so it cannot pair with
/// `Reveal` at the window boundary.
pub fn vote_is_burned(
  config: ConfigDatum,
  input: Input,
  self: Transaction,
) -> Bool {
  let (policy_id, nullifier) = single_vote(input.output.value)
  and {
    policy_id == config.ballot_policy,
    quantity_of(self.mint, policy_id, nullifier) == -1,
    !list.any(
      self.outputs,
      fn(output) { quantity_of(output.value, policy_id, nullifier) != 0 },
    ),
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
