import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  BankAttestation,
  DuplicateBankReferenceError,
  UnknownBankAttestationMemberError,
  type BankAttestationRepository,
} from "../../domain/bank-attestation";
import * as schema from "./schema";
import {
  bankAttestations,
  type BankAttestationInsert,
  type BankAttestationRow,
} from "./schema";

type CapitalDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

function toRow(attestation: BankAttestation): BankAttestationInsert {
  return {
    id: attestation.id,
    memberId: attestation.memberId,
    contributionYear: attestation.contributionYear,
    amount: attestation.amount,
    bankReference: attestation.bankReference,
    actor: attestation.actor,
    createdAt: attestation.createdAt,
  };
}

function toDomain(row: BankAttestationRow): BankAttestation {
  const attestation = BankAttestation.rehydrate({
    id: row.id,
    memberId: row.memberId,
    contributionYear: row.contributionYear,
    amount: row.amount,
    bankReference: row.bankReference,
    actor: row.actor,
    createdAt: row.createdAt,
  });

  if (!attestation.ok) {
    throw new Error(`Invalid bank attestation row: ${attestation.error.code}`);
  }

  return attestation.value;
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return code;

  return databaseCode((error as { cause?: unknown }).cause);
}

export class DrizzleBankAttestationRepository
  implements BankAttestationRepository
{
  constructor(private readonly db: CapitalDatabase) {}

  async findById(id: string): Promise<BankAttestation | null> {
    const rows = await this.db
      .select()
      .from(bankAttestations)
      .where(eq(bankAttestations.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async save(attestation: BankAttestation): Promise<void> {
    try {
      const rows = await this.db
        .insert(bankAttestations)
        .values(toRow(attestation))
        .onConflictDoNothing()
        .returning({ id: bankAttestations.id });

      if (rows.length === 0) throw new DuplicateBankReferenceError();
    } catch (cause) {
      if (cause instanceof DuplicateBankReferenceError) throw cause;
      if (databaseCode(cause) === "23503") {
        throw new UnknownBankAttestationMemberError();
      }
      throw cause;
    }
  }
}
