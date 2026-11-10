import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresError } from "../../../../shared/persistence/adapters/postgres/error";
import {
  ContributionYear,
  DuplicateContributionYearError,
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
    approvalRef: year.approvalRef,
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
    approvalRef: row.approvalRef,
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
    try {
      await this.db.insert(contributionYears).values(toRow(year));
    } catch (cause) {
      const { code, constraint } = postgresError(cause);
      if (code === "23505" && constraint === "contribution_years_pkey") {
        throw new DuplicateContributionYearError();
      }
      throw cause;
    }
  }
}
