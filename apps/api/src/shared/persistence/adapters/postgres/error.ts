/**
 * Unwraps the PostgreSQL error code and constraint name. `postgres` and
 * Drizzle can wrap the driver error, so the cause chain is walked.
 */
export type PostgresErrorInfo = {
  readonly code: string | null;
  readonly constraint: string | null;
};

export function postgresError(error: unknown): PostgresErrorInfo {
  if (typeof error !== "object" || error === null) {
    return { code: null, constraint: null };
  }

  const code = (error as { code?: unknown }).code;
  const constraint = (error as {
    constraint?: unknown;
    constraint_name?: unknown;
  }).constraint_name ?? (error as { constraint?: unknown }).constraint;
  const cause = postgresError((error as { cause?: unknown }).cause);

  return {
    code: typeof code === "string" ? code : cause.code,
    constraint:
      typeof constraint === "string" ? constraint : cause.constraint,
  };
}
