import type { AuditLog } from "../../../shared/audit/port";
import type { ContributionYearRepository } from "../domain/contribution-year";

/** What one capital write transaction may touch. */
export type CapitalWriteScope = {
  readonly years: ContributionYearRepository;
  readonly audit: AuditLog;
};
