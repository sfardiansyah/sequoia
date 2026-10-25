import { describe, expect, test } from "bun:test";
import { SequentialIdGenerator } from "../../shared/id-generator";
import type { Result } from "@sequoia/shared";
import { InMemoryMemberRepository, InMemoryKycEligibility } from "./adapters/in-memory";
import { AdmitMember } from "./application/admit-member";
import { Member, MemberStatus, type MembershipError } from "./domain/member";
import { OwnerPkh } from "./domain/owner-pkh";
import type { KycEligibility } from "./domain/ports/kyc-eligibility";

const ownerPkhValue = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const ownerPkh = OwnerPkh.parse(ownerPkhValue)!;
const attestationId = "kyc-1";
const base = {
  ownerPkh: ownerPkhValue,
  kycAttestationId: attestationId,
  memberClass: "STANDARD" as const,
  joinedAt: 1_700_000_000_000,
  now: 1_700_000_000_000,
};
const memberInput = { ...base, id: "member-1", ownerPkh };

function unwrap<T>(result: Result<T, MembershipError>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function expectError<T>(
  result: Result<T, MembershipError>,
  code: MembershipError["code"],
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

function setup() {
  const members = new InMemoryMemberRepository();
  const kyc = new InMemoryKycEligibility().eligible(ownerPkhValue, attestationId);
  return {
    members,
    kyc,
    admit: new AdmitMember(
      members,
      new SequentialIdGenerator("member"),
      kyc,
    ),
  };
}

describe("Member", () => {
  test("admits a valid member as active", () => {
    const member = unwrap(Member.admit(memberInput));
    expect(String(member.id)).toBe("member-1");
    expect(member.status).toBe(MemberStatus.Active);
    expect(member.kycAttestationId).toBe(attestationId);
  });

  test("rejects invalid admission input", () => {
    expectError(
      Member.admit({ ...memberInput, kycAttestationId: " " }),
      "INVALID_KYC_ATTESTATION",
    );
    expectError(Member.admit({ ...memberInput, joinedAt: -1 }), "INVALID_JOIN_TIME");
    expectError(Member.admit({ ...memberInput, joinedAt: 1.5 }), "INVALID_JOIN_TIME");
  });
});

describe("OwnerPkh", () => {
  test("normalizes and rejects invalid hashes", () => {
    expect(OwnerPkh.parse(` ${ownerPkhValue.toUpperCase()} `)?.value).toBe(
      ownerPkhValue,
    );
    expect(OwnerPkh.parse("")).toBeNull();
    expect(OwnerPkh.parse("not-a-pkh")).toBeNull();
  });
});

describe("AdmitMember", () => {
  test("creates and saves a member", async () => {
    const { members, admit } = setup();
    const member = unwrap(await admit.execute(base));
    expect(String(member.id)).toBe("member-1");
    expect(await members.findByOwnerPkh(member.ownerPkh)).toBe(member);
  });

  test("normalizes the owner pkh before storing and looking up", async () => {
    const { members, admit } = setup();
    const command = { ...base, ownerPkh: ` ${base.ownerPkh.toUpperCase()} ` };

    const member = unwrap(await admit.execute(command));

    expect(member.ownerPkh.value).toBe(ownerPkhValue);
    expect(await members.findByOwnerPkh(member.ownerPkh)).toBe(member);
  });

  test("rejects a non-hash owner", async () => {
    const { admit } = setup();
    expectError(
      await admit.execute({ ...base, ownerPkh: "addr_test1-member" }),
      "INVALID_OWNER",
    );
  });

  test("rejects an unknown attestation", async () => {
    const { admit } = setup();
    expectError(
      await admit.execute({ ...base, kycAttestationId: "missing" }),
      "KYC_NOT_VERIFIED",
    );
  });

  test("maps KYC failures to membership errors", async () => {
    const cases = [
      { failure: "EXPIRED" as const, code: "KYC_EXPIRED" as const },
      { failure: "REVOKED" as const, code: "KYC_REVOKED" as const },
      { failure: "SUPERSEDED" as const, code: "KYC_NOT_VERIFIED" as const },
      { failure: "NOT_FOUND" as const, code: "KYC_NOT_VERIFIED" as const },
    ];

    for (const { failure, code } of cases) {
      const members = new InMemoryMemberRepository();
      const kyc = new InMemoryKycEligibility().failing(
        attestationId,
        failure,
        ownerPkhValue,
      );
      const admit = new AdmitMember(
        members,
        new SequentialIdGenerator("member"),
        kyc,
      );

      expectError(await admit.execute(base), code);
    }
  });

  test("rejects an attestation issued to another wallet", async () => {
    const members = new InMemoryMemberRepository();
    const kyc = new InMemoryKycEligibility().eligible(
      "b".repeat(56),
      attestationId,
    );
    const admit = new AdmitMember(
      members,
      new SequentialIdGenerator("member"),
      kyc,
    );

    expectError(await admit.execute(base), "KYC_SUBJECT_MISMATCH");
  });

  test("rejects duplicates", async () => {
    const { admit } = setup();
    unwrap(await admit.execute(base));
    expectError(await admit.execute(base), "ALREADY_MEMBER");
    expectError(
      await admit.execute({
        ...base,
        ownerPkh: ` ${base.ownerPkh.toUpperCase()} `,
      }),
      "ALREADY_MEMBER",
    );
  });

  test("returns UNEXPECTED when the KYC lookup fails", async () => {
    const admit = new AdmitMember(
      new InMemoryMemberRepository(),
      new SequentialIdGenerator("member"),
      {
        check: async () => {
          throw new Error("identity down");
        },
      },
    );

    expectError(await admit.execute(base), "UNEXPECTED");
  });

  test("checks eligibility at the later of join time and now", async () => {
    const seen: number[] = [];
    const kyc: KycEligibility = {
      check: async (input) => {
        seen.push(input.at);
        return null;
      },
    };
    const admitOne = new AdmitMember(
      new InMemoryMemberRepository(),
      new SequentialIdGenerator("member"),
      kyc,
    );
    const admitTwo = new AdmitMember(
      new InMemoryMemberRepository(),
      new SequentialIdGenerator("member"),
      kyc,
    );

    unwrap(await admitOne.execute({ ...base, joinedAt: 1_000, now: 5_000 }));
    unwrap(await admitTwo.execute({ ...base, joinedAt: 9_000, now: 5_000 }));

    expect(seen).toEqual([5_000, 9_000]);
  });
});
