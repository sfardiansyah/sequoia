import { describe, expect, test } from "bun:test";
import {
  Contribution,
  DuplicateContributionError,
  type ContributionRepository,
} from "../domain/contribution";

export type ContributionRepositoryHarness = {
  repository: ContributionRepository;
  close: () => Promise<void>;
};

export const CONTRACT_MEMBER_ID = "member-1";

function contribution(input: {
  id?: string;
  memberId?: string;
  contributionYear?: number;
  annualAmount?: number;
  bankAttestationId?: string;
}): Contribution {
  const id = input.id ?? "contribution-1";
  const recorded = Contribution.record({
    id,
    memberId: input.memberId ?? CONTRACT_MEMBER_ID,
    contributionYear: input.contributionYear ?? 2026,
    bankAttestationId: input.bankAttestationId ?? `attestation-${id}`,
    annualAmount: input.annualAmount ?? 1_000_000,
    split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
    recordedAt: 1_700_000_000_000,
  });
  if (!recorded.ok) throw new Error(recorded.error.code);
  return recorded.value;
}

export function describeContributionRepository(
  name: string,
  create: () => Promise<ContributionRepositoryHarness>,
): void {
  describe(name, () => {
    test("returns null for an unknown member and year", async () => {
      const { repository, close } = await create();

      try {
        expect(
          await repository.findByMemberAndYear(CONTRACT_MEMBER_ID, 2026),
        ).toBeNull();
      } finally {
        await close();
      }
    });

    test("saves and finds the split snapshot", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(contribution({ id: "contribution-1" }));

        const found = await repository.findByMemberAndYear(
          CONTRACT_MEMBER_ID,
          2026,
        );
        expect(String(found?.id)).toBe("contribution-1");
        expect(Number(found?.annualAmount)).toBe(1_000_000);
        expect(Number(found?.memberCapitalBps)).toBe(7_000);
        expect(Number(found?.capitalParticipationBps)).toBe(3_000);
        expect(found?.memberCapital).toBe(700_000n);
        expect(found?.capitalParticipation).toBe(300_000n);
        expect(found?.bankAttestationId).toBe("attestation-contribution-1");
        expect(found?.source).toBe("PILOT");
        expect(found?.chainTx).toBeNull();
      } finally {
        await close();
      }
    });

    test("rejects the same bank attestation twice", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(contribution({ id: "contribution-1" }));
        await expect(
          repository.save(
            contribution({
              id: "contribution-2",
              contributionYear: 2027,
              bankAttestationId: "attestation-contribution-1",
            }),
          ),
        ).rejects.toThrow();
      } finally {
        await close();
      }
    });

    test("rejects a second contribution for the same member and year", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(contribution({ id: "contribution-1" }));
        await expect(
          repository.save(contribution({ id: "contribution-2" })),
        ).rejects.toThrow(DuplicateContributionError);
      } finally {
        await close();
      }
    });

    test("rejects a duplicate contribution id", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(contribution({ id: "contribution-1" }));
        await expect(
          repository.save(
            contribution({ id: "contribution-1", contributionYear: 2027 }),
          ),
        ).rejects.toThrow(DuplicateContributionError);
      } finally {
        await close();
      }
    });

    test("keeps separate contribution years", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(contribution({ id: "contribution-1" }));
        await repository.save(
          contribution({ id: "contribution-2", contributionYear: 2027 }),
        );

        expect(
          String(
            (await repository.findByMemberAndYear(CONTRACT_MEMBER_ID, 2026))
              ?.id,
          ),
        ).toBe("contribution-1");
        expect(
          String(
            (await repository.findByMemberAndYear(CONTRACT_MEMBER_ID, 2027))
              ?.id,
          ),
        ).toBe("contribution-2");
      } finally {
        await close();
      }
    });

    test("preserves bigint unit amounts", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(
          contribution({
            id: "contribution-1",
            annualAmount: 1_000_000_000_000_000,
          }),
        );

        const found = await repository.findByMemberAndYear(
          CONTRACT_MEMBER_ID,
          2026,
        );
        expect(found?.memberCapital).toBe(700_000_000_000_000n);
        expect(found?.capitalParticipation).toBe(300_000_000_000_000n);
      } finally {
        await close();
      }
    });
  });
}
