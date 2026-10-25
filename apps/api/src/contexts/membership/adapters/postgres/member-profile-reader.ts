import type { MemberClass } from "@sequoia/shared";
import type { Sql } from "postgres";
import {
  kycStatusAt,
  type AttestationState,
} from "../../../identity/domain/kyc-status";
import type { MemberStatus } from "../../domain/member";
import { OwnerPkh } from "../../domain/owner-pkh";
import type {
  MemberProfile,
  MemberProfileReader,
} from "../../read-models/member-profile";

type ProfileRow = {
  readonly id: string;
  readonly owner_pkh: string;
  readonly member_class: string;
  readonly status: string;
  readonly joined_at: string;
  readonly kyc_status: string;
  readonly kyc_expires_at: string;
};

export class PostgresMemberProfileReader implements MemberProfileReader {
  constructor(private readonly sql: Sql) {}

  async findByOwnerPkh(
    ownerPkh: string,
    at: number,
  ): Promise<MemberProfile | null> {
    const parsed = OwnerPkh.parse(ownerPkh);
    if (!parsed) return null;

    const rows = await this.sql<ProfileRow[]>`
      SELECT m.id,
             m.owner_pkh,
             m.member_class,
             m.status,
             m.joined_at::text AS joined_at,
             a.status AS kyc_status,
             a.expires_at::text AS kyc_expires_at
        FROM members m
        JOIN LATERAL (
          SELECT status, expires_at
            FROM kyc_attestations
           WHERE subject_pkh = m.owner_pkh
           ORDER BY issued_at DESC
           LIMIT 1
        ) a ON true
       WHERE m.owner_pkh = ${parsed.value}
       LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      ownerPkh: row.owner_pkh,
      memberClass: row.member_class as MemberClass,
      status: row.status as MemberStatus,
      joinedAt: Number(row.joined_at),
      kyc: {
        status: kycStatusAt(
          {
            status: row.kyc_status as AttestationState,
            expiresAt: Number(row.kyc_expires_at),
          },
          at,
        ),
        expiresAt: Number(row.kyc_expires_at),
      },
    };
  }
}
