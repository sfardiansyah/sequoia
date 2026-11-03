import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "./migrate";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

const migrated = new Map<string, Promise<void>>();

// Test helper: run migrations once per database URL in this process.
export function ensureMigrated(databaseUrl: string): Promise<void> {
  let migration = migrated.get(databaseUrl);
  if (!migration) {
    migration = migrateDatabase(databaseUrl);
    migrated.set(databaseUrl, migration);
  }
  return migration;
}

/**
 * Apply every migration, in order, to an in-process PGlite client. Harnesses
 * must not name migration files: a new migration then lands in every test too.
 */
export async function execMigrations(client: {
  exec(sql: string): Promise<unknown>;
}): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    await client.exec(await readFile(`${migrationsDir}/${file}`, "utf8"));
  }
}
