import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "./infrastructure/database/testing";
import { describePilotFlow } from "./testing/pilot-flow-contract";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

if (runIntegration && databaseUrl) {
  describePilotFlow("pilot harness flow (Postgres)", async () => {
    await ensureMigrated(databaseUrl);
    const client = postgres(databaseUrl, { max: 1 });
    await client`
      TRUNCATE TABLE audit_events, contributions, bank_attestations,
        contribution_years, members, kyc_attestations CASCADE
    `;

    return {
      db: drizzle(client),
      close: () => client.end(),
    };
  });
}
