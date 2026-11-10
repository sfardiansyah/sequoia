use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Credential}
use cardano/assets.{AssetName, PolicyId}

// ADR 0008 datums. Balances live in the UTxO value, KYC facts live in the KYC
// box, and vesting is a pure function of `joined_at`; none are duplicated here.

/// Asset name of the one-shot state token under the state NFT policy.
pub const state_asset_name: AssetName = "STATE"

pub type ConfigDatum {
  contribution_year: Int,
  annual_amount: Int,
  member_capital_bps: Int,
  capital_participation_bps: Int,
  standard_capital_participation_max_bps: Int,
  board_keys: List<VerificationKeyHash>,
  board_threshold: Int,
  kyc_issuer: Credential,
  bank_issuer: Credential,
  network: Int,
  membership_policy: PolicyId,
  kyc_policy: PolicyId,
  bank_policy: PolicyId,
}

pub type MemberClass {
  Standard
  Founder
}

pub type MemberStatus {
  Active
  Inactive
  PendingExit
  Exited
}

pub type MemberDatum {
  owner: VerificationKeyHash,
  member_id: ByteArray,
  class: MemberClass,
  status: MemberStatus,
  joined_at: Int,
  last_contribution_year: Option<Int>,
  last_voted_proposal: Option<Int>,
}

/// KYC actions. `Renew` is spend-only: the token moves to a replacement box at
/// the same script, the mint field stays empty, and the mint handler does not
/// run (ADR 0008 §5).
pub type KycRedeemer {
  Issue
  Renew
  Revoke
}

pub type KycDatum {
  issuer: VerificationKeyHash,
  member_id: ByteArray,
  commitment: ByteArray,
  level: Int,
  issued_at: Int,
  expires_at: Int,
}

pub type BankProofDatum {
  issuer: VerificationKeyHash,
  member_id: ByteArray,
  contribution_year: Int,
  amount: Int,
  bank_ref_hash: ByteArray,
  nonce: ByteArray,
  issued_at: Int,
}
