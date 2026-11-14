use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/config_ref
use sequoia/governance_rules
use sequoia/types.{Cast, Discard, GovernanceRedeemer}

/// Proposal box and PROPOSAL NFT (ADR 0009 §1, §5, §6). `state_nft_policy`
/// locates the config box. Creation is #29; cast and discard land in #30,
/// tally, finalize, and execute in #31–#33.
validator governance(state_nft_policy: PolicyId) {
  mint(_redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    governance_rules.create_proposal(config, policy_id, self)
  }

  spend(
    _datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: GovernanceRedeemer = redeemer
    when action is {
      Cast -> governance_rules.cast(config, own_ref, self)
      Discard -> governance_rules.discard(config, own_ref, self)
    }
  }

  else(_) {
    fail @"governance: unsupported purpose"
  }
}
