export interface ErrorDetail {
  readonly code: string;
  readonly message: string;
}

export interface ErrorEnvelope {
  readonly error: ErrorDetail;
}

export function errorEnvelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

export function unexpectedErrorEnvelope(cause: unknown): ErrorEnvelope {
  console.error("Unexpected error", cause);
  return errorEnvelope("INTERNAL_ERROR", "Internal server error");
}
