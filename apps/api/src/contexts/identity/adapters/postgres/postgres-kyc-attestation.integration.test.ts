import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import { describeKycAttestationRepository } from "../kyc-attestation-repository-contract";
import { DrizzleKycAttestationRepository } from "./kyc-attestation-repository";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  // Issuers are seeded by the migration; only attestations are reset.
  await client`TRUNCATE TABLE kyc_attestations, members`;

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleKycAttestationRepository(db),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeKycAttestationRepository(
    "DrizzleKycAttestationRepository (Postgres)",
    setup,
  );
}
