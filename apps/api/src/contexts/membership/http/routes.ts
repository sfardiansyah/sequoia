import { Elysia } from "elysia";
import {
  errorEnvelope,
  unexpectedErrorEnvelope,
} from "../../../shared/http/error-envelope";
import type { AuthService } from "../../auth/application/auth-service";
import { authFailure } from "../../auth/http/errors";
import type { FindMemberByPkh } from "../application/find-member";

export function membershipRoutes(deps: {
  auth: AuthService;
  findMemberByPkh: FindMemberByPkh;
}) {
  return new Elysia().get("/members/me", async ({ headers, set }) => {
    const authorization = headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token) {
      set.status = 401;
      return errorEnvelope("UNAUTHORIZED", "Missing bearer token");
    }

    const claims = await deps.auth.authenticate(token);
    if (!claims.ok) {
      const failure = authFailure(claims.error);
      set.status = failure.status;
      return failure.body;
    }

    const result = await deps.findMemberByPkh.execute(claims.value.pkh);
    if (!result.ok) {
      if (result.error.code === "UNEXPECTED") {
        set.status = 500;
        return unexpectedErrorEnvelope(result.error.cause);
      }

      set.status = 404;
      return errorEnvelope(result.error.code, "Member not found");
    }

    const member = result.value;
    return {
      id: member.id,
      ownerPkh: member.ownerPkh.value,
      memberClass: member.memberClass,
      status: member.status,
      joinedAt: member.joinedAt,
    };
  });
}
