import { randomUUID } from "node:crypto";
import type { AuditEvent, NewAuditEvent } from "../audit-event";
import { DEFAULT_AUDIT_LIMIT, type AuditFilter, type AuditLog } from "../port";

export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  async record(event: NewAuditEvent): Promise<void> {
    this.events.push({ id: randomUUID(), ...event });
  }

  async list(filter: AuditFilter = {}): Promise<AuditEvent[]> {
    return this.events
      .filter(
        (event) =>
          (filter.entityType === undefined ||
            event.entityType === filter.entityType) &&
          (filter.entityId === undefined || event.entityId === filter.entityId) &&
          (filter.actor === undefined || event.actor === filter.actor),
      )
      .sort(
        (left, right) =>
          right.occurredAt - left.occurredAt ||
          right.id.localeCompare(left.id),
      )
      .slice(0, filter.limit ?? DEFAULT_AUDIT_LIMIT);
  }
}
