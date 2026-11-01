import { describe, expect, test } from "bun:test";
import {
  ContributionYear,
  type ContributionYearRepository,
} from "../domain/contribution-year";

export type ContributionYearRepositoryHarness = {
  repository: ContributionYearRepository;
  close: () => Promise<void>;
};

export const CONTRACT_CONTRIBUTION_YEAR = 2028;

function year(input: {
  year?: number;
  annualAmount?: number;
  memberCapitalBps?: number;
  capitalParticipationBps?: number;
  standardCapitalParticipationMaxBps?: number;
}): ContributionYear {
  const configured = ContributionYear.configure({
    year: input.year ?? CONTRACT_CONTRIBUTION_YEAR,
    annualAmount: input.annualAmount ?? 1_000_000,
    memberCapitalBps: input.memberCapitalBps ?? 7_000,
    capitalParticipationBps: input.capitalParticipationBps ?? 3_000,
    standardCapitalParticipationMaxBps:
      input.standardCapitalParticipationMaxBps ?? 5_000,
    createdAt: 1_700_000_000_000,
  });
  if (!configured.ok) throw new Error(configured.error.code);
  return configured.value;
}

export function describeContributionYearRepository(
  name: string,
  create: () => Promise<ContributionYearRepositoryHarness>,
): void {
  describe(name, () => {
    test("returns null for an unknown year", async () => {
      const { repository, close } = await create();

      try {
        expect(await repository.findByYear(CONTRACT_CONTRIBUTION_YEAR)).toBeNull();
      } finally {
        await close();
      }
    });

    test("saves and finds the year parameters", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(year({}));

        const found = await repository.findByYear(CONTRACT_CONTRIBUTION_YEAR);
        expect(found?.year).toBe(CONTRACT_CONTRIBUTION_YEAR);
        expect(Number(found?.annualAmount)).toBe(1_000_000);
        expect(Number(found?.memberCapitalBps)).toBe(7_000);
        expect(Number(found?.capitalParticipationBps)).toBe(3_000);
        expect(Number(found?.standardCapitalParticipationMaxBps)).toBe(5_000);
      } finally {
        await close();
      }
    });

    test("rejects a second row for the same year", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(year({}));
        await expect(repository.save(year({}))).rejects.toThrow();
      } finally {
        await close();
      }
    });
  });
}
