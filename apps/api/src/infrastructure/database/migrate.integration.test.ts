import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import { migrateDatabase } from "./migrate";
import { assertTestDatabase } from "./testing";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

if (runIntegration && databaseUrl) {
  assertTestDatabase(databaseUrl);

  describe("migrateDatabase (Postgres)", () => {
    test("two concurrent runs both finish and record the migration", async () => {
      const client = postgres(databaseUrl, { max: 1 });

      try {
        await migrateDatabase(databaseUrl);

        // The state a partially failed deploy leaves: tables and seeds exist,
        // the migration log does not.
        await client`TRUNCATE TABLE schema_migrations`;

        await Promise.all([
          migrateDatabase(databaseUrl),
          migrateDatabase(databaseUrl),
        ]);

        const rows = await client`
          SELECT name FROM schema_migrations ORDER BY name
        `;
        expect(rows.map((row) => row.name)).toEqual(["0001_init.sql"]);

        const issuers = await client`SELECT id FROM kyc_issuers ORDER BY id`;
        expect(issuers.map((row) => row.id)).toEqual(["INTERNAL", "MANUAL"]);
      } finally {
        await client.end();
      }
    });
  });
}
