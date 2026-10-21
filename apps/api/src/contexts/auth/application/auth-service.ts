import { randomBytes } from "node:crypto";
import { err, ok, type Result } from "@sequoia/shared";
import type { Member, MemberRepository } from "../../membership/domain/member";
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
    private readonly members: MemberRepository,
    private readonly verifier: WalletVerifier,
    private readonly nonces: NonceStore,
    private readonly tokens: TokenService,
    private readonly now: () => number = Date.now,
  ) {}

  async challenge(address: string): Promise<AuthChallenge> {
    const nonce = `sequoia:${randomBytes(24).toString("hex")}`;
    const expiresAt = this.now() + 5 * 60_000;

    await this.nonces.create({ nonce, address, expiresAt });

    return {
      nonce,
      payload: Buffer.from(nonce).toString("hex"),
      expiresAt,
    };
  }

  async verify(
    input: WalletSignature,
  ): Promise<Result<{ token: string }, AuthError>> {
    const valid = await this.nonces.consume({
      nonce: input.nonce,
      address: input.address,
      now: this.now(),
    });

    if (!valid) return err("INVALID_NONCE");

    try {
      if (!this.verifier.verify(input)) return err("INVALID_SIGNATURE");
      const pkh = this.verifier.publicKeyHash(input.key);
      return ok({ token: await this.tokens.sign(pkh) });
    } catch {
      return err("INVALID_SIGNATURE");
    }
  }

  async findMember(token: string): Promise<Result<Member, AuthError>> {
    const claims = await this.tokens.verify(token);
    if (!claims) return err("UNAUTHORIZED");

    const member = await this.members.findByOwnerPkh(claims.pkh);
    return member ? ok(member) : err("UNAUTHORIZED");
  }
}
