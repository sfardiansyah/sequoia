import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/pglite";
import {
  closePgliteTestDatabase,
  openPgliteTestDatabase,
} from "../../../../infrastructure/database/testing";
import {
  CONTRACT_BANK_MEMBER_ID,
  describeBankAttestationRepository,
} from "../bank-attestation-repository-contract";
import {
  BankAttestation,
  UnknownBankAttestationMemberError,
} from "../../domain/bank-attestation";
import { DrizzleBankAttestationRepository } from "./bank-attestation-repository";
import * as schema from "./schema";

const memberPkh = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const attestationId = "kyc-bank-attestation-contract";

async function setup() {
  const client = await openPgliteTestDatabase();

  await client.exec(`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      '${attestationId}', '${memberPkh}', 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    );
    INSERT INTO members
      (id, owner_pkh, kyc_attestation_id, board_approval_ref, approved_at,
       member_class, status, joined_at)
    VALUES (
      '${CONTRACT_BANK_MEMBER_ID}', '${memberPkh}', '${attestationId}',
      'board-2026-04', 1700000000000,
      'STANDARD', 'ACTIVE', 1700000000000
    );
    INSERT INTO contribution_years
      (year, approval_ref, annual_amount, member_capital_bps,
       capital_participation_bps, standard_capital_participation_max_bps,
       created_at)
    VALUES (2026, 'BOARD-2026-001', 1000000, 7000, 3000, 5000, 1700000000000);
  `);

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleBankAttestationRepository(db),
    close: closePgliteTestDatabase,
  };
}

describeBankAttestationRepository("DrizzleBankAttestationRepository", setup);

describe("bank_attestations constraints", () => {
  test("rejects a blank bank reference", async () => {
    const client = await openPgliteTestDatabase();

    try {
      await expect(
        client.exec(`
          INSERT INTO bank_attestations
            (id, member_id, contribution_year, amount, bank_reference, actor,
             created_at)
          VALUES ('attestation-1', 'member-1', 2026, 1000000, '   ', 'ray', 0)
        `),
      ).rejects.toThrow(/bank_attestations_bank_reference_check/);
    } finally {
      await closePgliteTestDatabase();
    }
  });

  test("rejects a non-positive amount", async () => {
    const client = await openPgliteTestDatabase();

    try {
      await expect(
        client.exec(`
          INSERT INTO bank_attestations
            (id, member_id, contribution_year, amount, bank_reference, actor,
             created_at)
          VALUES ('attestation-1', 'member-1', 2026, 0, 'BANK-REF-001', 'ray', 0)
        `),
      ).rejects.toThrow(/bank_attestations_amount_check/);
    } finally {
      await closePgliteTestDatabase();
    }
  });
});

describe("DrizzleBankAttestationRepository errors", () => {
  test("maps a missing member to UnknownBankAttestationMemberError", async () => {
    const { repository, close } = await setup();

    try {
      const attestation = BankAttestation.create({
        id: "attestation-missing",
        memberId: "missing-member",
        contributionYear: 2026,
        amount: 1_000_000,
        bankReference: "BANK-REF-001",
        actor: "ray",
        createdAt: 1_700_000_000_000,
      });
      if (!attestation.ok) throw new Error(attestation.error.code);

      await expect(repository.save(attestation.value)).rejects.toThrow(
        UnknownBankAttestationMemberError,
      );
    } finally {
      await close();
    }
  });
});
