import { randomUUID } from "node:crypto";
import { createLocalJWKSet, jwtVerify, SignJWT } from "jose";
import type { JwksProvider, JwtPublicKey, TokenService } from "../types";
import type { JwtKeySet } from "./jwt-keys";

export class JwtTokenService implements TokenService, JwksProvider {
  private readonly localJwks;

  constructor(
    private readonly keys: JwtKeySet,
    private readonly issuer = "sequoia",
    private readonly audience = "sequoia-api",
  ) {
    this.localJwks = createLocalJWKSet({
      keys: keys.all.map((key) => key.publicKey),
    });
  }

  async sign(pkh: string): Promise<string> {
    return new SignJWT({ pkh })
      .setProtectedHeader({ alg: "EdDSA", kid: this.keys.active.kid })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(pkh)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(this.keys.active.privateKey);
  }

  async verify(token: string): Promise<{ pkh: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.localJwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["EdDSA"],
      });
      return typeof payload.pkh === "string" && payload.sub === payload.pkh
        ? { pkh: payload.pkh }
        : null;
    } catch {
      return null;
    }
  }

  async jwks(): Promise<{ keys: readonly JwtPublicKey[] }> {
    return { keys: this.keys.all.map((key) => key.publicKey) };
  }
}
