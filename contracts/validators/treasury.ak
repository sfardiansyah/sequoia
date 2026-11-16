use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/treasury_rules
use sequoia/types.{AttestPool, TreasuryRedeemer}

/// Treasury pool and project boxes, and the `PROJECT` NFT policy (ADR 0010 §1).
/// The pool is the input holding the one `POOL` token at this script; a project
/// box holds a `PROJECT` token and lands with the project rules.
validator treasury(state_nft_policy: PolicyId) {
  spend(
    _datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    expect action: TreasuryRedeemer = redeemer
    when action is {
      AttestPool { balance, bank_ref_hash } ->
        treasury_rules.attest_pool(
          state_nft_policy,
          balance,
          bank_ref_hash,
          own_ref,
          self,
        )
      _ -> fail @"treasury: action lands with the project rules"
    }
  }

  mint(_redeemer: Data, _policy_id: PolicyId, _self: Transaction) {
    fail @"treasury: the PROJECT mint lands with the project rules"
  }

  else(_) {
    fail @"treasury: unsupported purpose"
  }
}
