use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Script, VerificationKey}
use cardano/assets.{
  AssetName, Assets, PolicyId, flatten, quantity_of, tokens, without_lovelace,
}
use cardano/transaction.{Input, Output, OutputReference, Transaction}
use sequoia/split
use sequoia/tx.{inline_datum, lower_bound, one_token_output}
use sequoia/types.{
  Active, BankProofDatum, ConfigDatum, Founder, KycDatum, MemberClass,
  MemberDatum, Standard, capital_participation_asset_name,
  member_capital_asset_name, reserved_asset_name,
}

// Member record rules (ADR 0008 §5, §6). `Join` creates the record; every spend
// keeps the tokens at the script and the identity fields fixed. Contribution is
// a mint and a spend, and updates only the contribution year.

fn datum_of(output: Output) -> MemberDatum {
  expect datum: MemberDatum = inline_datum(output)
  datum
}

fn proof_datum_of(output: Output) -> BankProofDatum {
  expect datum: BankProofDatum = inline_datum(output)
  datum
}

fn signed(self: Transaction, key: ByteArray) -> Bool {
  list.any(self.extra_signatories, fn(signer) { signer == key })
}

/// The live KYC attestation for `member_id`: exactly one reference input at the
/// KYC script holding the id token, with an inline datum (ADR 0008 §5, §6).
fn live_kyc(
  config: ConfigDatum,
  member_id: AssetName,
  self: Transaction,
) -> KycDatum {
  let found = list.filter(
    self.reference_inputs,
    fn(input) {
      quantity_of(input.output.value, config.kyc_policy, member_id) == 1
    },
  )
  when found is {
    [input] ->
      if input.output.address.payment_credential != Script(config.kyc_policy) {
        fail @"member_rules: KYC box must stay at the KYC script"
      } else {
        expect datum: KycDatum = inline_datum(input.output)
        datum
      }
    _ -> fail @"member_rules: exactly one live KYC box required"
  }
}

/// Board admission: `board_threshold` distinct board keys are required signers.
fn board_signers(config: ConfigDatum, self: Transaction) -> Int {
  list.count(config.board_keys, fn(key) { signed(self, key) })
}

/// Join is a mint-only admission: one `MEMBER` NFT in a box holding nothing
/// else, funded by the member, approved by the board and a live KYC.
pub fn join(config: ConfigDatum, policy_id: PolicyId, self: Transaction) -> Bool {
  if config.membership_policy != policy_id {
    fail @"member_rules: config names a different membership policy"
  } else {
    expect [Pair(member_id, 1)] = tokens(self.mint, policy_id)
      |> dict.to_pairs()
    if member_id == #"" {
      fail @"member_rules: member id must not be empty"
    } else if bytearray.length(member_id) > 32 {
      fail @"member_rules: member id must be at most 32 bytes"
    } else if reserved_asset_name(member_id) {
      fail @"member_rules: member id is a reserved asset name"
    } else {
      let kyc = live_kyc(config, member_id, self)
      let output = one_token_output(policy_id, member_id, policy_id, self)
      let datum = datum_of(output)
      let joined_at = lower_bound(self)
      let board = board_signers(config, self)
      if config.board_threshold < 1 {
        fail @"member_rules: board threshold must be at least 1"
      } else if board < config.board_threshold {
        fail @"member_rules: board threshold not met"
      } else if !signed(self, datum.owner) {
        fail @"member_rules: owner must sign"
      } else if datum.member_id != member_id {
        fail @"member_rules: datum member id must match the token name"
      } else if kyc.member_id != member_id {
        fail @"member_rules: KYC member id must match"
      } else if kyc.level < 1 {
        fail @"member_rules: KYC level must be at least 1"
      } else if kyc.expires_at <= joined_at {
        fail @"member_rules: KYC attestation has expired"
      } else if datum.status != Active {
        fail @"member_rules: joined member must be active"
      } else if datum.joined_at != joined_at {
        fail @"member_rules: joined_at must equal the validity lower bound"
      } else if datum.last_contribution_year != None {
        fail @"member_rules: joined member has no contribution year"
      } else if datum.last_voted_proposal != None {
        fail @"member_rules: joined member has no vote"
      } else if flatten(without_lovelace(output.value)) != [
        (policy_id, member_id, 1),
      ] {
        fail @"member_rules: the member box must hold only the member NFT"
      } else {
        True
      }
    }
  }
}

fn total_in(
  self: Transaction,
  policy_id: PolicyId,
  asset_name: AssetName,
) -> Int {
  list.foldl(
    self.inputs,
    0,
    fn(input, total) {
      total + quantity_of(input.output.value, policy_id, asset_name)
    },
  )
}

fn holds_member_assets(
  value: Assets,
  policy_id: PolicyId,
  member_id: AssetName,
) -> Bool {
  quantity_of(value, policy_id, member_id) != 0 || quantity_of(
    value,
    policy_id,
    member_capital_asset_name,
  ) != 0 || quantity_of(value, policy_id, capital_participation_asset_name) != 0
}

