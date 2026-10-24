import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { InMemoryMemberRepository, SequentialIdGenerator } from "./adapters/in-memory";
import { AdmitMember } from "./application/admit-member";
import { FindMemberByPkh } from "./application/find-member";
import { Member, MemberStatus, type MembershipError } from "./domain/member";
import { OwnerPkh } from "./domain/owner-pkh";

const ownerPkhValue = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const ownerPkh = OwnerPkh.parse(ownerPkhValue)!;
const base = {
  ownerPkh: ownerPkhValue,
  kycCommitment: "kyc-commitment-1",
  memberClass: "STANDARD" as const,
  joinedAt: 1_700_000_000_000,
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
  return {
    members,
    admit: new AdmitMember(members, new SequentialIdGenerator()),
    find: new FindMemberByPkh(members),
  };
}

describe("Member", () => {
  test("admits a valid member as active", () => {
    const member = unwrap(Member.admit(memberInput));
    expect(String(member.id)).toBe("member-1");
    expect(member.status).toBe(MemberStatus.Active);
  });

  test("rejects invalid admission input", () => {
    expectError(Member.admit({ ...memberInput, kycCommitment: "" }), "INVALID_KYC_COMMITMENT");
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
    const command = { ...base, kycVerified: true, boardApproved: true };
    const member = unwrap(await admit.execute(command));
    expect(String(member.id)).toBe("member-1");
    expect(await members.findByOwnerPkh(member.ownerPkh)).toBe(member);
  });

  test("normalizes the owner pkh before storing and looking up", async () => {
    const { members, admit } = setup();
    const command = {
      ...base,
      ownerPkh: ` ${base.ownerPkh.toUpperCase()} `,
      kycVerified: true,
      boardApproved: true,
    };

    const member = unwrap(await admit.execute(command));

    expect(member.ownerPkh.value).toBe(ownerPkhValue);
    expect(await members.findByOwnerPkh(member.ownerPkh)).toBe(member);
  });

  test("rejects a non-hash owner", async () => {
    const { admit } = setup();
    expectError(
      await admit.execute({
        ...base,
        ownerPkh: "addr_test1-member",
        kycVerified: true,
        boardApproved: true,
      }),
      "INVALID_OWNER",
    );
  });

  test("rejects missing approvals and duplicates", async () => {
    const { admit } = setup();
    expectError(await admit.execute({ ...base, kycVerified: false, boardApproved: true }), "KYC_NOT_VERIFIED");
    expectError(await admit.execute({ ...base, kycVerified: true, boardApproved: false }), "BOARD_NOT_APPROVED");
    const command = { ...base, kycVerified: true, boardApproved: true };
    unwrap(await admit.execute(command));
    expectError(await admit.execute(command), "ALREADY_MEMBER");
    expectError(
      await admit.execute({
        ...command,
        ownerPkh: ` ${base.ownerPkh.toUpperCase()} `,
      }),
      "ALREADY_MEMBER",
    );
  });
});

describe("FindMemberByPkh", () => {
  test("returns a member by wallet key hash", async () => {
    const { members, find } = setup();
    const member = unwrap(Member.admit(memberInput));
    await members.save(member);

    expect(unwrap(await find.execute(base.ownerPkh))).toBe(member);
  });

  test("returns MEMBER_NOT_FOUND for an unknown key hash", async () => {
    const { find } = setup();
    expectError(await find.execute("unknown-pkh"), "MEMBER_NOT_FOUND");
  });

  test("returns UNEXPECTED when the repository fails", async () => {
    const find = new FindMemberByPkh({
      findByOwnerPkh: async () => {
        throw new Error("database down");
      },
      save: async () => {},
    });

    expectError(await find.execute(ownerPkhValue), "UNEXPECTED");
  });
});
