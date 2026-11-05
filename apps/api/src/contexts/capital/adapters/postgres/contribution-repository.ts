import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  Contribution,
  DuplicateBankAttestationError,
  DuplicateContributionError,
  UnknownContributionAttestationError,
  UnknownContributionMemberError,
  UnknownContributionYearError,
  type ContributionRepository,
} from "../../domain/contribution";
import { postgresError } from "../../../../shared/persistence/adapters/postgres/error";
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

  async save(contribution: Contribution): Promise<void> {
    try {
      await this.db.insert(contributions).values(toRow(contribution));
    } catch (cause) {
      const { code, constraint } = postgresError(cause);

      if (code === "23505") {
        if (constraint === "contributions_bank_attestation_id_key") {
          throw new DuplicateBankAttestationError();
        }
        throw new DuplicateContributionError();
      }

      if (code === "23503") {
        if (constraint === "contributions_bank_attestation_id_fkey") {
          throw new UnknownContributionAttestationError();
        }
        if (constraint === "contributions_contribution_year_fkey") {
          throw new UnknownContributionYearError();
        }
        if (constraint === "contributions_member_id_fkey") {
          throw new UnknownContributionMemberError();
        }
      }

      throw cause;
    }
  }
}
