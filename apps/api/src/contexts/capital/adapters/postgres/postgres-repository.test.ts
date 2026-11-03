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
  UnknownContributionMemberError,
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
      (id, owner_pkh, kyc_attestation_id, member_class, status, joined_at)
    VALUES (
      '${CONTRACT_MEMBER_ID}', '${memberPkh}', '${attestationId}',
      'STANDARD', 'ACTIVE', 1700000000000
    );
    INSERT INTO contribution_years
      (year, annual_amount, member_capital_bps, capital_participation_bps,
       standard_capital_participation_max_bps, created_at)
    VALUES
      (2026, 1000000, 7000, 3000, 5000, 1700000000000),
      (2027, 1000000, 7000, 3000, 5000, 1700000000000);
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
});
