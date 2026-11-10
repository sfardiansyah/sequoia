import { err, ok, type Result } from "@sequoia/shared";
import type { UnexpectedError } from "../../../shared/errors";
import { AttestationState, kycStatusAt, type KycStatus } from "./kyc-status";
import { SubjectPkh } from "./subject-pkh";

export const KYC_VALIDITY_DAYS = 365;

export const KycRevokeReason = {
  Sanctions: "SANCTIONS",
  Pep: "PEP",
  DocumentMismatch: "DOCUMENT_MISMATCH",
  Other: "OTHER",
} as const;

export type KycRevokeReason =
  (typeof KycRevokeReason)[keyof typeof KycRevokeReason];

const KYC_REVOKE_REASONS: readonly string[] = Object.values(KycRevokeReason);

/** Structured revocation reason, or null for free text and unknown codes. */
export function parseKycRevokeReason(value: string): KycRevokeReason | null {
  const code = value.trim();
  return KYC_REVOKE_REASONS.includes(code)
    ? (code as KycRevokeReason)
    : null;
}

export class DuplicateActiveAttestationError extends Error {
  constructor() {
    super("An active attestation already exists for this subject");
    this.name = "DuplicateActiveAttestationError";
  }
}

export type IdentityError =
  | { readonly code: "INVALID_SUBJECT" }
  | { readonly code: "INVALID_EVIDENCE" }
  | { readonly code: "INVALID_EXPIRY" }
  | { readonly code: "INVALID_RETAIN_UNTIL" }
  | { readonly code: "ISSUER_NOT_FOUND" }
  | { readonly code: "ISSUER_INACTIVE" }
  | { readonly code: "ATTESTATION_NOT_FOUND" }
  | { readonly code: "ATTESTATION_ALREADY_ACTIVE" }
  | { readonly code: "ATTESTATION_NOT_ACTIVE" }
  | { readonly code: "INVALID_REVOKE_REASON" }
  | { readonly code: "INVALID_ACTOR" }
  | UnexpectedError;

function isValidTime(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class KycAttestation {
  private constructor(
    readonly id: string,
    readonly subjectPkh: SubjectPkh,
    readonly issuerId: string,
    readonly evidenceRef: string,
    readonly issuedAt: number,
    readonly expiresAt: number,
    readonly status: AttestationState,
    readonly revokedAt: number | null,
    readonly revokeReason: KycRevokeReason | null,
    readonly retainUntil: number | null,
  ) {}

  static issue(input: {
    id: string;
    subjectPkh: string;
    issuerId: string;
    evidenceRef: string;
    issuedAt: number;
    expiresAt: number;
    retainUntil?: number | null | undefined;
  }): Result<KycAttestation, IdentityError> {
    const subjectPkh = SubjectPkh.parse(input.subjectPkh);
    if (!subjectPkh) return err({ code: "INVALID_SUBJECT" });

    const evidenceRef = input.evidenceRef.trim();
    if (!evidenceRef) return err({ code: "INVALID_EVIDENCE" });

    const issuerId = input.issuerId.trim();
    if (!issuerId) return err({ code: "ISSUER_NOT_FOUND" });

    if (
      !isValidTime(input.issuedAt) ||
      !isValidTime(input.expiresAt) ||
      input.expiresAt <= input.issuedAt
    ) {
      return err({ code: "INVALID_EXPIRY" });
    }

    const retainUntil = input.retainUntil ?? null;
    if (
      retainUntil !== null &&
      (!isValidTime(retainUntil) || retainUntil <= input.issuedAt)
    ) {
      return err({ code: "INVALID_RETAIN_UNTIL" });
    }

    return ok(
      new KycAttestation(
        input.id,
        subjectPkh,
        issuerId,
        evidenceRef,
        input.issuedAt,
        input.expiresAt,
        AttestationState.Active,
        null,
        null,
        retainUntil,
      ),
    );
  }

  static rehydrate(input: {
    id: string;
    subjectPkh: string;
    issuerId: string;
    evidenceRef: string;
    issuedAt: number;
    expiresAt: number;
    status: AttestationState;
    revokedAt: number | null;
    revokeReason: KycRevokeReason | null;
    retainUntil: number | null;
  }): Result<KycAttestation, IdentityError> {
    const issued = KycAttestation.issue(input);
    if (!issued.ok) return issued;

    return ok(
      new KycAttestation(
        issued.value.id,
        issued.value.subjectPkh,
        issued.value.issuerId,
        issued.value.evidenceRef,
        issued.value.issuedAt,
        issued.value.expiresAt,
        input.status,
        input.revokedAt,
        input.revokeReason,
        issued.value.retainUntil,
      ),
    );
  }

  statusAt(now: number): KycStatus {
    return kycStatusAt({ status: this.status, expiresAt: this.expiresAt }, now);
  }

  revoke(input: {
    reasonCode: string;
    revokedAt: number;
  }): Result<KycAttestation, IdentityError> {
    if (this.status !== AttestationState.Active) {
      return err({ code: "ATTESTATION_NOT_ACTIVE" });
    }

    const reason = parseKycRevokeReason(input.reasonCode);
    if (!reason) return err({ code: "INVALID_REVOKE_REASON" });
    if (!isValidTime(input.revokedAt)) return err({ code: "INVALID_EXPIRY" });

    return ok(
      new KycAttestation(
        this.id,
        this.subjectPkh,
        this.issuerId,
        this.evidenceRef,
        this.issuedAt,
        this.expiresAt,
        AttestationState.Revoked,
        input.revokedAt,
        reason,
        this.retainUntil,
      ),
    );
  }

  supersede(): KycAttestation {
    return new KycAttestation(
      this.id,
      this.subjectPkh,
      this.issuerId,
      this.evidenceRef,
      this.issuedAt,
      this.expiresAt,
      AttestationState.Superseded,
      this.revokedAt,
      this.revokeReason,
      this.retainUntil,
    );
  }
}

export type KycAttestationFilter = {
  readonly subjectPkh?: string | undefined;
  readonly expiresBefore?: number | undefined;
};

export interface KycAttestationRepository {
  findById(id: string): Promise<KycAttestation | null>;
  /** Inserts, or updates an existing row by id (revocation). */
  save(attestation: KycAttestation): Promise<void>;
  /** Marks the subject's current ACTIVE row SUPERSEDED and inserts the new one atomically. */
  saveIssued(attestation: KycAttestation): Promise<void>;
  list(filter?: KycAttestationFilter): Promise<KycAttestation[]>;
}
