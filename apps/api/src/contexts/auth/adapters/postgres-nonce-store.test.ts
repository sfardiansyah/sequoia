import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "postgres";
import { describeNonceStore } from "./nonce-store-contract";
import { PostgresNonceStore } from "./postgres-nonce-store";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../infrastructure/database/migrations/0001_init.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);

  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (query, part, index) =>
        `${query}${part}${index < values.length ? `$${index + 1}` : ""}`,
      "",
    );
    // postgres-js tagged templates resolve to the row array; PGlite wraps it.
    return client.query(text, values).then((result) => result.rows);
  }) as unknown as Sql;

  return {
    store: new PostgresNonceStore(sql),
    close: () => client.close(),
  };
}

describeNonceStore("PostgresNonceStore", setup);
