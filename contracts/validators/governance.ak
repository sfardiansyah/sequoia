use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/config_ref
use sequoia/governance_rules
use sequoia/types.{Cast, Discard, Execute, Finalize, GovernanceRedeemer, Tally}

/// Proposal box and PROPOSAL NFT (ADR 0009 §1, §5, §6). `state_nft_policy`
/// locates the config box. Creation is the mint; cast, discard, tally, finalize,
/// and execute are spends.
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
    expect action: GovernanceRedeemer = redeemer
    when action is {
      Execute -> governance_rules.execute(state_nft_policy, own_ref, self)
      Cast -> {
        let config = config_ref.find(state_nft_policy, self)
        governance_rules.cast(config, own_ref, self)
      }
      Discard -> {
        let config = config_ref.find(state_nft_policy, self)
        governance_rules.discard(config, own_ref, self)
      }
      Tally -> {
        let config = config_ref.find(state_nft_policy, self)
        governance_rules.tally(config, own_ref, self)
      }
      Finalize -> {
        let config = config_ref.find(state_nft_policy, self)
        governance_rules.finalize(config, own_ref, self)
      }
    }
  }

  else(_) {
    fail @"governance: unsupported purpose"
  }
}
