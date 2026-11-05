import type { AuditLog } from "../../../shared/audit/port";
import type { MemberRepository } from "../domain/member";

/** What one membership write transaction may touch. */
export type MembershipWriteScope = {
  readonly members: MemberRepository;
  readonly audit: AuditLog;
};
