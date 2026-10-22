import { Elysia } from "elysia";
import type { AuthService } from "./contexts/auth/application/auth-service";
import { authRoutes } from "./contexts/auth/http/routes";
import type { JwksProvider, RateLimiter } from "./contexts/auth/types";
import type { FindMemberByPkh } from "./contexts/membership/application/find-member";
import { membershipRoutes } from "./contexts/membership/http/routes";
import type { AppConfig } from "./config";
import { errorEnvelope } from "./shared/http/error-envelope";

export type AppDependencies = {
  readonly auth: AuthService;
  readonly rateLimiter: RateLimiter;
  readonly jwks: JwksProvider;
  readonly findMemberByPkh: FindMemberByPkh;
};

export function createApp(config: AppConfig, deps: AppDependencies) {
  return new Elysia()
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return errorEnvelope("NOT_FOUND", "Route not found");
      }

      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 400;
        return errorEnvelope("VALIDATION_ERROR", "Invalid request");
      }

      console.error("Unhandled API error", error);
      set.status = 500;
      return errorEnvelope("INTERNAL_ERROR", "Internal server error");
    })
    .get("/health", () => ({
      status: "ok",
      service: config.serviceName,
      version: config.version,
    }))
    .get("/.well-known/jwks.json", async ({ set }) => {
      set.headers["cache-control"] = "public, max-age=300";
      return deps.jwks.jwks();
    })
    .use(authRoutes(deps))
    .use(membershipRoutes(deps));
}
