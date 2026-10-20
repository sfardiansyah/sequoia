import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { loadConfig, type AppConfig } from "./config";
import { errorEnvelope } from "./shared/http/error-envelope";

const config: AppConfig = {
  serviceName: "coop-api",
  version: "0.1.0",
  environment: "test",
  port: 3000,
};

const app = createApp(config);

describe("api", () => {
  test("GET /health", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "coop-api",
      version: "0.1.0",
    });
  });

  test("unknown route returns the error envelope", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });
});

describe("ErrorEnvelope", () => {
  test("builds the error envelope", () => {
    expect(errorEnvelope("TEST_ERROR", "Something went wrong")).toEqual({
      error: { code: "TEST_ERROR", message: "Something went wrong" },
    });
  });
});

describe("config", () => {
  test("loads defaults", () => {
    expect(loadConfig({})).toEqual({
      serviceName: "coop-api",
      version: "0.1.0",
      environment: "development",
      port: 3000,
    });
  });

  test("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow();
  });
});
