export const AUDIT_ACTIONS = {
  kycIssued: "KYC_ISSUED",
  kycRevoked: "KYC_REVOKED",
  contributionYearConfigured: "CONTRIBUTION_YEAR_CONFIGURED",
  memberAdmitted: "MEMBER_ADMITTED",
  bankAttestationCreated: "BANK_ATTESTATION_CREATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITY_TYPES = {
  kycAttestation: "KYC_ATTESTATION",
  contributionYear: "CONTRIBUTION_YEAR",
  member: "MEMBER",
  bankAttestation: "BANK_ATTESTATION",
} as const;

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];

export type AuditEvent = {
  readonly id: string;
  readonly actor: string;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  /** Non-PII context only. Never an evidence ref, a free-text reason, or identity data. */
  readonly detail: string | null;
  readonly occurredAt: number;
};

export type NewAuditEvent = Omit<AuditEvent, "id">;

const ACTOR_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Trimmed lower-case slug, or null. Case is never normalized: an audit trail
 * that silently rewrites the actor is worse than one that rejects it.
 */
export function parseActor(value: string): string | null {
  const actor = value.trim();
  return ACTOR_PATTERN.test(actor) ? actor : null;
}
