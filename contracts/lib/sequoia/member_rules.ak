use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/address.{Script, VerificationKey}
use cardano/assets.{
  AssetName, Assets, PolicyId, flatten, quantity_of, tokens, without_lovelace,
}
use cardano/transaction.{Output, OutputReference, Transaction}
use sequoia/tx.{inline_datum, lower_bound, one_token_output}
use sequoia/types.{
  Active, ConfigDatum, KycDatum, MemberDatum, capital_participation_asset_name,
  member_capital_asset_name,
}

// Member record rules (ADR 0008 §5, §6). `Join` creates the record; every spend
// keeps the tokens at the script and the identity fields fixed. Contribution
// (#25) reuses `keep` and adds its own datum change.

fn datum_of(output: Output) -> MemberDatum {
  expect datum: MemberDatum = inline_datum(output)
  datum
}

fn reserved(asset_name: AssetName) -> Bool {
  asset_name == member_capital_asset_name || asset_name == capital_participation_asset_name
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
    } else if reserved(member_id) {
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

/// The spend invariant shared by every member-box action: the owner signs, and
/// the same box (same owner, id, class, join time) at the same script receives
/// every `MEMBER`/`MCAP`/`PROJ` unit and no other output holds any.
pub fn keep(
  own_ref: OutputReference,
  self: Transaction,
) -> (MemberDatum, MemberDatum) {
  let spent = list.find(
    self.inputs,
    fn(input) { input.output_reference == own_ref },
  )
  expect Some(input) = spent
  let script_hash = when input.output.address.payment_credential is {
    Script(hash) -> hash
    VerificationKey(_) -> fail @"member_rules: member box must be at a script"
  }
  let old_datum = datum_of(input.output)
  let output = one_token_output(
    script_hash,
    old_datum.member_id,
    script_hash,
    self,
  )
  let new_datum = datum_of(output)
  let total_member = total_in(self, script_hash, old_datum.member_id)
  let total_member_capital = total_in(
    self,
    script_hash,
    member_capital_asset_name,
  )
  let total_participation = total_in(
    self,
    script_hash,
    capital_participation_asset_name,
  )
  let holders = list.count(
    self.outputs,
    fn(candidate) {
      holds_member_assets(candidate.value, script_hash, old_datum.member_id)
    },
  )
  if !signed(self, old_datum.owner) {
    fail @"member_rules: owner must sign"
  } else if quantity_of(output.value, script_hash, old_datum.member_id) != total_member {
    fail @"member_rules: the member NFT must be conserved"
  } else if quantity_of(output.value, script_hash, member_capital_asset_name) != total_member_capital {
    fail @"member_rules: member capital must be conserved"
  } else if quantity_of(
    output.value,
    script_hash,
    capital_participation_asset_name,
  ) != total_participation {
    fail @"member_rules: capital participation must be conserved"
  } else if holders != 1 {
    fail @"member_rules: member tokens must stay in one member box"
  } else if new_datum.owner != old_datum.owner {
    fail @"member_rules: owner must not change"
  } else if new_datum.member_id != old_datum.member_id {
    fail @"member_rules: member id must not change"
  } else if new_datum.class != old_datum.class {
    fail @"member_rules: class must not change"
  } else if new_datum.joined_at != old_datum.joined_at {
    fail @"member_rules: joined_at must not change"
  } else {
    (old_datum, new_datum)
  }
}

/// A plain spend may only move the record: no datum field changes (ADR 0008
/// §6.1). Later actions change their own fields on top of `keep`.
pub fn transfer(own_ref: OutputReference, self: Transaction) -> Bool {
  let (old_datum, new_datum) = keep(own_ref, self)
  if new_datum.status != old_datum.status {
    fail @"member_rules: transfer cannot change status"
  } else if new_datum.last_contribution_year != old_datum.last_contribution_year {
    fail @"member_rules: transfer cannot change the contribution year"
  } else if new_datum.last_voted_proposal != old_datum.last_voted_proposal {
    fail @"member_rules: transfer cannot change the last vote"
  } else {
    True
  }
}
