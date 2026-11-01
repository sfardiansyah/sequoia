import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

export const contributionYears = pgTable("contribution_years", {
  year: integer("year").primaryKey(),
  annualAmount: bigint("annual_amount", { mode: "number" }).notNull(),
  memberCapitalBps: integer("member_capital_bps").notNull(),
  capitalParticipationBps: integer("capital_participation_bps").notNull(),
  standardCapitalParticipationMaxBps: integer(
    "standard_capital_participation_max_bps",
  ).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const contributions = pgTable("contributions", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  contributionYear: integer("contribution_year").notNull(),
  annualAmount: bigint("annual_amount", { mode: "number" }).notNull(),
  memberCapitalBps: integer("member_capital_bps").notNull(),
  capitalParticipationBps: integer("capital_participation_bps").notNull(),
  memberCapital: bigint("member_capital", { mode: "bigint" }).notNull(),
  capitalParticipation: bigint("capital_participation", {
    mode: "bigint",
  }).notNull(),
  recordedAt: bigint("recorded_at", { mode: "number" }).notNull(),
});

export type ContributionYearRow = typeof contributionYears.$inferSelect;
export type ContributionYearInsert = typeof contributionYears.$inferInsert;
export type ContributionRow = typeof contributions.$inferSelect;
export type ContributionInsert = typeof contributions.$inferInsert;