fn spent_member(
  own_ref: OutputReference,
  self: Transaction,
) -> (Input, MemberDatum, PolicyId) {
  let spent = list.find(
    self.inputs,
    fn(input) { input.output_reference == own_ref },
  )
  expect Some(input) = spent
  let script_hash = when input.output.address.payment_credential is {
    Script(hash) -> hash
    VerificationKey(_) -> fail @"member_rules: member box must be at a script"
  }
  (input, datum_of(input.output), script_hash)
}

/// Exactly one output holds the `MEMBER` NFT, and it sits at the membership
/// script.
fn returned_member(
  policy_id: PolicyId,
  member_id: AssetName,
  self: Transaction,
) -> Output {
  one_token_output(policy_id, member_id, policy_id, self)
}

/// The returned box holds every `MEMBER`/`MCAP`/`PROJ` unit from the inputs
/// plus the contribution's split, and no other output holds any of them.
fn conserved(
  policy_id: PolicyId,
  old_datum: MemberDatum,
  output: Output,
  added: (Int, Int),
  self: Transaction,
) -> Bool {
  let (added_member_capital, added_participation) = added
  let expected_member = total_in(self, policy_id, old_datum.member_id)
  let expected_member_capital = total_in(
    self,
    policy_id,
    member_capital_asset_name,
  ) + added_member_capital
  let expected_participation = total_in(
    self,
    policy_id,
    capital_participation_asset_name,
  ) + added_participation
  let holders = list.count(
    self.outputs,
    fn(candidate) {
      holds_member_assets(candidate.value, policy_id, old_datum.member_id)
    },
  )
  if quantity_of(output.value, policy_id, old_datum.member_id) != expected_member {
    fail @"member_rules: the member NFT must be conserved"
  } else if quantity_of(output.value, policy_id, member_capital_asset_name) != expected_member_capital {
    fail @"member_rules: member capital must be conserved"
  } else if quantity_of(
    output.value,
    policy_id,
    capital_participation_asset_name,
  ) != expected_participation {
    fail @"member_rules: capital participation must be conserved"
  } else if holders != 1 {
    fail @"member_rules: member tokens must stay in one member box"
  } else {
    True
  }
}

/// The spend invariant shared by every member-box action: the owner signs, and
/// the same box (same owner, id, class, join time) at the same script receives
/// every `MEMBER`/`MCAP`/`PROJ` unit and no other output holds any.
pub fn keep(
  own_ref: OutputReference,
  self: Transaction,
) -> (MemberDatum, MemberDatum, PolicyId) {
  let (_, old_datum, script_hash) = spent_member(own_ref, self)
  let output = returned_member(script_hash, old_datum.member_id, self)
  let new_datum = datum_of(output)
  if !signed(self, old_datum.owner) {
    fail @"member_rules: owner must sign"
  } else if !conserved(script_hash, old_datum, output, (0, 0), self) {
    fail @"member_rules: member tokens must be conserved"
  } else if new_datum.owner != old_datum.owner {
    fail @"member_rules: owner must not change"
  } else if new_datum.member_id != old_datum.member_id {
    fail @"member_rules: member id must not change"
  } else if new_datum.class != old_datum.class {
    fail @"member_rules: class must not change"
  } else if new_datum.joined_at != old_datum.joined_at {
    fail @"member_rules: joined_at must not change"
  } else {
    (old_datum, new_datum, script_hash)
  }
}

/// A plain spend may only move the record: no datum field changes and no
/// membership token is minted or burned (ADR 0008 §6.1).
pub fn transfer(own_ref: OutputReference, self: Transaction) -> Bool {
  let (old_datum, new_datum, policy_id) = keep(own_ref, self)
  if !dict.is_empty(tokens(self.mint, policy_id)) {
    fail @"member_rules: transfer cannot mint or burn"
  } else if new_datum.status != old_datum.status {
    fail @"member_rules: transfer cannot change status"
  } else if new_datum.last_contribution_year != old_datum.last_contribution_year {
    fail @"member_rules: transfer cannot change the contribution year"
  } else if new_datum.last_voted_proposal != old_datum.last_voted_proposal {
    fail @"member_rules: transfer cannot change the last vote"
  } else {
    True
  }
}

fn spent_proof(
  config: ConfigDatum,
  self: Transaction,
) -> (Input, BankProofDatum) {
  let found = list.filter(
    self.inputs,
    fn(input) {
      input.output.address.payment_credential == Script(config.bank_policy)
    },
  )
  when found is {
    [input] -> (input, proof_datum_of(input.output))
    _ -> fail @"member_rules: exactly one bank proof input required"
  }
}

fn member_input(
  policy_id: PolicyId,
  member_id: AssetName,
  self: Transaction,
) -> Input {
  let found = list.filter(
    self.inputs,
    fn(input) {
      input.output.address.payment_credential == Script(policy_id) && quantity_of(
        input.output.value,
        policy_id,
        member_id,
      ) == 1
    },
  )
  when found is {
    [input] -> input
    _ -> fail @"member_rules: exactly one member box required"
  }
}

