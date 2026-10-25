import { and, desc, eq, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Issuer, IssuerDirectory } from "../../domain/issuer";
import {
  KycAttestation,
  type KycAttestationFilter,
  type KycAttestationRepository,
} from "../../domain/kyc-attestation";
import * as schema from "./schema";
import {
  kycAttestations,
  kycIssuers,
  type KycAttestationInsert,
  type KycAttestationRow,
} from "./schema";
import type { AttestationState as AttestationStateType } from "../../domain/kyc-status";

type IdentityDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

function toRow(attestation: KycAttestation): KycAttestationInsert {
  return {
    id: attestation.id,
    subjectPkh: attestation.subjectPkh.value,
    issuerId: attestation.issuerId,
    evidenceRef: attestation.evidenceRef,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    status: attestation.status,
    revokedAt: attestation.revokedAt,
    revokeReason: attestation.revokeReason,
  };
}

function toDomain(row: KycAttestationRow): KycAttestation {
  const attestation = KycAttestation.rehydrate({
    id: row.id,
    subjectPkh: row.subjectPkh,
    issuerId: row.issuerId,
    evidenceRef: row.evidenceRef,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    status: row.status as AttestationStateType,
    revokedAt: row.revokedAt ?? null,
    revokeReason: row.revokeReason ?? null,
  });

  if (!attestation.ok) {
    throw new Error(`Invalid attestation row: ${attestation.error.code}`);
  }

  return attestation.value;
}

export class DrizzleKycAttestationRepository
  implements KycAttestationRepository
{
  constructor(private readonly db: IdentityDatabase) {}

  async findById(id: string): Promise<KycAttestation | null> {
    const rows = await this.db
      .select()
      .from(kycAttestations)
      .where(eq(kycAttestations.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async save(attestation: KycAttestation): Promise<void> {
    const row = toRow(attestation);
    await this.db
      .insert(kycAttestations)
      .values(row)
      .onConflictDoUpdate({ target: kycAttestations.id, set: row });
  }

  async saveIssued(attestation: KycAttestation): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(kycAttestations)
        .set({ status: "SUPERSEDED" })
        .where(
          and(
            eq(kycAttestations.subjectPkh, attestation.subjectPkh.value),
            eq(kycAttestations.status, "ACTIVE"),
          ),
        );

      await tx.insert(kycAttestations).values(toRow(attestation));
    });
  }

  async list(filter: KycAttestationFilter = {}): Promise<KycAttestation[]> {
    const conditions = [
      filter.subjectPkh === undefined
        ? undefined
        : eq(kycAttestations.subjectPkh, filter.subjectPkh),
      filter.expiresBefore === undefined
        ? undefined
        : lt(kycAttestations.expiresAt, filter.expiresBefore),
    ].filter((condition) => condition !== undefined);

    const rows = await this.db
      .select()
      .from(kycAttestations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(kycAttestations.issuedAt));

    return rows.map(toDomain);
  }
}

export class DrizzleIssuerDirectory implements IssuerDirectory {
  constructor(private readonly db: IdentityDatabase) {}

  async find(id: string): Promise<Issuer | null> {
    const rows = await this.db
      .select()
      .from(kycIssuers)
      .where(eq(kycIssuers.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toIssuer(row) : null;
  }
}

function toIssuer(row: schema.KycIssuerRow): Issuer {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
  };
}
