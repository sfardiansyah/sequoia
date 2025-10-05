import * as fs from "fs";
import { importPKCS8, SignJWT } from "jose";
import type { ID } from "../../shared";
import dayjs from "dayjs";

export class TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;

  constructor(accessToken: Token, refreshToken: Token) {
    this.accessToken = accessToken.token;
    this.refreshToken = refreshToken.token;
    this.expiresAt = accessToken.expiresAt;
  }
}

export interface Token {
  token: string;
  expiresAt: Date;
}

export class RefreshToken implements Token {
  token: string;
  expiresAt: Date;

  constructor(params: Token) {
    this.token = params.token;
    this.expiresAt = params.expiresAt;
  }

  static generate = (
    length: number = 64,
    daysToExpire: number = 30,
  ): RefreshToken => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const randomValues = new Uint8Array(length);

    crypto.getRandomValues(randomValues);

    let result = "";
    randomValues.forEach(
      (val) => (result += characters.charAt(val % characters.length)),
    );

    const expiresAt = dayjs().add(daysToExpire, "d");

    return new RefreshToken({ token: result, expiresAt: expiresAt.toDate() });
  };
}

export class AccessToken implements Token {
  token: string;
  expiresAt: Date;

  constructor(params: Token) {
    this.token = params.token;
    this.expiresAt = params.expiresAt;
  }
}

export interface JWTPayload {
  sub?: string;
}
