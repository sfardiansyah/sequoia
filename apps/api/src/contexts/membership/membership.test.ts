import { describe, expect, test } from "bun:test";
import type { Result } from "@coop/shared";
import { InMemoryMemberRepository, SequentialIdGenerator } from "./adapters/in-memory";
import { AdmitMember } from "./application/admit-member";
import { Member, MemberStatus, type MembershipError } from "./domain/member";

const base = {
  ownerPkh: "addr_test1-member",
  kycCommitment: "kyc-commitment-1",
  memberClass: "STANDARD" as const,
  joinedAt: 1_700_000_000_000,
};
const memberInput = { ...base, id: "member-1" };

function unwrap<T>(result: Result<T, MembershipError>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function expectError<T>(
  result: Result<T, MembershipError>,
  error: MembershipError,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(error);
}

function setup() {
  const members = new InMemoryMemberRepository();
  return { members, admit: new AdmitMember(members, new SequentialIdGenerator()) };
}

describe("Member", () => {
  test("admits a valid member as active", () => {
    const member = unwrap(Member.admit(memberInput));
    expect(String(member.id)).toBe("member-1");
    expect(member.status).toBe(MemberStatus.Active);
  });

  test("rejects invalid admission input", () => {
    expectError(Member.admit({ ...memberInput, ownerPkh: "  " }), "INVALID_OWNER");
    expectError(Member.admit({ ...memberInput, kycCommitment: "" }), "INVALID_KYC_COMMITMENT");
    expectError(Member.admit({ ...memberInput, joinedAt: -1 }), "INVALID_JOIN_TIME");
    expectError(Member.admit({ ...memberInput, joinedAt: 1.5 }), "INVALID_JOIN_TIME");
  });
});

describe("AdmitMember", () => {
  test("creates and saves a member", async () => {
    const { members, admit } = setup();
    const command = { ...base, kycVerified: true, boardApproved: true };
    const member = unwrap(await admit.execute(command));
    expect(String(member.id)).toBe("member-1");
    expect(await members.findByOwnerPkh(base.ownerPkh)).toBe(member);
  });

  test("rejects missing approvals and duplicates", async () => {
    const { admit } = setup();
    expectError(await admit.execute({ ...base, kycVerified: false, boardApproved: true }), "KYC_NOT_VERIFIED");
    expectError(await admit.execute({ ...base, kycVerified: true, boardApproved: false }), "BOARD_NOT_APPROVED");
    const command = { ...base, kycVerified: true, boardApproved: true };
    unwrap(await admit.execute(command));
    expectError(await admit.execute(command), "ALREADY_MEMBER");
  });
});
