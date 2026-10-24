import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { loadConfig, type AppConfig } from "./config";
import { InMemoryNonceStore } from "./contexts/auth/adapters/in-memory-nonce-store";
import { loadJwtKeys } from "./contexts/auth/adapters/jwt-keys";
import { newJwtPrivateKey } from "./contexts/auth/adapters/jwt-test-keys";
import { JwtTokenService } from "./contexts/auth/adapters/jwt-token-service";
import { AuthService } from "./contexts/auth/application/auth-service";
import { InMemoryMemberRepository } from "./contexts/membership/adapters/in-memory";
import { FindMemberByPkh } from "./contexts/membership/application/find-member";
import { Member } from "./contexts/membership/domain/member";
import { OwnerPkh } from "./contexts/membership/domain/owner-pkh";
import { errorEnvelope } from "./shared/http/error-envelope";

const config: AppConfig = { serviceName: "sequoia-api", version: "0.1.0", environment: "test", port: 3000 };
const ownerPkhValue = "a".repeat(56);
const ownerPkh = OwnerPkh.parse(ownerPkhValue)!;
const members = new InMemoryMemberRepository();
const tokens = new JwtTokenService(await loadJwtKeys(await newJwtPrivateKey()));
const auth = new AuthService(
  { verify: () => true, publicKeyHash: () => ownerPkhValue },
  new InMemoryNonceStore(),
  tokens,
);
const findMemberByPkh = new FindMemberByPkh(members);
const app = createApp(config, {
  auth,
  jwks: tokens,
  findMemberByPkh,
  checkDatabase: async () => {},
});

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

  test("GET /health returns 503 when the database is down", async () => {
    const failingApp = createApp(config, {
      auth,
      jwks: tokens,
      findMemberByPkh,
      checkDatabase: async () => {
        throw new Error("database down");
      },
    });

    const response = await failingApp.handle(
      new Request("http://localhost/health"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: "Database unavailable" },
    });
  });

  test("rejects an oversized auth address", async () => {
    const response = await post("/auth/nonce", { address: "a".repeat(129) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid request" },
    });
  });

  test("GET /.well-known/jwks.json", async () => {
    const response = await app.handle(new Request("http://localhost/.well-known/jwks.json"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const body = (await response.json()) as { keys: Record<string, unknown>[] };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(body.keys[0]).not.toHaveProperty("d");
  });

  test("unknown route returns the error envelope", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  test("CIP-30 auth and GET /members/me", async () => {
    const member = Member.admit({
      id: "member-1",
      ownerPkh,
      kycCommitment: "kyc-1",
      memberClass: "STANDARD",
      joinedAt: 1_700_000_000_000,
    });
    if (!member.ok) throw new Error(member.error.code);
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
      ownerPkh: ownerPkhValue,
      memberClass: "STANDARD",
      status: "ACTIVE",
      joinedAt: 1_700_000_000_000,
    });

    const replay = await post("/auth/verify", { address, nonce: challenge.nonce, signature: "signature", key: "key" });
    expect(replay.status).toBe(401);
  });

  test("GET /members/me rejects a token without a member", async () => {
    const token = await tokens.sign("ghost-pkh");
    const response = await app.handle(
      new Request("http://localhost/members/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "MEMBER_NOT_FOUND", message: "Member not found" },
    });
  });

  test("rate limits auth requests", async () => {
    const limitedApp = createApp(config, {
      auth,
      jwks: tokens,
      findMemberByPkh,
      checkDatabase: async () => {},
    });
    let response: Response | undefined;

    for (let index = 0; index < 11; index += 1) {
      response = await limitedApp.handle(
        new Request("http://localhost/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: `addr_test1-${index}` }),
        }),
      );
    }

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    });

    const health = await limitedApp.handle(
      new Request("http://localhost/health"),
    );
    expect(health.status).toBe(200);
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
