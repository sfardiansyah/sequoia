use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Script}
use cardano/assets.{AssetName, PolicyId, quantity_of, tokens}
use cardano/transaction.{Output, OutputReference, Transaction}
use sequoia/tx.{inline_datum, lower_bound, one_token_output, require_key_signer}
use sequoia/types.{ConfigDatum, KycDatum}

// KYC attestation rules (ADR 0008 §4, §5, §6). Issuance is checked by the mint
// handler; renewal is spend-only because burning and minting the same
// `member_id` nets to zero and never invokes the mint handler.

fn datum_of(output: Output) -> KycDatum {
  expect datum: KycDatum = inline_datum(output)
  datum
}

fn checked_datum(
  datum: KycDatum,
  asset_name: AssetName,
  issuer: VerificationKeyHash,
  self: Transaction,
) -> Bool {
  if datum.member_id != asset_name {
    fail @"kyc_rules: member id must match the token name"
  } else if datum.issuer != issuer {
    fail @"kyc_rules: datum issuer must be the signer"
  } else if datum.level < 1 {
    fail @"kyc_rules: level must be at least 1"
  } else if datum.commitment == #"" {
    fail @"kyc_rules: commitment must not be empty"
  } else if datum.issued_at != lower_bound(self) {
    fail @"kyc_rules: issued_at must equal the validity lower bound"
  } else if datum.expires_at <= datum.issued_at {
    fail @"kyc_rules: expiry must be after issue"
  } else {
    True
  }
}

/// The asset name held by the KYC box being spent.
fn spent_attestation(
  policy_id: PolicyId,
  own_ref: OutputReference,
  self: Transaction,
) -> AssetName {
  let spent = list.find(
    self.inputs,
    fn(input) { input.output_reference == own_ref },
  )
  expect Some(input) = spent
  expect [Pair(asset_name, 1)] = tokens(input.output.value, policy_id)
    |> dict.to_pairs()
  asset_name
}

pub fn issue(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.kyc_policy != policy_id {
    fail @"kyc_rules: config names a different KYC policy"
  } else {
    let issuer = require_key_signer(config.kyc_issuer, self)
    expect [Pair(asset_name, 1)] = tokens(self.mint, policy_id)
      |> dict.to_pairs()
    checked_datum(
      datum_of(one_token_output(policy_id, asset_name, policy_id, self)),
      asset_name,
      issuer,
      self,
    )
  }
}

pub fn renew(
  config: ConfigDatum,
  own_ref: OutputReference,
  old_datum: KycDatum,
  self: Transaction,
) -> Bool {
  let issuer = require_key_signer(config.kyc_issuer, self)
  let asset_name = spent_attestation(config.kyc_policy, own_ref, self)
  let new_datum = datum_of(
    one_token_output(config.kyc_policy, asset_name, config.kyc_policy, self),
  )
  if old_datum.issuer != issuer {
    fail @"kyc_rules: attestation was not issued by the signer"
  } else if old_datum.member_id != asset_name {
    fail @"kyc_rules: member id must match the token name"
  } else if new_datum.expires_at <= old_datum.expires_at {
    fail @"kyc_rules: renewal must extend the expiry"
  } else {
    checked_datum(new_datum, asset_name, issuer, self)
  }
}

pub fn revoke(
  config: ConfigDatum,
  own_ref: OutputReference,
  old_datum: KycDatum,
  self: Transaction,
) -> Bool {
  let issuer = require_key_signer(config.kyc_issuer, self)
  let asset_name = spent_attestation(config.kyc_policy, own_ref, self)
  if old_datum.issuer != issuer {
    fail @"kyc_rules: attestation was not issued by the signer"
  } else if old_datum.member_id != asset_name {
    fail @"kyc_rules: member id must match the token name"
  } else if quantity_of(self.mint, config.kyc_policy, asset_name) != -1 {
    fail @"kyc_rules: revoke must burn exactly one attestation"
  } else if list.any(
    self.outputs,
    fn(output) { quantity_of(output.value, config.kyc_policy, asset_name) != 0 },
  ) {
    fail @"kyc_rules: a revoked attestation cannot be recreated"
  } else {
    True
  }
}

pub fn revoke_mint(
  config: ConfigDatum,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  if config.kyc_policy != policy_id {
    fail @"kyc_rules: config names a different KYC policy"
  } else {
    let issuer = require_key_signer(config.kyc_issuer, self)
    expect [Pair(asset_name, -1)] = tokens(self.mint, policy_id)
      |> dict.to_pairs()
    let sources = list.filter(
      self.inputs,
      fn(input) {
        quantity_of(input.output.value, policy_id, asset_name) == 1 && input.output.address.payment_credential == Script(
          policy_id,
        )
      },
    )
    if list.any(
      self.outputs,
      fn(output) { quantity_of(output.value, policy_id, asset_name) != 0 },
    ) {
      fail @"kyc_rules: a revoked attestation cannot be recreated"
    } else {
      when sources is {
        [input] -> {
          let old_datum = datum_of(input.output)
          if old_datum.member_id != asset_name {
            fail @"kyc_rules: member id must match the token name"
          } else if old_datum.issuer != issuer {
            fail @"kyc_rules: attestation was not issued by the signer"
          } else {
            True
          }
        }
        _ -> fail @"kyc_rules: revoke must spend one KYC box"
      }
    }
  }
}
