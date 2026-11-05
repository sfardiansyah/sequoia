import type { AuditLog } from "../../../shared/audit/port";
import type { BankAttestationRepository } from "../domain/bank-attestation";
import type { ContributionYearRepository } from "../domain/contribution-year";

/** What one capital write transaction may touch. */
export type CapitalWriteScope = {
  readonly years: ContributionYearRepository;
  readonly attestations: BankAttestationRepository;
  readonly audit: AuditLog;
};
