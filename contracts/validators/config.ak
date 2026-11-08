use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/types.{ConfigDatum}

/// The config box holds one contribution year's rulebook. M1 has no update path
/// (ADR 0008 §1, §6.7); M2 deploys a fresh genesis with a governance-gated spend
/// handler. `state_nft_policy` is the parameter M2 uses to find the State NFT.
validator config(state_nft_policy: PolicyId) {
  spend(
    _datum: Option<ConfigDatum>,
    _redeemer: Data,
    _own_ref: OutputReference,
    _self: Transaction,
  ) {
    fail @"config: immutable in M1"
  }

  else(_) {
    fail @"config: immutable in M1"
  }
}
