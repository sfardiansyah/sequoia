use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Credential}
use cardano/assets.{AssetName, PolicyId}

// ADR 0008 datums, extended by ADR 0009 §8 for M2. Balances live in the UTxO
// value, KYC facts live in the KYC box, and vesting is a pure function of
// `joined_at`; none are duplicated here.

/// Asset name of the one-shot state token under the state NFT policy.
pub const state_asset_name: AssetName = "STATE"

/// Asset name of the one-shot pool token, minted beside `STATE` at genesis
/// (ADR 0010 §1). It marks the single pool box at the treasury script.
pub const pool_asset_name: AssetName = "POOL"

/// Asset names of the fungible tokens under the membership policy. A member id
/// may not take either name: they share the policy's asset-name namespace.
pub const member_capital_asset_name: AssetName = "MCAP"

pub const capital_participation_asset_name: AssetName = "PROJ"

/// `MCAP`/`PROJ` share the membership policy's asset-name namespace with member
/// ids and bank-proof nonces, so neither may take those names.
pub fn reserved_asset_name(asset_name: AssetName) -> Bool {
  asset_name == member_capital_asset_name || asset_name == capital_participation_asset_name
}

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
  governance_policy: PolicyId,
  ballot_policy: PolicyId,
  quorum_bps: Int,
  project_threshold_bps: Int,
  structural_threshold_bps: Int,
  timelock_days: Int,
  voting_days: Int,
  reveal_days: Int,
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
}

/// KYC actions. `Renew` is spend-only: the token moves to a replacement box at
/// the same script, the mint field stays empty, and the mint handler does not
/// run (ADR 0008 §5).
pub type KycRedeemer {
  Issue
  Renew
  Revoke
}

/// Membership actions. `Transfer` is the spend-only action that keeps the
/// member box intact; `Contribute` is a mint and a spend in one transaction.
/// Actions append so these indices stay stable.
pub type MembershipRedeemer {
  IssueBankProof
  BurnBankProof
  Join
  Transfer
  Contribute
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

// M2 governance (ADR 0009 §1, §5, §6), extended by ADR 0010 §3 for M3.

/// The kind tag and the approved terms in one field, so a proposal cannot claim
/// one kind and carry another's payload. The tag is the kind. M3 creates only
/// `Config` proposals until the project kinds land (spec §7).
pub type ProposalPayload {
  Config(ConfigDatum)
  Project(ProjectSpec)
  Cancel(AssetName)
}

pub type ProposalStatus {
  Open
  Passed
  Rejected
  Executed
}

pub type ProposalDatum {
  id: AssetName,
  proposer: VerificationKeyHash,
  payload: ProposalPayload,
  eligible_leaves: List<ByteArray>,
  start: Int,
  end: Int,
  reveal_end: Int,
  nullifiers: List<ByteArray>,
  discarded: Int,
  tallied: Int,
  yes: Int,
  no: Int,
  abstain: Int,
  status: ProposalStatus,
  finalized_at: Option<Int>,
}

/// Ballot choices, in commitment-index order: `Yes = 0`, `No = 1`,
/// `Abstain = 2` (ADR 0009 §3).
pub type Choice {
  Yes
  No
  Abstain
}

/// The vote box is self-contained once cast: `Reveal` reads its own deadlines
/// and needs no proposal reference (ADR 0009 §5).
pub type VoteDatum {
  proposal_id: AssetName,
  end: Int,
  reveal_end: Int,
  choice_commitment: ByteArray,
  revealed: Option<Choice>,
}

/// Governance spend actions. Ballot actions live in `ballot_rules` because both
/// enums use the names `Cast` and `Discard`.
pub type GovernanceRedeemer {
  Cast
  Discard
  Tally
  Finalize
  Execute
}

// M3 treasury (ADR 0010 §1, §2, §4). The treasury holds no money: the pool box
// carries the treasurer-attested IDR figures, and the cash stays at the bank.

/// The pool box: the only input that may be spent as the project account.
/// `balance` is the treasurer-attested IDR figure; `committed` is the sum of the
/// remaining milestone amounts over open projects.
pub type PoolDatum {
  balance: Int,
  committed: Int,
}

/// One tranche of an approved project. `amount > 0`; the evidence commitment is
/// a 32-byte hash the chain compares but cannot interpret (ADR 0007).
pub type Milestone {
  amount: Int,
  evidence_commitment: ByteArray,
}

pub type ProjectSpec {
  recipient_commitment: ByteArray,
  deadline: Int,
  milestones: List<Milestone>,
}

/// Constructors are module-scoped in Aiken, so these carry the prefix that keeps
/// them apart from `ProposalStatus.Open`.
pub type ProjectStatus {
  ProjectOpen
  ProjectClosed
  ProjectCancelled
}

/// A project box is self-contained for tranches: `next_milestone` and the
/// milestone list carry the budget and the spend, so no counter can drift.
/// `project_id` is the proposal id and the `PROJECT` NFT name.
pub type ProjectDatum {
  project_id: AssetName,
  spec: ProjectSpec,
  next_milestone: Int,
  status: ProjectStatus,
}

/// Treasury actions. `SpendTranche` and `CloseProject` change the pool, so each
/// spends the project box and the pool box together (spec §7).
pub type TreasuryRedeemer {
  AttestPool { balance: Int, bank_ref_hash: ByteArray }
  SpendTranche { evidence_hash: ByteArray, bank_ref_hash: ByteArray }
  CloseProject
  CancelProject
}
