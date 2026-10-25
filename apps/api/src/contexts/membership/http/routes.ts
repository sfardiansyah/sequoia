import { Elysia } from "elysia";
import {
  errorEnvelope,
  unexpectedErrorEnvelope,
} from "../../../shared/http/error-envelope";
import type { AuthService } from "../../auth/application/auth-service";
import { authFailure } from "../../auth/http/errors";
import type { MemberProfileReader } from "../read-models/member-profile";

export function membershipRoutes(deps: {
  auth: AuthService;
  memberProfile: MemberProfileReader;
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

    let member;
    try {
      member = await deps.memberProfile.findByOwnerPkh(
        claims.value.pkh,
        Date.now(),
      );
    } catch (cause) {
      set.status = 500;
      return unexpectedErrorEnvelope(cause);
    }

    if (!member) {
      set.status = 404;
      return errorEnvelope("MEMBER_NOT_FOUND", "Member not found");
    }

    return {
      id: member.id,
      ownerPkh: member.ownerPkh,
      memberClass: member.memberClass,
      status: member.status,
      joinedAt: member.joinedAt,
      kyc: member.kyc,
    };
  });
}
