import {
  errorEnvelope,
  unexpectedErrorEnvelope,
  type ErrorEnvelope,
} from "../../../shared/http/error-envelope";
import type { AuthError } from "../types";

export function authFailure(error: AuthError): {
  status: number;
  body: ErrorEnvelope;
} {
  if (error.code === "UNEXPECTED") {
    return { status: 500, body: unexpectedErrorEnvelope(error.cause) };
  }

  return { status: 401, body: errorEnvelope(error.code, "Authentication failed") };
}
