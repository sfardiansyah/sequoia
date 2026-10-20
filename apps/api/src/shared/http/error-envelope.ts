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
