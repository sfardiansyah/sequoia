import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { execMigrations } from "../../../../infrastructure/database/testing";
import {
  CONTRACT_MEMBER_ID,
  describeContributionRepository,
} from "../contribution-repository-contract";
import {
  Contribution,
  UnknownContributionAttestationError,
  UnknownContributionMemberError,
  UnknownContributionYearError,
} from "../../domain/contribution";
import { DrizzleContributionRepository } from "./contribution-repository";
import * as schema from "./schema";

const memberPkh = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const attestationId = "kyc-contribution-contract";

async function setup() {
  const client = new PGlite();
  await execMigrations(client);

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
      '${CONTRACT_MEMBER_ID}', '${memberPkh}', '${attestationId}',
      'board-2026-04', 1700000000000,
      'STANDARD', 'ACTIVE', 1700000000000
    );
    INSERT INTO contribution_years
      (year, approval_ref, annual_amount, member_capital_bps,
       capital_participation_bps, standard_capital_participation_max_bps,
       created_at)
    VALUES
      (2026, 'BOARD-2026-001', 1000000, 7000, 3000, 5000, 1700000000000),
      (2027, 'BOARD-2027-001', 1000000, 7000, 3000, 5000, 1700000000000);
    INSERT INTO bank_attestations
      (id, member_id, contribution_year, amount, bank_reference, actor, created_at)
    VALUES
      ('attestation-contribution-1', '${CONTRACT_MEMBER_ID}', 2026, 1000000,
       'BANK-REF-1', 'ray', 1700000000000),
      ('attestation-contribution-2', '${CONTRACT_MEMBER_ID}', 2027, 1000000,
       'BANK-REF-2', 'ray', 1700000000000);
  `);

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleContributionRepository(db),
    close: () => client.close(),
  };
}

describeContributionRepository("DrizzleContributionRepository", setup);

describe("DrizzleContributionRepository errors", () => {
  test("maps a missing member to UnknownContributionMemberError", async () => {
    const { repository, close } = await setup();

    try {
      const contribution = Contribution.record({
        id: "contribution-missing",
        memberId: "missing-member",
        contributionYear: 2026,
        bankAttestationId: "attestation-contribution-1",
        annualAmount: 1_000_000,
        split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
        recordedAt: 1_700_000_000_000,
      });
      if (!contribution.ok) throw new Error(contribution.error.code);

      await expect(
        repository.save(contribution.value),
      ).rejects.toThrow(UnknownContributionMemberError);
    } finally {
      await close();
    }
  });

  test("maps a missing year to UnknownContributionYearError", async () => {
    const { repository, close } = await setup();

    try {
      const contribution = Contribution.record({
        id: "contribution-missing-year",
        memberId: CONTRACT_MEMBER_ID,
        contributionYear: 2099,
        bankAttestationId: "attestation-contribution-1",
        annualAmount: 1_000_000,
        split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
        recordedAt: 1_700_000_000_000,
      });
      if (!contribution.ok) throw new Error(contribution.error.code);

      await expect(
        repository.save(contribution.value),
      ).rejects.toThrow(UnknownContributionYearError);
    } finally {
      await close();
    }
  });

  test("maps a missing bank attestation to UnknownContributionAttestationError", async () => {
    const { repository, close } = await setup();

    try {
      const contribution = Contribution.record({
        id: "contribution-missing-attestation",
        memberId: CONTRACT_MEMBER_ID,
        contributionYear: 2026,
        bankAttestationId: "attestation-missing",
        annualAmount: 1_000_000,
        split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
        recordedAt: 1_700_000_000_000,
      });
      if (!contribution.ok) throw new Error(contribution.error.code);

      await expect(
        repository.save(contribution.value),
      ).rejects.toThrow(UnknownContributionAttestationError);
    } finally {
      await close();
    }
  });
});
