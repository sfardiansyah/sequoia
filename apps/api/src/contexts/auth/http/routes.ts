import { Elysia, t } from "elysia";
import type { AuthService } from "../application/auth-service";
import { authFailure } from "./errors";
import { authRateLimit } from "./rate-limit";

export function authRoutes(deps: { auth: AuthService }) {
  return new Elysia()
    .use(authRateLimit())
    .post(
      "/auth/nonce",
      async ({ body, set }) => {
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
