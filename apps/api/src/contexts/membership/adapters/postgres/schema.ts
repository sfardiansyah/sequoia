import { bigint, pgTable, text } from "drizzle-orm/pg-core";

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  ownerPkh: text("owner_pkh").notNull().unique(),
  kycAttestationId: text("kyc_attestation_id").notNull(),
  boardApprovalRef: text("board_approval_ref").notNull(),
  approvedAt: bigint("approved_at", { mode: "number" }).notNull(),
  memberClass: text("member_class").notNull(),
  status: text("status").notNull(),
  joinedAt: bigint("joined_at", { mode: "number" }).notNull(),
});

export type MemberRow = typeof members.$inferSelect;
export type MemberInsert = typeof members.$inferInsert;
