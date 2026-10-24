import postgres from "postgres";
import { ensureMigrated } from "../../../infrastructure/database/testing";
import { describeNonceStore } from "./nonce-store-contract";
import { PostgresNonceStore } from "./postgres-nonce-store";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  await client`TRUNCATE TABLE auth_nonces`;

  return {
    store: new PostgresNonceStore(client),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeNonceStore("PostgresNonceStore (Postgres)", setup);
}
