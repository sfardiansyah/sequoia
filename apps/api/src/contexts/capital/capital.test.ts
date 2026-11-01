import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { SequentialIdGenerator } from "../../shared/id-generator";
import {
  InMemoryContributionRepository,
  InMemoryContributionYearRepository,
} from "./adapters/in-memory";
import { ConfigureContributionYear } from "./application/configure-contribution-year";
import { RecordAnnualContribution } from "./application/record-annual-contribution";
import {
  Contribution,
  DuplicateContributionError,
  UnknownContributionMemberError,
  type ContributionRepository,
} from "./domain/contribution";
import { ContributionYear } from "./domain/contribution-year";
import type { ContributionEligibility } from "./domain/ports/contribution-eligibility";

const contributionBase = {
  memberId: "member-1",
  contributionYear: 2026,
  annualAmount: 1_000_000,
  split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
  recordedAt: 1_700_000_000_000,
};

const recordBase = {
  memberId: "member-1",
  contributionYear: 2026,
  recordedAt: 1_700_000_000_000,
};

const yearCommand = {
  year: 2026,
  annualAmount: 1_000_000,
  memberCapitalBps: 7_000,
  capitalParticipationBps: 3_000,
  standardCapitalParticipationMaxBps: 5_000,
  createdAt: 1_700_000_000_000,
};

function unwrap<T, E extends { readonly code: string }>(
  result: Result<T, E>,
): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function expectError<T, E extends { readonly code: string }>(
  result: Result<T, E>,
  code: E["code"],
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

const allowAll: ContributionEligibility = {
  check: async () => null,
};

function setup() {
  const years = new InMemoryContributionYearRepository();
  const contributions = new InMemoryContributionRepository();
  return {
    years,
    contributions,
    configureYear: new ConfigureContributionYear(years),
    record: new RecordAnnualContribution(
      contributions,
      years,
      allowAll,
      new SequentialIdGenerator("contribution"),
    ),
  };
}

async function configured() {
  const container = setup();
  unwrap(await container.configureYear.execute(yearCommand));
  return container;
}

describe("ContributionYear", () => {
  test("configures the annual amount and cap", () => {
    const year = unwrap(ContributionYear.configure(yearCommand));

    expect(year.year).toBe(2026);
    expect(Number(year.annualAmount)).toBe(1_000_000);
    expect(Number(year.memberCapitalBps)).toBe(7_000);
    expect(Number(year.capitalParticipationBps)).toBe(3_000);
    expect(Number(year.standardCapitalParticipationMaxBps)).toBe(5_000);
    expect(year.split).toEqual({
      memberCapitalBps: 7_000,
      capitalParticipationBps: 3_000,
    });
  });

  test("rejects invalid year parameters", () => {
    expectError(
      ContributionYear.configure({ ...yearCommand, year: 0 }),
      "INVALID_YEAR",
    );
    expectError(
      ContributionYear.configure({ ...yearCommand, year: 2026.5 }),
      "INVALID_YEAR",
    );
    expectError(
      ContributionYear.configure({ ...yearCommand, annualAmount: 0 }),
      "INVALID_AMOUNT",
    );
    expectError(
      ContributionYear.configure({ ...yearCommand, annualAmount: -1 }),
      "INVALID_AMOUNT",
    );
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        memberCapitalBps: 7_000,
        capitalParticipationBps: 2_000,
      }),
      "INVALID_SPLIT",
    );
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        memberCapitalBps: 4_000,
        capitalParticipationBps: 6_000,
        standardCapitalParticipationMaxBps: 5_000,
      }),
      "INVALID_CAP",
    );
    expectError(
      ContributionYear.configure({ ...yearCommand, createdAt: -1 }),
      "INVALID_TIME",
    );
  });
});

describe("ConfigureContributionYear", () => {
  test("saves the year parameters", async () => {
    const { years, configureYear } = setup();
    const year = unwrap(await configureYear.execute(yearCommand));

    expect(await years.findByYear(2026)).toBe(year);
  });

  test("rejects a second configuration for the same year", async () => {
    const { configureYear } = setup();
    unwrap(await configureYear.execute(yearCommand));

    expectError(
      await configureYear.execute({ ...yearCommand, annualAmount: 2_000_000 }),
      "YEAR_ALREADY_CONFIGURED",
    );
  });
});

