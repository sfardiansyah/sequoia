/**
 * One transaction, and the only handles a write command may touch. The scope's
 * repositories are built over the transaction, so a domain write cannot escape
 * it.
 */
export interface UnitOfWork<Scope> {
  /**
   * Runs `work` in one transaction and commits when it resolves.
   *
   * `work` must not catch: a throw is what rolls the transaction back, and
   * catching inside would commit a half-applied change.
   */
  run<T>(work: (scope: Scope) => Promise<T>): Promise<T>;
}
