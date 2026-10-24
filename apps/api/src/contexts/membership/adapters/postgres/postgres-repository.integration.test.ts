import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import { describeMemberRepository } from "../member-repository-contract";
import { DrizzleMemberRepository } from "./member-repository";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  await client`TRUNCATE TABLE members`;
  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleMemberRepository(db),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeMemberRepository("DrizzleMemberRepository (Postgres)", setup);
}