describe("Contribution", () => {
  test("records the applied split and both unit amounts", () => {
    const contribution = unwrap(
      Contribution.record({ id: "contribution-1", ...contributionBase }),
    );

    expect(contribution.memberId).toBe("member-1");
    expect(contribution.contributionYear).toBe(2026);
    expect(Number(contribution.annualAmount)).toBe(1_000_000);
    expect(Number(contribution.memberCapitalBps)).toBe(7_000);
    expect(Number(contribution.capitalParticipationBps)).toBe(3_000);
    expect(contribution.memberCapital).toBe(700_000n);
    expect(contribution.capitalParticipation).toBe(300_000n);
  });

  test("normalizes the member id", () => {
    const contribution = unwrap(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        memberId: "  member-1  ",
      }),
    );

    expect(contribution.memberId).toBe("member-1");
  });

  test("rejects invalid contribution input", () => {
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        memberId: " ",
      }),
      "INVALID_MEMBER",
    );
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        contributionYear: 0,
      }),
      "INVALID_YEAR",
    );
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        annualAmount: -1,
      }),
      "INVALID_AMOUNT",
    );
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        annualAmount: 1.5,
      }),
      "INVALID_AMOUNT",
    );
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        recordedAt: -1,
      }),
      "INVALID_TIME",
    );
    expectError(
      Contribution.record({
        id: "contribution-1",
        ...contributionBase,
        split: { memberCapitalBps: 7_000, capitalParticipationBps: 2_000 },
      }),
      "INVALID_SPLIT",
    );
  });

  test("rehydrate rejects stored amounts that do not match the split", () => {
    const recorded = unwrap(
      Contribution.record({ id: "contribution-1", ...contributionBase }),
    );

    const rehydrated = Contribution.rehydrate({
      ...recorded,
      memberCapital: recorded.memberCapital + 1n,
    });

    expectError(rehydrated, "INVALID_SNAPSHOT");
  });
});

describe("RecordAnnualContribution", () => {
  test("records the configured year parameters", async () => {
    const { contributions, record } = await configured();
    const contribution = unwrap(await record.execute(recordBase));

    expect(String(contribution.id)).toBe("contribution-1");
    expect(Number(contribution.annualAmount)).toBe(1_000_000);
    expect(Number(contribution.memberCapitalBps)).toBe(7_000);
    expect(contribution.memberCapital).toBe(700_000n);
    expect(contribution.capitalParticipation).toBe(300_000n);
    expect(
      await contributions.findByMemberAndYear("member-1", 2026),
    ).toBe(contribution);
  });

  test("rejects a year that is not configured", async () => {
    const { record } = setup();
    expectError(await record.execute(recordBase), "YEAR_NOT_CONFIGURED");
  });

  test("rejects an invalid year before lookup", async () => {
    const { record } = setup();
    expectError(
      await record.execute({ ...recordBase, contributionYear: 0 }),
      "INVALID_YEAR",
    );
  });

  test("rejects a second contribution for the same member and year", async () => {
    const { record } = await configured();
    unwrap(await record.execute(recordBase));

    expectError(await record.execute(recordBase), "ALREADY_RECORDED");
  });

  test("maps a duplicate save to ALREADY_RECORDED", async () => {
    const years = await configuredYears();
    const record = new RecordAnnualContribution(
      {
        findByMemberAndYear: async () => null,
        save: async () => {
          throw new DuplicateContributionError();
        },
      },
      years,
      allowAll,
      new SequentialIdGenerator("contribution"),
    );

    expectError(await record.execute(recordBase), "ALREADY_RECORDED");
  });

  test("maps a missing member save to MEMBER_NOT_FOUND", async () => {
    const years = await configuredYears();
    const record = new RecordAnnualContribution(
      {
        findByMemberAndYear: async () => null,
        save: async () => {
          throw new UnknownContributionMemberError();
        },
      },
      years,
      allowAll,
      new SequentialIdGenerator("contribution"),
    );

    expectError(await record.execute(recordBase), "MEMBER_NOT_FOUND");
  });

  test("returns UNEXPECTED when the repository fails", async () => {
    const years = await configuredYears();
    const contributions: ContributionRepository = {
      findByMemberAndYear: async () => null,
      save: async () => {
        throw new Error("commit failed");
      },
    };
    const record = new RecordAnnualContribution(
      contributions,
      years,
      allowAll,
      new SequentialIdGenerator("contribution"),
    );

    expectError(await record.execute(recordBase), "UNEXPECTED");
  });

  test("rejects an ineligible member", async () => {
    for (const [failure, code] of [
      ["MEMBER_NOT_FOUND", "MEMBER_NOT_FOUND"],
      ["MEMBER_INACTIVE", "MEMBER_INACTIVE"],
      ["KYC_NOT_VERIFIED", "KYC_NOT_VERIFIED"],
      ["KYC_EXPIRED", "KYC_EXPIRED"],
      ["KYC_REVOKED", "KYC_REVOKED"],
    ] as const) {
      const years = await configuredYears();
      const record = new RecordAnnualContribution(
        {
          findByMemberAndYear: async () => null,
          save: async () => {},
        },
        years,
        { check: async () => failure },
        new SequentialIdGenerator("contribution"),
      );

      expectError(await record.execute(recordBase), code);
    }
  });
});

async function configuredYears() {
  const years = new InMemoryContributionYearRepository();
  unwrap(await new ConfigureContributionYear(years).execute(yearCommand));
  return years;
}
