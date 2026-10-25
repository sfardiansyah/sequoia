import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";

export const kycIssuers = pgTable("kyc_issuers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull(),
});

export const kycAttestations = pgTable("kyc_attestations", {
  id: text("id").primaryKey(),
  subjectPkh: text("subject_pkh").notNull(),
  issuerId: text("issuer_id").notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  issuedAt: bigint("issued_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  status: text("status").notNull(),
  revokedAt: bigint("revoked_at", { mode: "number" }),
  revokeReason: text("revoke_reason"),
});

export type KycAttestationRow = typeof kycAttestations.$inferSelect;
export type KycAttestationInsert = typeof kycAttestations.$inferInsert;
export type KycIssuerRow = typeof kycIssuers.$inferSelect;
