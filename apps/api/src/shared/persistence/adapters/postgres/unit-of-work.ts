import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { UnitOfWork } from "../../unit-of-work";

/**
 * Bound to any context's schema; the scope factory decides what the transaction
 * exposes.
 */
type Database = PgDatabase<PgQueryResultHKT, any>;

export function createDrizzleUnitOfWork<Scope>(
  db: Database,
  build: (tx: Database) => Scope,
): UnitOfWork<Scope> {
  return {
    run: (work) => db.transaction((tx) => work(build(tx))),
  };
}
