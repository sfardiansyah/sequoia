use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite}
use cardano/address.{Script, VerificationKey}
use cardano/assets.{AssetName, PolicyId, quantity_of, tokens}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use sequoia/types.{ConfigDatum, KycDatum}

// KYC attestation rules (ADR 0008 §4, §5, §6). Issuance is checked by the mint
// handler; renewal is spend-only because burning and minting the same
// `member_id` nets to zero and never invokes the mint handler.

/// The config names one issuer. M1 supports key issuers only: a Plutus script
/// cannot sign a transaction, and M1 runs one operator key (ADR 0008 §7).
fn require_issuer(config: ConfigDatum, self: Transaction) -> VerificationKeyHash {
  let key_hash = when config.kyc_issuer is {
    VerificationKey(hash) -> hash
    Script(_) -> fail @"kyc_rules: issuer must be a key in M1"
  }
  if list.any(self.extra_signatories, fn(signer) { signer == key_hash }) {
    key_hash
  } else {
    fail @"kyc_rules: kyc issuer must sign"
  }
}

fn lower_bound(self: Transaction) -> Int {
  when self.validity_range.lower_bound.bound_type is {
    Finite(time) -> time
    _ -> fail @"kyc_rules: transaction needs a validity lower bound"
  }
}

fn output_of_attestation(
  policy_id: PolicyId,
  asset_name: AssetName,
  self: Transaction,
) -> Output {
  let holders = list.filter(
    self.outputs,
    fn(output) { quantity_of(output.value, policy_id, asset_name) == 1 },
  )
  when holders is {
    [output] ->
      if output.address.payment_credential != Script(policy_id) {
        fail @"kyc_rules: attestation must stay at the KYC script"
      } else {
        output
      }
    _ -> fail @"kyc_rules: exactly one output must hold the attestation"
  }
}

fn datum_of(output: Output) -> KycDatum {
  when output.datum is {
    InlineDatum(raw) -> {
      expect datum: KycDatum = raw
      datum
    }
    _ -> fail @"kyc_rules: attestation datum must be inline"
  }
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
    let issuer = require_issuer(config, self)
    expect [Pair(asset_name, 1)] = tokens(self.mint, policy_id)
      |> dict.to_pairs()
    checked_datum(
      datum_of(output_of_attestation(policy_id, asset_name, self)),
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
  let issuer = require_issuer(config, self)
  let asset_name = spent_attestation(config.kyc_policy, own_ref, self)
  let new_datum = datum_of(
    output_of_attestation(config.kyc_policy, asset_name, self),
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
  let issuer = require_issuer(config, self)
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
    let issuer = require_issuer(config, self)
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
