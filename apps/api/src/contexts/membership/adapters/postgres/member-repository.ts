import type { MemberClass } from "@coop/shared";
import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import {
  Member,
  type MemberRepository,
  type MemberStatus,
} from "../../domain/member";
import * as schema from "./schema";
import { members, type MemberInsert, type MemberRow } from "./schema";

function toRow(member: Member): MemberInsert {
  return {
    id: member.id,
    ownerPkh: member.ownerPkh,
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

export class PgliteMemberRepository implements MemberRepository {
  constructor(private readonly db: PgliteDatabase<typeof schema>) {}

  async findByOwnerPkh(ownerPkh: string): Promise<Member | null> {
    const rows = await this.db
      .select()
      .from(members)
      .where(eq(members.ownerPkh, ownerPkh))
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
