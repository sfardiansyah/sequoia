import { describe, expect, test } from "bun:test";
import {
  Member,
  MemberStatus,
  type MemberRepository,
} from "../domain/member";
import { OwnerPkh } from "../domain/owner-pkh";

export type MemberRepositoryHarness = {
  repository: MemberRepository;
  close: () => Promise<void>;
};

function admitted(
  id = "member-1",
  ownerPkh = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281",
): Member {
  const parsed = OwnerPkh.parse(ownerPkh);
  if (!parsed) throw new Error("Invalid test owner pkh");

  const member = Member.admit({
    id,
    ownerPkh: parsed,
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
        expect(
          await repository.findByOwnerPkh(
            OwnerPkh.parse("b".repeat(56))!,
          ),
        ).toBeNull();
      } finally {
        await close();
      }
    });

    test("rejects a second member for the same owner", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(admitted("member-1"));
        await expect(repository.save(admitted("member-2"))).rejects.toThrow();
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
          ownerPkh: member.ownerPkh.value,
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
