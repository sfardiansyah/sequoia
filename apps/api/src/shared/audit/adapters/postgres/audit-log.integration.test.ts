import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import { describeAuditLog } from "../audit-log-contract";
import { DrizzleAuditLog } from "./audit-log";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  // TRUNCATE is the only reset the append-only trigger allows, by design.
  await client`TRUNCATE TABLE audit_events`;

  const db = drizzle(client, { schema });

  return {
    log: new DrizzleAuditLog(db),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeAuditLog("DrizzleAuditLog (Postgres)", setup);
}
