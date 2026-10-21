import { Elysia } from "elysia";
import type { AuthService } from "./contexts/auth/application/auth-service";
import { authRoutes } from "./contexts/auth/http/routes";
import type { RateLimiter } from "./contexts/auth/types";
import type { AppConfig } from "./config";
import { errorEnvelope } from "./shared/http/error-envelope";

export type AppDependencies = {
  readonly auth: AuthService;
  readonly rateLimiter: RateLimiter;
};

export function createApp(config: AppConfig, deps: AppDependencies) {
  return new Elysia()
    .onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return errorEnvelope("NOT_FOUND", "Route not found");
      }

      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 400;
        return errorEnvelope("VALIDATION_ERROR", "Invalid request");
      }

      set.status = 500;
      return errorEnvelope("INTERNAL_ERROR", "Internal server error");
    })
    .get("/health", () => ({
      status: "ok",
      service: config.serviceName,
      version: config.version,
    }))
    .use(authRoutes(deps));
}
