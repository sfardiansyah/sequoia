import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { InMemoryMemberRepository } from "../membership/adapters/in-memory";
import { Member } from "../membership/domain/member";
import { InMemoryNonceStore } from "./adapters/in-memory-nonce-store";
import { JwtTokenService } from "./adapters/jwt-token-service";
import { AuthService } from "./application/auth-service";
import type { AuthError } from "./types";

function makeAuth(now: () => number = Date.now) {
  const members = new InMemoryMemberRepository();
  let valid = true;
  const verifier = {
    verify: () => valid,
    publicKeyHash: () => "owner-pkh",
  };
  const auth = new AuthService(
    members,
    verifier,
    new InMemoryNonceStore(),
    new JwtTokenService("test-secret"),
    now,
  );
  return {
    auth,
    members,
    setValid(value: boolean) {
      valid = value;
    },
  };
}

function unwrap<T>(result: Result<T, AuthError>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const address = "addr_test1-member";

describe("AuthService", () => {
  test("challenges, verifies, and finds a member", async () => {
    const { auth, members } = makeAuth();
    const member = Member.admit({
      id: "member-1",
      ownerPkh: "owner-pkh",
      kycCommitment: "kyc-1",
      memberClass: "STANDARD",
      joinedAt: 1,
    });
    if (!member.ok) throw new Error(member.error);
    await members.save(member.value);

    const challenge = await auth.challenge(address);
    const session = unwrap(
      await auth.verify({
        address,
        nonce: challenge.nonce,
        signature: "signature",
        key: "key",
      }),
    );

    expect((await auth.findMember(session.token)).ok).toBe(true);
  });

  test("rejects replay and wrong address", async () => {
    const { auth } = makeAuth();
    const challenge = await auth.challenge(address);
    const input = {
      address,
      nonce: challenge.nonce,
      signature: "signature",
      key: "key",
    };

    expect((await auth.verify(input)).ok).toBe(true);
    expect((await auth.verify(input)).ok).toBe(false);

    const second = await auth.challenge(address);
    const wrongAddress = await auth.verify({ ...input, nonce: second.nonce, address: "addr_test1-other" });
    expect(wrongAddress.ok).toBe(false);
  });

  test("rejects expired nonces", async () => {
    let now = 1_000;
    const { auth } = makeAuth(() => now);
    const challenge = await auth.challenge(address);
    now += 5 * 60_000 + 1;

    const result = await auth.verify({
      address,
      nonce: challenge.nonce,
      signature: "signature",
      key: "key",
    });

    expect(result.ok).toBe(false);
  });

  test("rejects invalid signatures and tokens", async () => {
    const { auth, setValid } = makeAuth();
    const challenge = await auth.challenge(address);
    setValid(false);

    const result = await auth.verify({
      address,
      nonce: challenge.nonce,
      signature: "signature",
      key: "key",
    });
    expect(result.ok).toBe(false);
    expect((await auth.findMember("invalid-token")).ok).toBe(false);

    const wrongIssuer = new JwtTokenService("test-secret", "other", "sequoia-api");
    expect((await auth.findMember(await wrongIssuer.sign("owner-pkh"))).ok).toBe(false);
  });
});
