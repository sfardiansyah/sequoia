use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/treasury_rules
use sequoia/types.{
  AttestPool, CancelProject, CloseProject, ReserveProject, SpendTranche,
  TreasuryRedeemer,
}

/// Treasury pool and project boxes, and the `PROJECT` NFT policy (ADR 0010 §1).
/// The pool is the input holding the one `POOL` token at this script; a project
/// box holds a `PROJECT` token and is written by the reserve, tranche, close,
/// and cancel rules.
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
      ReserveProject ->
        treasury_rules.reserve_project(state_nft_policy, Some(own_ref), self)
      SpendTranche { evidence_hash, bank_ref_hash } ->
        treasury_rules.spend_tranche(
          state_nft_policy,
          evidence_hash,
          bank_ref_hash,
          own_ref,
          self,
        )
      CloseProject ->
        treasury_rules.close_project(state_nft_policy, own_ref, self)
      CancelProject ->
        treasury_rules.cancel_project(state_nft_policy, own_ref, self)
    }
  }

  mint(_redeemer: Data, _policy_id: PolicyId, self: Transaction) {
    treasury_rules.reserve_project(state_nft_policy, None, self)
  }

  else(_) {
    fail @"treasury: unsupported purpose"
  }
}
