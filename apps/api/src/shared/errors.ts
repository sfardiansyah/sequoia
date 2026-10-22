export type UnexpectedError = {
  readonly code: "UNEXPECTED";
  readonly cause: unknown;
};

export function unexpected(cause: unknown): UnexpectedError {
  return { code: "UNEXPECTED", cause };
}
