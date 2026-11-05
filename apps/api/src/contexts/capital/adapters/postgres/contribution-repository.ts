import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  Contribution,
  DuplicateContributionError,
  UnknownContributionMemberError,
  type ContributionRepository,
} from "../../domain/contribution";
import * as schema from "./schema";
import {
  contributions,
  type ContributionInsert,
  type ContributionRow,
} from "./schema";

type CapitalDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

function toRow(contribution: Contribution): ContributionInsert {
  return {
    id: contribution.id,
    memberId: contribution.memberId,
    contributionYear: contribution.contributionYear,
    bankAttestationId: contribution.bankAttestationId,
    source: contribution.source,
    chainTx: contribution.chainTx,
    annualAmount: contribution.annualAmount,
    memberCapitalBps: contribution.memberCapitalBps,
    capitalParticipationBps: contribution.capitalParticipationBps,
    memberCapital: contribution.memberCapital,
    capitalParticipation: contribution.capitalParticipation,
    recordedAt: contribution.recordedAt,
  };
}

function toDomain(row: ContributionRow): Contribution {
  const contribution = Contribution.rehydrate({
    id: row.id,
    memberId: row.memberId,
    contributionYear: row.contributionYear,
    bankAttestationId: row.bankAttestationId,
    source: row.source as Contribution["source"],
    chainTx: row.chainTx ?? null,
    annualAmount: row.annualAmount,
    memberCapitalBps: row.memberCapitalBps,
    capitalParticipationBps: row.capitalParticipationBps,
    memberCapital: row.memberCapital,
    capitalParticipation: row.capitalParticipation,
    recordedAt: row.recordedAt,
  });

  if (!contribution.ok) {
    throw new Error(`Invalid contribution row: ${contribution.error.code}`);
  }

  return contribution.value;
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;

  return databaseCode((error as { cause?: unknown }).cause);
}

export class DrizzleContributionRepository
  implements ContributionRepository
{
  constructor(private readonly db: CapitalDatabase) {}

  async findByMemberAndYear(
    memberId: string,
    contributionYear: number,
  ): Promise<Contribution | null> {
    const rows = await this.db
      .select()
      .from(contributions)
      .where(
        and(
          eq(contributions.memberId, memberId),
          eq(contributions.contributionYear, contributionYear),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async findByBankAttestationId(id: string): Promise<Contribution | null> {
    const rows = await this.db
      .select()
      .from(contributions)
      .where(eq(contributions.bankAttestationId, id))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async save(contribution: Contribution): Promise<void> {
    try {
      const rows = await this.db
        .insert(contributions)
        .values(toRow(contribution))
        .onConflictDoNothing()
        .returning({ id: contributions.id });

      if (rows.length === 0) throw new DuplicateContributionError();
    } catch (cause) {
      if (cause instanceof DuplicateContributionError) throw cause;
      if (databaseCode(cause) === "23503") {
        throw new UnknownContributionMemberError();
      }
      throw cause;
    }
  }
}
