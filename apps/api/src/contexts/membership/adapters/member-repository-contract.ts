import { describe, expect, test } from "bun:test";
import {
  Member,
  MemberStatus,
  type MemberRepository,
} from "../domain/member";

export type MemberRepositoryHarness = {
  repository: MemberRepository;
  close: () => Promise<void>;
};

function admitted(id = "member-1", ownerPkh = "addr_test1-member"): Member {
  const member = Member.admit({
    id,
    ownerPkh,
    kycCommitment: "kyc-1",
    memberClass: "STANDARD",
    joinedAt: 1_700_000_000_000,
  });
  if (!member.ok) throw new Error(member.error.code);
  return member.value;
}

export function describeMemberRepository(
  name: string,
  create: () => Promise<MemberRepositoryHarness>,
): void {
  describe(name, () => {
    test("returns null for an unknown owner", async () => {
      const { repository, close } = await create();

      try {
        expect(await repository.findByOwnerPkh("missing")).toBeNull();
      } finally {
        await close();
      }
    });

    test("saves, finds, and updates a member by id", async () => {
      const { repository, close } = await create();

      try {
        const member = admitted();
        await repository.save(member);

        const found = await repository.findByOwnerPkh(member.ownerPkh);
        expect(found?.id).toBe(member.id);
        expect(found?.status).toBe(MemberStatus.Active);
        expect(found?.joinedAt).toBe(member.joinedAt);

        const updated = Member.rehydrate({
          id: member.id,
          ownerPkh: member.ownerPkh,
          kycCommitment: member.kycCommitment,
          memberClass: member.memberClass,
          status: MemberStatus.Exited,
          joinedAt: member.joinedAt,
        });
        if (!updated.ok) throw new Error(updated.error.code);

        await repository.save(updated.value);
        expect((await repository.findByOwnerPkh(member.ownerPkh))?.status).toBe(
          MemberStatus.Exited,
        );
      } finally {
        await close();
      }
    });
  });
}
