import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { loadConfig, type AppConfig } from "./config";
import { InMemoryNonceStore } from "./contexts/auth/adapters/in-memory-nonce-store";
import { InMemoryRateLimiter } from "./contexts/auth/adapters/in-memory-rate-limiter";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { AuthService } from "./contexts/auth/application/auth-service";
import { InMemoryMemberRepository } from "./contexts/membership/adapters/in-memory";
import { Member } from "./contexts/membership/domain/member";
import { errorEnvelope } from "./shared/http/error-envelope";

const config: AppConfig = { serviceName: "sequoia-api", version: "0.1.0", environment: "test", port: 3000 };
const members = new InMemoryMemberRepository();
const auth = new AuthService(
  members,
  { verify: () => true, publicKeyHash: () => "owner-pkh" },
  new InMemoryNonceStore(),
  new JwtTokenService("test-secret"),
);
const rateLimiter = new InMemoryRateLimiter(100, 60_000);
const app = createApp(config, { auth, rateLimiter });

function post(path: string, body: unknown) {
  return app.handle(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("api", () => {
  test("GET /health", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "sequoia-api", version: "0.1.0" });
  });

  test("unknown route returns the error envelope", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  test("CIP-30 auth and GET /members/me", async () => {
    const member = Member.admit({
      id: "member-1",
      ownerPkh: "owner-pkh",
      kycCommitment: "kyc-1",
      memberClass: "STANDARD",
      joinedAt: 1_700_000_000_000,
    });
    if (!member.ok) throw new Error(member.error);
    await members.save(member.value);

    const address = "addr_test1-member";
    const challenge = (await (await post("/auth/nonce", { address })).json()) as { nonce: string };
    const verify = await post("/auth/verify", { address, nonce: challenge.nonce, signature: "signature", key: "key" });
    expect(verify.status).toBe(200);
    const { token } = (await verify.json()) as { token: string };

    const me = await app.handle(new Request("http://localhost/members/me", { headers: { authorization: `Bearer ${token}` } }));
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      id: "member-1",
      ownerPkh: "owner-pkh",
      memberClass: "STANDARD",
      status: "ACTIVE",
      joinedAt: 1_700_000_000_000,
    });

    const replay = await post("/auth/verify", { address, nonce: challenge.nonce, signature: "signature", key: "key" });
    expect(replay.status).toBe(401);
  });
});

describe("ErrorEnvelope", () => {
  test("builds the error envelope", () => {
    expect(errorEnvelope("TEST_ERROR", "Something went wrong")).toEqual({ error: { code: "TEST_ERROR", message: "Something went wrong" } });
  });
});

describe("config", () => {
  test("loads defaults", () => {
    expect(loadConfig({})).toEqual({ serviceName: "sequoia-api", version: "0.1.0", environment: "development", port: 3000 });
  });
  test("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow();
  });
});
