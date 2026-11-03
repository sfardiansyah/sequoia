import { parseActor } from "../shared/audit/audit-event";

/** Resolve the operator before any database work, so a missing actor changes nothing. */
export function resolveOperator(
  env: Record<string, string | undefined> = process.env,
): string {
  const actor = parseActor(env.SEQUOIA_OPERATOR ?? "");
  if (!actor) {
    throw new Error(
      "SEQUOIA_OPERATOR is required and must be a lower-case slug, e.g. ray or board-ops",
    );
  }
  return actor;
}
