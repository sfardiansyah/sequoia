use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use sequoia/config_ref
use sequoia/kyc_rules
use sequoia/types.{Issue, KycDatum, KycRedeemer, Renew, Revoke}

fn expect_datum(datum: Option<Data>) -> KycDatum {
  when datum is {
    Some(raw) -> {
      expect old: KycDatum = raw
      old
    }
    None -> fail @"kyc_attestation: attestation datum missing"
  }
}

/// KYC attestation NFT: the minting policy and the box's spending validator are
/// the same script. `state_nft_policy` locates the config box, which names the
/// issuer and this policy (ADR 0008 §1, §5, §6).
///
/// Renewal is spend-validated: the token moves to a replacement box at the same
/// script, so the mint field stays empty and the mint handler cannot see it.
validator kyc_attestation(state_nft_policy: PolicyId) {
  mint(redeemer: Data, policy_id: PolicyId, self: Transaction) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: KycRedeemer = redeemer
    when action is {
      Issue -> kyc_rules.issue(config, policy_id, self)
      Revoke -> kyc_rules.revoke_mint(config, policy_id, self)
      Renew -> fail @"kyc_attestation: renew is a spend action"
    }
  }

  spend(
    datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    let config = config_ref.find(state_nft_policy, self)
    expect action: KycRedeemer = redeemer
    when action is {
      Renew -> kyc_rules.renew(config, own_ref, expect_datum(datum), self)
      Revoke -> kyc_rules.revoke(config, own_ref, expect_datum(datum), self)
      Issue -> fail @"kyc_attestation: issue is a mint action"
    }
  }

  else(_) {
    fail @"kyc_attestation: unsupported purpose"
  }
}
