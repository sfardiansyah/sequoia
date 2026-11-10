import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "./migrate";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

const migrated = new Map<string, Promise<void>>();

// Test helper: run migrations once per database URL in this process.
export function ensureMigrated(databaseUrl: string): Promise<void> {
  assertTestDatabase(databaseUrl);

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

type DatabaseTarget = {
  readonly host: string;
  readonly port: string;
  readonly database: string;
};

function parseDatabaseUrl(value: string, name: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error(`${name} must name a database`);

  return {
    host: url.hostname,
    port: url.port || "5432",
    database,
  };
}

/**
 * The integration harness truncates every table, so refuse anything that is not
 * obviously a throwaway database. The name must end in `_test`, and it must not
 * be the database `DATABASE_URL` points at.
 */
export function assertTestDatabase(
  databaseUrl: string,
  mainDatabaseUrl: string | undefined = process.env.DATABASE_URL,
): void {
  const target = parseDatabaseUrl(databaseUrl, "TEST_DATABASE_URL");

  if (!target.database.toLowerCase().endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test", got "${target.database}"`,
    );
  }

  if (!mainDatabaseUrl) return;

  const main = parseDatabaseUrl(mainDatabaseUrl, "DATABASE_URL");
  if (
    main.host === target.host &&
    main.port === target.port &&
    main.database === target.database
  ) {
    throw new Error(
      "TEST_DATABASE_URL must not name the same database as DATABASE_URL",
    );
  }
}
