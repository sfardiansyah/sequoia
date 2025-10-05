import * as fs from "fs";
import type { JWTClient } from "../../domain/auth/ports";
import { importPKCS8, jwtVerify, SignJWT } from "jose";
import type { JWTPayload, Token } from "../../domain/auth/models/token";
import type { ID } from "../../domain/shared";
import dayjs from "dayjs";

export class JoseClient implements JWTClient {
  private publicKey: CryptoKey;
  private privateKey: CryptoKey;
  private algorithm: string;
  private issuer: string;

  constructor(publicKey: CryptoKey, privateKey: CryptoKey) {
    this.algorithm = "ES256";
    this.issuer = process.env.JWT_ISSUER || "localhost";
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  generateToken = async (
    userId: ID,
    minutesToExpire: number = 15,
  ): Promise<Token> => {
    const now = dayjs();
    const expirationTime = now.add(minutesToExpire, "m");

    const jwt = await new SignJWT()
      .setProtectedHeader({ alg: this.algorithm })
      .setSubject(userId.toString())
      .setIssuedAt(now.unix())
      .setIssuer(this.issuer)
      .setExpirationTime(expirationTime.unix())
      .sign(this.privateKey);

    return { token: jwt, expiresAt: expirationTime.toDate() };
  };

  verifyToken = async (token: string): Promise<JWTPayload> => {
    const { payload } = await jwtVerify(token, this.publicKey, {
      algorithms: [this.algorithm],
      issuer: this.issuer,
      requiredClaims: ["sub"],
    });

    return payload;
  };

  static importKey = async (filename: string): Promise<CryptoKey> => {
    const buffer = fs.readFileSync(filename, {
      encoding: "utf-8",
    });
    const key = await importPKCS8(buffer, "ES256");

    return key;
  };
}
