use cardano/assets.{PolicyId}

/// Treasury pool and project boxes, and the `PROJECT` NFT policy (ADR 0010 §1).
/// The rules land with the treasury tickets; this stub fixes the script hash so
/// genesis can open the pool box against it.
validator treasury(_state_nft_policy: PolicyId) {
  else(_) {
    fail @"treasury: no rules yet"
  }
}
