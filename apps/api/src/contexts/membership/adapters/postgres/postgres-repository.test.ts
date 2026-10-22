import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describeMemberRepository } from "../member-repository-contract";
import { DrizzleMemberRepository } from "./member-repository";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../../infrastructure/database/migrations/0001_members.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);
  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleMemberRepository(db),
    close: () => client.close(),
  };
}

describeMemberRepository("DrizzleMemberRepository", setup);