// The split is a config value, so this is a config-level cap check; floor
// rounding can add at most one smallest unit of participation above it.
fn cap_exceeded(config: ConfigDatum, class: MemberClass) -> Bool {
  when class is {
    Standard ->
      config.capital_participation_bps > config.standard_capital_participation_max_bps
    Founder -> False
  }
}

/// The contribution core, called from both the mint and the spend purpose so
/// neither half can run without the other (ADR 0008 §5, §6.3–§6.6).
fn contribution(
  config: ConfigDatum,
  policy_id: PolicyId,
  member: Input,
  proof_input: Input,
  proof: BankProofDatum,
  self: Transaction,
) -> Bool {
  let old_datum = datum_of(member.output)
  let year = config.contribution_year
  let (member_capital, participation) = split.split(
    proof.amount,
    config.member_capital_bps,
    config.capital_participation_bps,
  )
  let output = returned_member(policy_id, old_datum.member_id, self)
  let new_datum = datum_of(output)
  let kyc = live_kyc(config, old_datum.member_id, self)
  let extra_mints = list.filter(
    dict.to_pairs(tokens(self.mint, policy_id)),
    fn(Pair(asset_name, _)) {
      asset_name != member_capital_asset_name && asset_name != capital_participation_asset_name && asset_name != proof.nonce
    },
  )
  if !signed(self, old_datum.owner) {
    fail @"member_rules: owner must sign"
  } else if old_datum.status != Active {
    fail @"member_rules: member must be active"
  } else if proof.member_id != old_datum.member_id {
    fail @"member_rules: bank proof member id must match"
  } else if proof.contribution_year != year {
    fail @"member_rules: bank proof year must match the config"
  } else if proof.amount != config.annual_amount {
    fail @"member_rules: bank proof amount must match the annual amount"
  } else if old_datum.last_contribution_year == Some(year) {
    fail @"member_rules: contribution already recorded for this year"
  } else if reserved_asset_name(proof.nonce) {
    fail @"member_rules: bank proof nonce is a reserved asset name"
  } else if proof.nonce == old_datum.member_id {
    fail @"member_rules: bank proof nonce must not be the member id"
  } else if !list.is_empty(extra_mints) {
    fail @"member_rules: contribution mints only the split and burns the proof"
  } else if quantity_of(proof_input.output.value, policy_id, proof.nonce) != 1 {
    fail @"member_rules: bank proof must hold its NFT"
  } else if quantity_of(self.mint, policy_id, member_capital_asset_name) != member_capital {
    fail @"member_rules: member capital must equal the split"
  } else if quantity_of(self.mint, policy_id, capital_participation_asset_name) != participation {
    fail @"member_rules: capital participation must equal the split"
  } else if quantity_of(self.mint, policy_id, proof.nonce) != -1 {
    fail @"member_rules: the bank proof NFT must be burned"
  } else if kyc.member_id != old_datum.member_id {
    fail @"member_rules: KYC member id must match"
  } else if kyc.level < 1 {
    fail @"member_rules: KYC level must be at least 1"
  } else if kyc.expires_at <= lower_bound(self) {
    fail @"member_rules: KYC attestation has expired"
  } else if cap_exceeded(config, old_datum.class) {
    fail @"member_rules: standard participation cap exceeded"
  } else if new_datum.owner != old_datum.owner {
    fail @"member_rules: owner must not change"
  } else if new_datum.member_id != old_datum.member_id {
    fail @"member_rules: member id must not change"
  } else if new_datum.class != old_datum.class {
    fail @"member_rules: class must not change"
  } else if new_datum.joined_at != old_datum.joined_at {
    fail @"member_rules: joined_at must not change"
  } else if new_datum.status != old_datum.status {
    fail @"member_rules: status must not change"
  } else if new_datum.last_contribution_year != Some(year) {
    fail @"member_rules: last contribution year must be the config year"
  } else if new_datum.last_voted_proposal != old_datum.last_voted_proposal {
    fail @"member_rules: the last vote must not change"
  } else {
    conserved(
      policy_id,
      old_datum,
      output,
      (member_capital, participation),
      self,
    )
  }
}

/// Contribution is a mint: the bank proof identifies the member box.
pub fn contribute_mint(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.membership_policy != policy_id {
    fail @"member_rules: config names a different membership policy"
  } else {
    let (proof_input, proof) = spent_proof(config, self)
    let member = member_input(policy_id, proof.member_id, self)
    contribution(config, policy_id, member, proof_input, proof, self)
  }
}

/// Contribution is also a spend of the member box; the call is bound to the box
/// being spent so a second member box cannot ride on the same proof.
pub fn contribute_spend(
  config: ConfigDatum,
  own_ref: OutputReference,
  self: Transaction,
) -> Bool {
  let (member, old_datum, script_hash) = spent_member(own_ref, self)
  if config.membership_policy != script_hash {
    fail @"member_rules: config names a different membership policy"
  } else {
    let (proof_input, proof) = spent_proof(config, self)
    if proof.member_id != old_datum.member_id {
      fail @"member_rules: bank proof member id must match"
    } else {
      contribution(config, script_hash, member, proof_input, proof, self)
    }
  }
}
