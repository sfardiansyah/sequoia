import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describeContributionYearRepository } from "../contribution-year-repository-contract";
import { DrizzleContributionYearRepository } from "./contribution-year-repository";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../../infrastructure/database/migrations/0001_init.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleContributionYearRepository(db),
    close: () => client.close(),
  };
}

describeContributionYearRepository(
  "DrizzleContributionYearRepository",
  setup,
);
