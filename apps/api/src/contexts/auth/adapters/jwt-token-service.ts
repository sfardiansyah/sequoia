import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { TokenService } from "../types";

export class JwtTokenService implements TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly issuer = "sequoia",
    private readonly audience = "sequoia-api",
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(pkh: string): Promise<string> {
    return new SignJWT({ pkh })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(pkh)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(this.key);
  }

  async verify(token: string): Promise<{ pkh: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.issuer,
        audience: this.audience,
      });
      return typeof payload.pkh === "string" ? { pkh: payload.pkh } : null;
    } catch {
      return null;
    }
  }
}
