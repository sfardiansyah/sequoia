import { describe, expect, test } from "bun:test";
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

  describe("PostgresNonceStore purge", () => {
    test("removes expired nonces when a new one is created", async () => {
      await ensureMigrated(databaseUrl);
      const client = postgres(databaseUrl, { max: 1 });

      try {
        await client`TRUNCATE TABLE auth_nonces`;
        await client`
          INSERT INTO auth_nonces (nonce, address, expires_at)
          VALUES ('expired', 'addr_test1-member', 500)
        `;

        const store = new PostgresNonceStore(client);
        await store.create({
          nonce: "fresh",
          address: "addr_test1-member",
          expiresAt: 2_000,
          now: 1_000,
        });

        const rows = await client<{ nonce: string }[]>`
          SELECT nonce FROM auth_nonces ORDER BY nonce
        `;
        expect(rows.map((row) => row.nonce)).toEqual(["fresh"]);
      } finally {
        await client.end();
      }
    });
  });
}
