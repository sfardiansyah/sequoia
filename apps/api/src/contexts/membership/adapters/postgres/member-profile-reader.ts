import type { MemberClass } from "@sequoia/shared";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { contributions } from "../../../capital/adapters/postgres/schema";
import { kycAttestations } from "../../../identity/adapters/postgres/schema";
import {
  kycStatusAt,
  type AttestationState,
} from "../../../identity/domain/kyc-status";
import type { MemberStatus } from "../../domain/member";
import { OwnerPkh } from "../../domain/owner-pkh";
import type {
  ContributionSummary,
  MemberProfile,
  MemberProfileReader,
} from "../../read-models/member-profile";
import { members } from "./schema";

/**
 * Bound to any context's schema: this read model spans membership, identity,
 * and capital, and runs against PGlite and Postgres through the same Drizzle
 * handle.
 */
type ReadDatabase = PgDatabase<PgQueryResultHKT, any>;

export class PostgresMemberProfileReader implements MemberProfileReader {
  constructor(private readonly db: ReadDatabase) {}

  async findByOwnerPkh(
    ownerPkh: string,
    at: number,
  ): Promise<MemberProfile | null> {
    const parsed = OwnerPkh.parse(ownerPkh);
    if (!parsed) return null;

    const [member] = await this.db
      .select({
        id: members.id,
        ownerPkh: members.ownerPkh,
        memberClass: members.memberClass,
        status: members.status,
        joinedAt: members.joinedAt,
      })
      .from(members)
      .where(eq(members.ownerPkh, parsed.value))
      .limit(1);
    if (!member) return null;

    // A member always has an attestation row through the composite foreign key.
    const [attestation] = await this.db
      .select({
        status: kycAttestations.status,
        expiresAt: kycAttestations.expiresAt,
      })
      .from(kycAttestations)
      .where(eq(kycAttestations.subjectPkh, parsed.value))
      .orderBy(desc(kycAttestations.issuedAt))
      .limit(1);
    if (!attestation) return null;

    const rows = await this.db
      .select({
        year: contributions.contributionYear,
        annualAmount: contributions.annualAmount,
        memberCapital: contributions.memberCapital,
        capitalParticipation: contributions.capitalParticipation,
        source: contributions.source,
      })
      .from(contributions)
      .where(eq(contributions.memberId, member.id))
      .orderBy(desc(contributions.contributionYear));

    return {
      id: member.id,
      ownerPkh: member.ownerPkh,
      memberClass: member.memberClass as MemberClass,
      status: member.status as MemberStatus,
      joinedAt: member.joinedAt,
      kyc: {
        status: kycStatusAt(
          {
            status: attestation.status as AttestationState,
            expiresAt: attestation.expiresAt,
          },
          at,
        ),
        expiresAt: attestation.expiresAt,
      },
      contributions: rows.map(
        (row): ContributionSummary => ({
          year: row.year,
          annualAmount: String(row.annualAmount),
          memberCapital: row.memberCapital.toString(),
          capitalParticipation: row.capitalParticipation.toString(),
          source: row.source as ContributionSummary["source"],
        }),
      ),
    };
  }
}
