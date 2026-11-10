import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

// Serializes concurrent runners. Any fixed key shared by every runner works.
const MIGRATION_LOCK_ID = 7_320_261;

export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const ddl = await readFile(`${migrationsDir}/${file}`, "utf8");

      await sql.begin(async (tx) => {
        // The advisory lock is released when this transaction commits. Holding
        // it while re-checking means a second runner waits, then skips the file
        // instead of re-running a non-idempotent statement.
        await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID}::bigint)`;

        const [applied] = await tx`
          SELECT 1 FROM schema_migrations WHERE name = ${file}
        `;
        if (applied) return;

        await tx.unsafe(ddl);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
    }
  } finally {
    await sql.end();
  }
}
