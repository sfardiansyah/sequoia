import { Elysia, t } from "elysia";
import { errorEnvelope } from "../../../shared/http/error-envelope";
import type { AuthService } from "../application/auth-service";
import type { RateLimiter } from "../types";
import { authFailure } from "./errors";

export function authRoutes(deps: {
  auth: AuthService;
  rateLimiter: RateLimiter;
}) {
  return new Elysia()
    .post(
      "/auth/nonce",
      async ({ body, set }) => {
        if (!deps.rateLimiter.allow(`nonce:${body.address}`)) {
          set.status = 429;
          return errorEnvelope("RATE_LIMITED", "Too many requests");
        }

        const result = await deps.auth.challenge(body.address);
        if (!result.ok) {
          const failure = authFailure(result.error);
          set.status = failure.status;
          return failure.body;
        }

        return result.value;
      },
      { body: t.Object({ address: t.String({ minLength: 1 }) }) },
    )
    .post(
      "/auth/verify",
      async ({ body, set }) => {
        if (!deps.rateLimiter.allow(`verify:${body.address}`)) {
          set.status = 429;
          return errorEnvelope("RATE_LIMITED", "Too many requests");
        }

        const result = await deps.auth.verify(body);
        if (!result.ok) {
          const failure = authFailure(result.error);
          set.status = failure.status;
          return failure.body;
        }

        return result.value;
      },
      {
        body: t.Object({
          address: t.String({ minLength: 1 }),
          nonce: t.String({ minLength: 1 }),
          signature: t.String({ minLength: 1 }),
          key: t.String({ minLength: 1 }),
        }),
      },
    );
}
