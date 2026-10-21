import { Elysia, t } from "elysia";
import { errorEnvelope } from "../../../shared/http/error-envelope";
import type { AuthService } from "../application/auth-service";
import type { RateLimiter } from "../types";

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
        return deps.auth.challenge(body.address);
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
          set.status = 401;
          return errorEnvelope(result.error, "Authentication failed");
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
    )
    .get("/members/me", async ({ headers, set }) => {
      const authorization = headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : undefined;

      if (!token) {
        set.status = 401;
        return errorEnvelope("UNAUTHORIZED", "Missing bearer token");
      }

      const result = await deps.auth.findMember(token);
      if (!result.ok) {
        set.status = 401;
        return errorEnvelope(result.error, "Authentication failed");
      }

      const member = result.value;
      return {
        id: member.id,
        ownerPkh: member.ownerPkh,
        memberClass: member.memberClass,
        status: member.status,
        joinedAt: member.joinedAt,
      };
    });
}
