import type { AuditLog } from "../../../shared/audit/port";
import type { KycAttestationRepository } from "../domain/kyc-attestation";

/** What one KYC write transaction may touch. */
export type IdentityWriteScope = {
  readonly attestations: KycAttestationRepository;
  readonly audit: AuditLog;
};
