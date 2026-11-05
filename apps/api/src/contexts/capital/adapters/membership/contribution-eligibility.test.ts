import { describe, expect, test } from "bun:test";
import {
  InMemoryKycEligibility,
  InMemoryMemberRepository,
} from "../../../membership/adapters/in-memory";
import {
  Member,
  MemberStatus,
  type MemberRepository,
} from "../../../membership/domain/member";
import { OwnerPkh } from "../../../membership/domain/owner-pkh";
import type { ContributionEligibilityFailure } from "../../domain/ports/contribution-eligibility";
import { MembershipContributionEligibility } from "./contribution-eligibility";

const ownerPkhValue =
  "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const at = 1_700_000_000_000;

function member(status: MemberStatus = MemberStatus.Active) {
  const admitted = Member.rehydrate({
    id: "member-1",
    ownerPkh: ownerPkhValue,
    kycAttestationId: "kyc-1",
    boardApprovalRef: "board-2026-04",
    approvedAt: 1_690_000_000_000,
    memberClass: "STANDARD",
    status,
    joinedAt: 1_690_000_000_000,
  });
  if (!admitted.ok) throw new Error(admitted.error.code);
  return admitted.value;
}

function setup() {
  const members: MemberRepository = new InMemoryMemberRepository();
  const kyc = new InMemoryKycEligibility().eligible(ownerPkhValue, "kyc-1");
  return {
    members,
    kyc,
    eligibility: new MembershipContributionEligibility(members, kyc),
  };
}

async function expectFailure(
  failure: ContributionEligibilityFailure,
  build: () => Promise<{
    eligibility: MembershipContributionEligibility;
  }>,
): Promise<void> {
  const { eligibility } = await build();
  expect(await eligibility.check({ memberId: "member-1", at })).toBe(failure);
}

describe("MembershipContributionEligibility", () => {
  test("accepts an active member with current KYC", async () => {
    const { members, eligibility } = setup();
    await members.save(member());

    expect(await eligibility.check({ memberId: "member-1", at })).toBeNull();
  });

  test("rejects an unknown member", async () => {
    const { eligibility } = setup();

    expect(await eligibility.check({ memberId: "missing", at })).toBe(
      "MEMBER_NOT_FOUND",
    );
  });

  test("rejects an inactive member", async () => {
    const { members, eligibility } = setup();
    await members.save(member(MemberStatus.Inactive));

    expect(await eligibility.check({ memberId: "member-1", at })).toBe(
      "MEMBER_INACTIVE",
    );
  });

  test("rejects a member without a board approval reference", async () => {
    const members: MemberRepository = {
      findById: async () =>
        ({
          id: "member-1",
          ownerPkh: OwnerPkh.parse(ownerPkhValue)!,
          boardApprovalRef: "",
          status: MemberStatus.Active,
        }) as unknown as Member,
      findByOwnerPkh: async () => null,
      save: async () => {},
    };
    const kyc = new InMemoryKycEligibility().eligible(ownerPkhValue, "kyc-1");
    const eligibility = new MembershipContributionEligibility(members, kyc);

    expect(await eligibility.check({ memberId: "member-1", at })).toBe(
      "MEMBER_NOT_APPROVED",
    );
  });

  test("maps expired, revoked, and superseded KYC", async () => {
    for (const [failure, expected] of [
      ["EXPIRED", "KYC_EXPIRED"],
      ["REVOKED", "KYC_REVOKED"],
      ["SUPERSEDED", "KYC_NOT_VERIFIED"],
    ] as const) {
      await expectFailure(expected, async () => {
        const members = new InMemoryMemberRepository();
        await members.save(member());
        const kyc = new InMemoryKycEligibility().failing(
          "kyc-1",
          failure,
          ownerPkhValue,
        );
        return {
          eligibility: new MembershipContributionEligibility(members, kyc),
        };
      });
    }
  });
});
