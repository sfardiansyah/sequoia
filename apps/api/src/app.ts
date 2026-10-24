import { Elysia } from "elysia";
import type { AuthService } from "./contexts/auth/application/auth-service";
import { authRoutes } from "./contexts/auth/http/routes";
import type { JwksProvider } from "./contexts/auth/types";
import type { FindMemberByPkh } from "./contexts/membership/application/find-member";
import { membershipRoutes } from "./contexts/membership/http/routes";
import type { AppConfig } from "./config";
import { errorEnvelope } from "./shared/http/error-envelope";

export type AppDependencies = {
  readonly auth: AuthService;
  readonly jwks: JwksProvider;
  readonly findMemberByPkh: FindMemberByPkh;
  readonly checkDatabase: () => Promise<void>;
};

export function createApp(config: AppConfig, deps: AppDependencies) {
  return new Elysia({ serve: { maxRequestBodySize: 16 * 1024 } })
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
    .get("/health", async ({ set }) => {
      try {
        await deps.checkDatabase();
      } catch {
        set.status = 503;
        return errorEnvelope("SERVICE_UNAVAILABLE", "Database unavailable");
      }

      return {
        status: "ok",
        service: config.serviceName,
        version: config.version,
      };
    })
    .get("/.well-known/jwks.json", async ({ set }) => {
      set.headers["cache-control"] = "public, max-age=300";
      return deps.jwks.jwks();
    })
    .use(authRoutes(deps))
    .use(membershipRoutes(deps));
}
