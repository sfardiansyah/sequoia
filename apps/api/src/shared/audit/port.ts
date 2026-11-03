import type { AuditEvent, NewAuditEvent } from "./audit-event";

export const DEFAULT_AUDIT_LIMIT = 50;

export type AuditFilter = {
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly actor?: string | undefined;
  readonly limit?: number | undefined;
};

/**
 * Implementations must not reject: a failed audit write is reported by the
 * adapter and must not turn an applied change into a reported failure.
 */
export interface AuditLog {
  record(event: NewAuditEvent): Promise<void>;
  /** Newest first. */
  list(filter?: AuditFilter): Promise<AuditEvent[]>;
}
