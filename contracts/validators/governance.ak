use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/config_ref
use sequoia/governance_rules

/// Proposal box and PROPOSAL NFT (ADR 0009 §1, §5, §6). `state_nft_policy`
/// locates the config box. Creation is #29; cast, discard, tally, finalize, and
/// execute land in #30–#33.
validator governance(state_nft_policy: PolicyId) {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    governance_rules.create_proposal(config, policy_id, self)
  }

  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    _self: Transaction,
  ) {
    fail @"governance: spend actions land in #30-#33"
  }

  else(_) {
    fail @"governance: unsupported purpose"
  }
}
