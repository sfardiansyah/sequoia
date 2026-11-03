import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { AuditEvent, NewAuditEvent } from "../../audit-event";
import { DEFAULT_AUDIT_LIMIT, type AuditFilter, type AuditLog } from "../../port";
import { auditEvents, type AuditEventRow } from "./schema";

/**
 * The audit log is shared, so it must accept a database bound to any context's
 * schema; the table it touches is its own.
 */
type AuditDatabase = PgDatabase<PgQueryResultHKT, any>;

function toDomain(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action as AuditEvent["action"],
    entityType: row.entityType as AuditEvent["entityType"],
    entityId: row.entityId,
    detail: row.detail ?? null,
    occurredAt: row.occurredAt,
  };
}

export class DrizzleAuditLog implements AuditLog {
  constructor(private readonly db: AuditDatabase) {}

  async record(event: NewAuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values({ id: randomUUID(), ...event });
  }

  async list(filter: AuditFilter = {}): Promise<AuditEvent[]> {
    const conditions = [
      filter.entityType === undefined
        ? undefined
        : eq(auditEvents.entityType, filter.entityType),
      filter.entityId === undefined
        ? undefined
        : eq(auditEvents.entityId, filter.entityId),
      filter.actor === undefined ? undefined : eq(auditEvents.actor, filter.actor),
    ].filter((condition) => condition !== undefined);

    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(filter.limit ?? DEFAULT_AUDIT_LIMIT);

    return rows.map(toDomain);
  }
}
