import type { AuditEvent, NewAuditEvent } from "./audit-event";

export const DEFAULT_AUDIT_LIMIT = 50;

export type AuditFilter = {
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly actor?: string | undefined;
  readonly limit?: number | undefined;
};

/**
 * Audited writes commit the audit row in the same transaction as the change, so
 * a rejected write is not an applied change. Callers must let the rejection
 * propagate: catching it inside the transaction would commit a half-applied
 * change.
 */
export interface AuditLog {
  record(event: NewAuditEvent): Promise<void>;
  /** Newest first. */
  list(filter?: AuditFilter): Promise<AuditEvent[]>;
}
