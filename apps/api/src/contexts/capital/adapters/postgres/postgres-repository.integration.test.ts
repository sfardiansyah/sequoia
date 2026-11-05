import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import {
  CONTRACT_MEMBER_ID,
  describeContributionRepository,
} from "../contribution-repository-contract";
import { describeContributionYearRepository } from "../contribution-year-repository-contract";
import { DrizzleContributionRepository } from "./contribution-repository";
import { DrizzleContributionYearRepository } from "./contribution-year-repository";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

const memberPkh = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const attestationId = "kyc-contribution-contract";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  await client`
    TRUNCATE TABLE contributions, contribution_years, members, kyc_attestations
  `;
  await client`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      ${attestationId}, ${memberPkh}, 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    )
  `;
  await client`
    INSERT INTO members
      (id, owner_pkh, kyc_attestation_id, board_approval_ref, approved_at,
       member_class, status, joined_at)
    VALUES (
      ${CONTRACT_MEMBER_ID}, ${memberPkh}, ${attestationId},
      'board-2026-04', 1700000000000,
      'STANDARD', 'ACTIVE', 1700000000000
    )
  `;
  await client`
    INSERT INTO contribution_years
      (year, annual_amount, member_capital_bps, capital_participation_bps,
       standard_capital_participation_max_bps, created_at)
    VALUES
      (2026, 1000000, 7000, 3000, 5000, 1700000000000),
      (2027, 1000000, 7000, 3000, 5000, 1700000000000)
  `;

  const db = drizzle(client, { schema });

  return {
    contributions: new DrizzleContributionRepository(db),
    years: new DrizzleContributionYearRepository(db),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeContributionRepository(
    "DrizzleContributionRepository (Postgres)",
    async () => {
      const { contributions, close } = await setup();
      return { repository: contributions, close };
    },
  );

  describeContributionYearRepository(
    "DrizzleContributionYearRepository (Postgres)",
    async () => {
      const { years, close } = await setup();
      return { repository: years, close };
    },
  );
}
