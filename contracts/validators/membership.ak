use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/bank_rules
use sequoia/config_ref
use sequoia/types.{BurnBankProof, IssueBankProof, MembershipRedeemer}

/// The member record and its tokens. One script mints and burns `MEMBER`,
/// `MCAP`, `PROJ`, and `BANK`; #23 implements the bank-proof branches and #24
/// and #25 add join, spend, and contribute (ADR 0008 §2, §5).
validator membership(state_nft_policy: PolicyId) {
  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: MembershipRedeemer = redeemer
    when action is {
      IssueBankProof -> bank_rules.issue(config, policy_id, self)
      BurnBankProof -> bank_rules.cancel(config, policy_id, self)
    }
  }

  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    _self: Transaction,
  ) {
    fail @"membership: member box actions arrive with join (#24)"
  }

  else(_) {
    fail @"membership: unsupported purpose"
  }
}
