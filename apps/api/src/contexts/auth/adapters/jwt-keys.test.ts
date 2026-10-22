import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { loadJwtKeys } from "./jwt-keys";
import { newJwtPrivateKey } from "./jwt-test-keys";
import { JwtTokenService } from "./jwt-token-service";

describe("loadJwtKeys", () => {
  test("loads keys and selects the last as active", async () => {
    const first = await newJwtPrivateKey();
    const second = await newJwtPrivateKey();
    const keys = await loadJwtKeys(`${first},${second}`);

    expect(keys.all).toHaveLength(2);
    expect(keys.active.kid).toBe(keys.all[1]!.kid);
    expect(keys.all[0]?.publicKey).not.toHaveProperty("d");
    expect(keys.all[0]?.publicKey.x).toBeTruthy();
  });

  test("rejects missing, malformed, and duplicate keys", async () => {
    await expect(loadJwtKeys(undefined)).rejects.toThrow();
    await expect(loadJwtKeys(" ")).rejects.toThrow();
    await expect(loadJwtKeys("not-a-key")).rejects.toThrow();

    const key = await newJwtPrivateKey();
    await expect(loadJwtKeys(`${key},${key}`)).rejects.toThrow(/duplicate key/);
  });

  test("publishes only public key material", async () => {
    const tokens = new JwtTokenService(
      await loadJwtKeys(await newJwtPrivateKey()),
    );
    const jwks = await tokens.jwks();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).not.toHaveProperty("d");
    expect(JSON.stringify(jwks)).not.toContain('"d"');
  });

  test("rejects tokens signed with a different algorithm", async () => {
    const tokens = new JwtTokenService(
      await loadJwtKeys(await newJwtPrivateKey()),
    );
    const hs256 = await new SignJWT({ pkh: "owner-pkh" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("sequoia")
      .setAudience("sequoia-api")
      .setSubject("owner-pkh")
      .sign(new TextEncoder().encode("secret"));

    expect(await tokens.verify(hs256)).toBeNull();
  });
});
