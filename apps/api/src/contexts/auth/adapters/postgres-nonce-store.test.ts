import type { Sql } from "postgres";
import {
  closePgliteTestDatabase,
  openPgliteTestDatabase,
} from "../../../infrastructure/database/testing";
import { describeNonceStore } from "./nonce-store-contract";
import { PostgresNonceStore } from "./postgres-nonce-store";

async function setup() {
  const client = await openPgliteTestDatabase();

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
    close: closePgliteTestDatabase,
  };
}

describeNonceStore("PostgresNonceStore", setup);
