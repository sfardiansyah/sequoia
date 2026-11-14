use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/config_rules
use sequoia/types.{ConfigDatum}

/// The config box holds one contribution year's rulebook. Its only spend is a
/// governance execution: a passed `Config` proposal writes `proposed_config`
/// after the timelock (ADR 0009 §6, §8). `state_nft_policy` locates the State
/// NFT. Genesis is deployer-trusted and does not run these checks.
validator config(state_nft_policy: PolicyId) {
  spend(
    _datum: Option<ConfigDatum>,
    _redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    config_rules.execute(state_nft_policy, own_ref, self)
  }

  else(_) {
    fail @"config: only a governance execution may spend the config box"
  }
}
