import { bigint, pgTable, text } from "drizzle-orm/pg-core";

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail"),
  occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
});

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type AuditEventInsert = typeof auditEvents.$inferInsert;
