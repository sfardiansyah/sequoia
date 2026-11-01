import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  ContributionYear,
  type ContributionYearRepository,
} from "../../domain/contribution-year";
import * as schema from "./schema";
import {
  contributionYears,
  type ContributionYearInsert,
  type ContributionYearRow,
} from "./schema";

type CapitalDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

function toRow(year: ContributionYear): ContributionYearInsert {
  return {
    year: year.year,
    annualAmount: year.annualAmount,
    memberCapitalBps: year.memberCapitalBps,
    capitalParticipationBps: year.capitalParticipationBps,
    standardCapitalParticipationMaxBps:
      year.standardCapitalParticipationMaxBps,
    createdAt: year.createdAt,
  };
}

function toDomain(row: ContributionYearRow): ContributionYear {
  const year = ContributionYear.rehydrate({
    year: row.year,
    annualAmount: row.annualAmount,
    memberCapitalBps: row.memberCapitalBps,
    capitalParticipationBps: row.capitalParticipationBps,
    standardCapitalParticipationMaxBps:
      row.standardCapitalParticipationMaxBps,
    createdAt: row.createdAt,
  });

  if (!year.ok) {
    throw new Error(`Invalid contribution year row: ${year.error.code}`);
  }

  return year.value;
}

export class DrizzleContributionYearRepository
  implements ContributionYearRepository
{
  constructor(private readonly db: CapitalDatabase) {}

  async findByYear(year: number): Promise<ContributionYear | null> {
    const rows = await this.db
      .select()
      .from(contributionYears)
      .where(eq(contributionYears.year, year))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async save(year: ContributionYear): Promise<void> {
    await this.db.insert(contributionYears).values(toRow(year));
  }
}
