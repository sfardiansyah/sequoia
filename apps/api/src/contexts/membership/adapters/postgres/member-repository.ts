import type { MemberClass } from "@sequoia/shared";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  Member,
  type MemberRepository,
  type MemberStatus,
} from "../../domain/member";
import type { OwnerPkh } from "../../domain/owner-pkh";
import * as schema from "./schema";
import { members, type MemberInsert, type MemberRow } from "./schema";

type MembershipDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

function toRow(member: Member): MemberInsert {
  return {
    id: member.id,
    ownerPkh: member.ownerPkh.value,
    kycCommitment: member.kycCommitment,
    memberClass: member.memberClass,
    status: member.status,
    joinedAt: member.joinedAt,
  };
}

function toDomain(row: MemberRow): Member {
  const member = Member.rehydrate({
    id: row.id,
    ownerPkh: row.ownerPkh,
    kycCommitment: row.kycCommitment,
    memberClass: row.memberClass as MemberClass,
    status: row.status as MemberStatus,
    joinedAt: row.joinedAt,
  });

  if (!member.ok) throw new Error(`Invalid member row: ${member.error}`);
  return member.value;
}

export class DrizzleMemberRepository implements MemberRepository {
  constructor(private readonly db: MembershipDatabase) {}

  async findByOwnerPkh(ownerPkh: OwnerPkh): Promise<Member | null> {
    const rows = await this.db
      .select()
      .from(members)
      .where(eq(members.ownerPkh, ownerPkh.value))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async save(member: Member): Promise<void> {
    const row = toRow(member);
    await this.db
      .insert(members)
      .values(row)
      .onConflictDoUpdate({ target: members.id, set: row });
  }
}
