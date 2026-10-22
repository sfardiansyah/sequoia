import { randomBytes } from "node:crypto";
import { err, ok, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import type {
  AuthChallenge,
  AuthError,
  NonceStore,
  TokenService,
  WalletSignature,
  WalletVerifier,
} from "../types";

export class AuthService {
  constructor(
    private readonly verifier: WalletVerifier,
    private readonly nonces: NonceStore,
    private readonly tokens: TokenService,
    private readonly now: () => number = Date.now,
  ) {}

  async challenge(
    address: string,
  ): Promise<Result<AuthChallenge, AuthError>> {
    const nonce = `sequoia:${randomBytes(24).toString("hex")}`;
    const expiresAt = this.now() + 5 * 60_000;

    try {
      await this.nonces.create({ nonce, address, expiresAt });
    } catch (cause) {
      return err(unexpected(cause));
    }

    return ok({
      nonce,
      payload: Buffer.from(nonce).toString("hex"),
      expiresAt,
    });
  }

  async verify(
    input: WalletSignature,
  ): Promise<Result<{ token: string }, AuthError>> {
    let valid: boolean;
    try {
      valid = await this.nonces.consume({
        nonce: input.nonce,
        address: input.address,
        now: this.now(),
      });
    } catch (cause) {
      return err(unexpected(cause));
    }

    if (!valid) return err({ code: "INVALID_NONCE" });

    let pkh: string;
    try {
      if (!this.verifier.verify(input)) {
        return err({ code: "INVALID_SIGNATURE" });
      }
      pkh = this.verifier.publicKeyHash(input.key);
    } catch {
      return err({ code: "INVALID_SIGNATURE" });
    }

    try {
      return ok({ token: await this.tokens.sign(pkh) });
    } catch (cause) {
      return err(unexpected(cause));
    }
  }

  async authenticate(
    token: string,
  ): Promise<Result<{ pkh: string }, AuthError>> {
    try {
      const claims = await this.tokens.verify(token);
      return claims ? ok(claims) : err({ code: "UNAUTHORIZED" });
    } catch (cause) {
      return err(unexpected(cause));
    }
  }
}
