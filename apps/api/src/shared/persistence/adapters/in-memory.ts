import type { UnitOfWork } from "../unit-of-work";

/**
 * Test double with no rollback. Atomicity is proven against PGlite, which runs
 * real transactions.
 */
export function createInMemoryUnitOfWork<Scope>(
  build: () => Scope,
): UnitOfWork<Scope> {
  return { run: (work) => work(build()) };
}
