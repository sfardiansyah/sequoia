import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describeAuditLog } from "../audit-log-contract";
import { DrizzleAuditLog } from "./audit-log";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../../infrastructure/database/migrations/0002_audit_events.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);
  const db = drizzle(client, { schema });

  return {
    log: new DrizzleAuditLog(db),
    close: () => client.close(),
  };
}

describeAuditLog("DrizzleAuditLog", setup);

describe("audit_events append-only trigger", () => {
  async function seeded() {
    const client = new PGlite();
    const ddl = await readFile(
      new URL(
        "../../../../infrastructure/database/migrations/0002_audit_events.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.exec(ddl);
    await client.exec(`
      INSERT INTO audit_events
        (id, actor, action, entity_type, entity_id, occurred_at)
      VALUES ('audit-1', 'ray', 'KYC_ISSUED', 'KYC_ATTESTATION', 'kyc-1', 0);
    `);
    return client;
  }

  test("rejects updates and deletes", async () => {
    const client = await seeded();

    try {
      await expect(
        client.exec("UPDATE audit_events SET actor = 'someone'"),
      ).rejects.toThrow(/append-only/);
      await expect(client.exec("DELETE FROM audit_events")).rejects.toThrow(
        /append-only/,
      );

      const rows = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_events",
      );
      expect(rows.rows[0]?.count).toBe(1);
    } finally {
      await client.close();
    }
  });
});
