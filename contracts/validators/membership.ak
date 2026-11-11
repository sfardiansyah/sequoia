use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/bank_rules
use sequoia/config_ref
use sequoia/member_rules
use sequoia/types.{
  BurnBankProof, IssueBankProof, Join, MembershipRedeemer, Transfer,
}

/// The member record and its tokens. One script mints and burns `MEMBER`,
/// `MCAP`, `PROJ`, and `BANK`; #24 adds join and the spend invariant, and #25
/// adds contribution (ADR 0008 §2, §5).
validator membership(state_nft_policy: PolicyId) {
  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: MembershipRedeemer = redeemer
    when action is {
      IssueBankProof -> bank_rules.issue(config, policy_id, self)
      BurnBankProof -> bank_rules.cancel(config, policy_id, self)
      Join -> member_rules.join(config, policy_id, self)
      Transfer -> fail @"membership: transfer is a spend action"
    }
  }

  spend(
    _datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect action: MembershipRedeemer = redeemer
    when action is {
      Transfer -> member_rules.transfer(own_ref, self)
      _ -> fail @"membership: action is not a spend action"
    }
  }

  else(_) {
    fail @"membership: unsupported purpose"
  }
}
