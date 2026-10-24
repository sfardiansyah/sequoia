import { migrateDatabase } from "./migrate";

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
