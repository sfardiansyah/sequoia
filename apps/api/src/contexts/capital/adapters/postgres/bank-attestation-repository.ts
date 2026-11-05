import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  BankAttestation,
  DuplicateBankAttestationIdError,
  DuplicateBankReferenceError,
  UnknownBankAttestationMemberError,
  UnknownBankAttestationYearError,
  type BankAttestationRepository,
} from "../../domain/bank-attestation";
import { postgresError } from "../../../../shared/persistence/adapters/postgres/error";
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
      await this.db.insert(bankAttestations).values(toRow(attestation));
    } catch (cause) {
      const { code, constraint } = postgresError(cause);

      if (code === "23505") {
        if (constraint === "bank_attestations_bank_reference_key") {
          throw new DuplicateBankReferenceError();
        }
        if (constraint === "bank_attestations_pkey") {
          throw new DuplicateBankAttestationIdError();
        }
      }

      if (code === "23503") {
        if (constraint === "bank_attestations_member_id_fkey") {
          throw new UnknownBankAttestationMemberError();
        }
        if (constraint === "bank_attestations_contribution_year_fkey") {
          throw new UnknownBankAttestationYearError();
        }
      }

      throw cause;
    }
  }
}
