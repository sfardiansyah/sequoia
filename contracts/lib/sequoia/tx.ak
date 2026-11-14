use aiken/collection/list
use aiken/crypto.{ScriptHash, VerificationKeyHash}
use aiken/interval.{Finite}
use cardano/address.{Credential, Script, VerificationKey}
use cardano/assets.{AssetName, PolicyId, quantity_of}
use cardano/transaction.{InlineDatum, Output, Transaction}

/// Shared transaction helpers for the M1 validators.
/// M1 authorities are keys: a Plutus script cannot sign a transaction, and the
/// config names one operator key (ADR 0008 §7). Fails unless the credential is
/// a key and that key is a required signer.
pub fn require_key_signer(
  credential: Credential,
  self: Transaction,
) -> VerificationKeyHash {
  let key_hash = when credential is {
    VerificationKey(hash) -> hash
    Script(_) -> fail @"tx: authority must be a key in M1"
  }
  if list.any(self.extra_signatories, fn(signer) { signer == key_hash }) {
    key_hash
  } else {
    fail @"tx: authority must sign"
  }
}

/// A required signer, as the transaction body declares it (not a witness).
pub fn signed(self: Transaction, key: ByteArray) -> Bool {
  list.any(self.extra_signatories, fn(signer) { signer == key })
}

pub fn lower_bound(self: Transaction) -> Int {
  when self.validity_range.lower_bound.bound_type is {
    Finite(time) -> time
    _ -> fail @"tx: transaction needs a validity lower bound"
  }
}

pub fn upper_bound(self: Transaction) -> Int {
  when self.validity_range.upper_bound.bound_type is {
    Finite(time) -> time
    _ -> fail @"tx: transaction needs a validity upper bound"
  }
}

/// Inline datum of an output, or a clear failure for a missing or hashed datum.
pub fn inline_datum(output: Output) -> Data {
  when output.datum is {
    InlineDatum(raw) -> raw
    _ -> fail @"tx: datum must be inline"
  }
}

/// Exactly one output must hold one unit of the token, and that output must sit
/// at `script_hash` (which is the token's policy unless the box is a guard box).
pub fn one_token_output(
  policy_id: PolicyId,
  asset_name: AssetName,
  script_hash: ScriptHash,
  self: Transaction,
) -> Output {
  let holders = list.filter(
    self.outputs,
    fn(output) { quantity_of(output.value, policy_id, asset_name) == 1 },
  )
  when holders is {
    [output] ->
      if output.address.payment_credential != Script(script_hash) {
        fail @"tx: token must stay at its script"
      } else {
        output
      }
    _ -> fail @"tx: exactly one output must hold the token"
  }
}
