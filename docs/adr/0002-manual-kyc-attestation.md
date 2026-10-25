# ADR 0002: Manual KYC attestation for the pilot

## Status

Accepted for the pilot. Superseded by a provider-backed decision before mainnet.

## Context

Member admission is open only to KYC-verified applicants. Before this decision
the admin CLI asserted `kycVerified: true` and stored a free-text
`kyc_commitment`, so there was no record of who verified the applicant, when,
against what evidence, or whether the result still holds. Nothing could be
revoked or expire.

The pilot has 10–30 members. Privy/Sumsub integration is planned but not
started, and the plan (§7.9) already allows a manual board fallback for the
pilot.

## Decision

Introduce an identity context that issues KYC attestations. A board operator
issues them from the CLI; there is no third-party provider yet.

- **Issuers are data.** A `kyc_issuers` row is `id` + `name` + `active`. The id
  *is* the issuer kind, in `SCREAMING_SNAKE_CASE` (`MANUAL`, `INTERNAL`,
  `PRIVY`) — one identifier instead of a kind column that duplicates it. The
  pilot seeds `MANUAL` and `INTERNAL`; providers add rows through migrations
  alongside their adapter.
- **Attestations are references, not proofs.** `evidence_ref` is an opaque
  locator: a storage path for `manual`, a digest or signature for `internal`, a
  provider case id later. Nothing verifies it in this milestone.
- **Expiry is derived**, not stored as a status: `kycStatusAt()` returns
  `ACTIVE | EXPIRED | SUPERSEDED | REVOKED`. There is no expiry sweep job.
- **Renewal supersedes.** Issuing a new attestation marks the previous `ACTIVE`
  row `SUPERSEDED` in the same transaction; a partial unique index enforces one
  active attestation per subject.
- **Membership depends on identity through a port.** `KycEligibility` is
  declared by membership and implemented by an identity adapter. Admission
  cannot be reached without a valid attestation.
- **Admission is KYC-gated only.** The old `boardApproved` boolean was deleted:
  it was an operator-asserted flag, not a governance record. Recording board
  approval belongs to the governance context; until it exists, the admission
  CLI requires a valid attestation and nothing else.
- **No KYC level yet.** `BASIC`/`ENHANCED` only mean something once provider
  tiers exist.
- **Revocation does not freeze a member.** Governance and exit gates do not
  exist yet; when they do, they must check attestation validity.
- **Reverification is annual**, intended to run inside the annual
  enrollment/deposit window (plan §3.1, §3.13 step 1). That window and the
  deposit flow do not exist yet; until they do, `sequoia kyc issue` defaults to
  365 days from issue. PDP Law (UU 27/2022) does not require periodic
  reverification; the cadence comes from ongoing due-diligence practice.
  Retention, not refresh, is the PDP exposure.

## Consequences

- The admission gate is a durable record instead of a trusted boolean, and the
  on-chain `KycDatum` in the plan can be populated from it later.
- Identity and membership stay independent; composition is the only place that
  knows both.
- `evidence_ref` is currently an auditable pointer, not a verified proof. The
  upgrade trigger is the first real verifier: a provider webhook with signature
  verification, or internal signature checking.
- A provider integration costs a migration, an adapter, and an issuer row — no
  schema change and no membership change.
- Expired or revoked KYC is invisible until someone reads the dashboard or runs
  `sequoia kyc list --status REVOKED` (or `--expiring-within` for renewals).
  Add notifications when there is infrastructure for them.
