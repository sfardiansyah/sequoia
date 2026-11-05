import { describe, expect, test } from "bun:test";
import type { Result } from "@sequoia/shared";
import { InMemoryAuditLog } from "../../shared/audit/adapters/in-memory";
import { createInMemoryUnitOfWork } from "../../shared/persistence/adapters/in-memory";
import { SequentialIdGenerator } from "../../shared/id-generator";
import { InMemoryMemberRepository } from "../membership/adapters/in-memory";
import { Member, type MemberRepository } from "../membership/domain/member";
import { OwnerPkh } from "../membership/domain/owner-pkh";
import {
  InMemoryBankAttestationRepository,
  InMemoryContributionRepository,
  InMemoryContributionYearRepository,
} from "./adapters/in-memory";
import { ConfigureContributionYear } from "./application/configure-contribution-year";
import { CreateBankAttestation } from "./application/create-bank-attestation";
import { RecordAnnualContribution } from "./application/record-annual-contribution";
import {
  BankAttestation,
  DuplicateBankReferenceError,
} from "./domain/bank-attestation";
import {
  Contribution,
  DuplicateBankAttestationError,
  DuplicateContributionError,
  UnknownContributionMemberError,
  type ContributionRepository,
} from "./domain/contribution";
import {
  ContributionYear,
  type ContributionYearRepository,
} from "./domain/contribution-year";
import type { BankAttestationRepository } from "./domain/bank-attestation";
import type { ContributionEligibility } from "./domain/ports/contribution-eligibility";

const contributionBase = {
  memberId: "member-1",
  contributionYear: 2026,
  bankAttestationId: "attestation-1",
  source: "PILOT" as const,
  chainTx: null,
  annualAmount: 1_000_000,
  split: { memberCapitalBps: 7_000, capitalParticipationBps: 3_000 },
  recordedAt: 1_700_000_000_000,
};

const recordBase = {
  memberId: "member-1",
  contributionYear: 2026,
  bankAttestationId: "attestation-1",
  recordedAt: 1_700_000_000_000,
  actor: "ray",
};

const yearCommand = {
  year: 2026,
  annualAmount: 1_000_000,
  memberCapitalBps: 7_000,
  capitalParticipationBps: 3_000,
  standardCapitalParticipationMaxBps: 5_000,
  approvalRef: "BOARD-2026-001",
  createdAt: 1_700_000_000_000,
  actor: "ray",
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

function attestationFixture(overrides: Partial<{
  id: string;
  memberId: string;
  contributionYear: number;
  amount: number;
  bankReference: string;
}> = {}) {
  return unwrap(
    BankAttestation.create({
      id: overrides.id ?? "attestation-1",
      memberId: overrides.memberId ?? "member-1",
      contributionYear: overrides.contributionYear ?? 2026,
      amount: overrides.amount ?? 1_000_000,
      bankReference:
        overrides.bankReference ??
        `BANK-REF-${overrides.id ?? "attestation-1"}`,
      actor: "ray",
      createdAt: 1_700_000_000_000,
    }),
  );
}

function setup() {
  const years = new InMemoryContributionYearRepository();
  const contributions = new InMemoryContributionRepository();
  const attestations = new InMemoryBankAttestationRepository();
  const audit = new InMemoryAuditLog();
  const unitOfWork = createInMemoryUnitOfWork(() => ({
    years,
    attestations,
    contributions,
    audit,
  }));
  return {
    years,
    contributions,
    attestations,
    audit,
    configureYear: new ConfigureContributionYear(unitOfWork),
    record: new RecordAnnualContribution(
      contributions,
      years,
      attestations,
      allowAll,
      new SequentialIdGenerator("contribution"),
      unitOfWork,
    ),
  };
}

async function configured() {
  const container = setup();
  unwrap(await container.configureYear.execute(yearCommand));
  await container.attestations.save(attestationFixture());
  return container;
}

describe("ContributionYear", () => {
  test("configures the annual amount, approval reference and cap", () => {
    const year = unwrap(ContributionYear.configure(yearCommand));

    expect(year.year).toBe(2026);
    expect(year.approvalRef).toBe("BOARD-2026-001");
    expect(Number(year.annualAmount)).toBe(1_000_000);
    expect(Number(year.memberCapitalBps)).toBe(7_000);
    expect(Number(year.capitalParticipationBps)).toBe(3_000);
    expect(Number(year.standardCapitalParticipationMaxBps)).toBe(5_000);
    expect(year.split).toEqual({
      memberCapitalBps: 7_000,
      capitalParticipationBps: 3_000,
    });
  });

  test("trims the approval reference", () => {
    const year = unwrap(
      ContributionYear.configure({
        ...yearCommand,
        approvalRef: "  BOARD-2026-001  ",
      }),
    );

    expect(year.approvalRef).toBe("BOARD-2026-001");
  });

  test("rejects a blank approval reference", () => {
    for (const approvalRef of ["", "   "]) {
      expectError(
        ContributionYear.configure({ ...yearCommand, approvalRef }),
        "INVALID_APPROVAL_REF",
      );
    }
  });

  test("rejects a cap above the governance ceiling", () => {
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        standardCapitalParticipationMaxBps: 5_001,
      }),
      "INVALID_CAP",
    );
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        memberCapitalBps: 4_000,
        capitalParticipationBps: 6_000,
        standardCapitalParticipationMaxBps: 6_000,
      }),
      "INVALID_CAP",
    );
  });

  test("rejects any split other than the standard 7000/3000", () => {
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        memberCapitalBps: 5_000,
        capitalParticipationBps: 5_000,
        standardCapitalParticipationMaxBps: 5_000,
      }),
      "INVALID_SPLIT",
    );
    expectError(
      ContributionYear.configure({
        ...yearCommand,
        memberCapitalBps: 8_000,
        capitalParticipationBps: 2_000,
      }),
      "INVALID_SPLIT",
    );
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
  test("saves the year parameters and writes the audit event", async () => {
    const { years, audit, configureYear } = setup();
    const year = unwrap(await configureYear.execute(yearCommand));

    expect(await years.findByYear(2026)).toBe(year);
    expect(year.approvalRef).toBe("BOARD-2026-001");

    const events = await audit.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: "ray",
      action: "CONTRIBUTION_YEAR_CONFIGURED",
      entityType: "CONTRIBUTION_YEAR",
      entityId: "2026",
      detail: "BOARD-2026-001",
      occurredAt: 1_700_000_000_000,
    });
  });

  test("rejects an invalid operator before writing anything", async () => {
    const { years, audit, configureYear } = setup();

    expectError(
      await configureYear.execute({ ...yearCommand, actor: "Ray Nord" }),
      "INVALID_ACTOR",
    );
    expect(await years.findByYear(2026)).toBeNull();
    expect(await audit.list()).toEqual([]);
  });

  test("rejects a missing approval reference before writing anything", async () => {
    const { years, audit, configureYear } = setup();

    expectError(
      await configureYear.execute({ ...yearCommand, approvalRef: "   " }),
      "INVALID_APPROVAL_REF",
    );
    expect(await years.findByYear(2026)).toBeNull();
    expect(await audit.list()).toEqual([]);
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

function contributionRepo(
  overrides: Partial<ContributionRepository> = {},
): ContributionRepository {
  return {
    findByMemberAndYear: async () => null,
    findByBankAttestationId: async () => null,
    save: async () => {},
    ...overrides,
  };
}

function recordWith(input: {
  contributions?: ContributionRepository;
  years?: ContributionYearRepository;
  attestations?: BankAttestationRepository;
  eligibility?: ContributionEligibility;
} = {}) {
  const contributions = input.contributions ?? new InMemoryContributionRepository();
  const years = input.years ?? new InMemoryContributionYearRepository();
  const attestations =
    input.attestations ?? new InMemoryBankAttestationRepository();
  const audit = new InMemoryAuditLog();
  const unitOfWork = createInMemoryUnitOfWork(() => ({
    years,
    attestations,
    contributions,
    audit,
  }));

  return {
    audit,
    record: new RecordAnnualContribution(
      contributions,
      years,
      attestations,
      input.eligibility ?? allowAll,
      new SequentialIdGenerator("contribution"),
      unitOfWork,
    ),
  };
}

async function configuredYears() {
  const years = new InMemoryContributionYearRepository();
  const attestations = new InMemoryBankAttestationRepository();
  const contributions = new InMemoryContributionRepository();
  const audit = new InMemoryAuditLog();
  const unitOfWork = createInMemoryUnitOfWork(() => ({
    years,
    attestations,
    contributions,
    audit,
  }));
  unwrap(await new ConfigureContributionYear(unitOfWork).execute(yearCommand));
  await attestations.save(attestationFixture());
  return { years, attestations, contributions, audit, unitOfWork };
}

describe("RecordAnnualContribution", () => {
  test("records the attestation, split, source, and audit row", async () => {
    const { contributions, audit, record } = await configured();
    const contribution = unwrap(await record.execute(recordBase));

    expect(String(contribution.id)).toBe("contribution-1");
    expect(Number(contribution.annualAmount)).toBe(1_000_000);
    expect(Number(contribution.memberCapitalBps)).toBe(7_000);
    expect(contribution.memberCapital).toBe(700_000n);
    expect(contribution.capitalParticipation).toBe(300_000n);
    expect(contribution.bankAttestationId).toBe("attestation-1");
    expect(contribution.source).toBe("PILOT");
    expect(contribution.chainTx).toBeNull();
    expect(
      await contributions.findByMemberAndYear("member-1", 2026),
    ).toBe(contribution);
    expect(
      await contributions.findByBankAttestationId("attestation-1"),
    ).toBe(contribution);

    const events = await audit.list({ entityType: "CONTRIBUTION" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: "ray",
      action: "CONTRIBUTION_RECORDED",
      entityType: "CONTRIBUTION",
      entityId: "contribution-1",
      detail: null,
    });
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

  test("rejects a missing bank attestation id", async () => {
    const { record } = setup();
    expectError(
      await record.execute({ ...recordBase, bankAttestationId: "  " }),
      "INVALID_ATTESTATION",
    );
  });

  test("rejects an unknown bank attestation", async () => {
    const container = setup();
    unwrap(await container.configureYear.execute(yearCommand));

    expectError(
      await container.record.execute(recordBase),
      "ATTESTATION_NOT_FOUND",
    );
  });

  test("rejects an attestation for another member", async () => {
    const container = await configured();
    await container.attestations.save(
      attestationFixture({ id: "attestation-2", memberId: "member-2" }),
    );

    expectError(
      await container.record.execute({
        ...recordBase,
        bankAttestationId: "attestation-2",
      }),
      "ATTESTATION_MISMATCH",
    );
  });

  test("rejects an attestation for another year", async () => {
    const container = await configured();
    await container.attestations.save(
      attestationFixture({ id: "attestation-2", contributionYear: 2025 }),
    );

    expectError(
      await container.record.execute({
        ...recordBase,
        bankAttestationId: "attestation-2",
      }),
      "ATTESTATION_MISMATCH",
    );
  });

  test("rejects an attestation for another amount", async () => {
    const container = await configured();
    await container.attestations.save(
      attestationFixture({ id: "attestation-2", amount: 900_000 }),
    );

    expectError(
      await container.record.execute({
        ...recordBase,
        bankAttestationId: "attestation-2",
      }),
      "ATTESTATION_MISMATCH",
    );
  });

  test("rejects an attestation already used by another contribution", async () => {
    const container = await configured();
    await container.contributions.save(
      unwrap(
        Contribution.record({
          ...contributionBase,
          id: "contribution-seed",
          contributionYear: 2027,
        }),
      ),
    );

    expectError(
      await container.record.execute(recordBase),
      "ATTESTATION_ALREADY_USED",
    );
  });

  test("rejects a second contribution for the same member and year", async () => {
    const { record } = await configured();
    unwrap(await record.execute(recordBase));

    expectError(await record.execute(recordBase), "ALREADY_RECORDED");
  });

  test("rejects an invalid operator before writing anything", async () => {
    const { contributions, audit, record } = await configured();

    expectError(
      await record.execute({ ...recordBase, actor: "Ray Nord" }),
      "INVALID_ACTOR",
    );
    expect(await contributions.findByMemberAndYear("member-1", 2026)).toBeNull();
    expect(await audit.list({ entityType: "CONTRIBUTION" })).toEqual([]);
  });

  test("maps a duplicate save to ALREADY_RECORDED", async () => {
    const base = await configuredYears();
    const { record } = recordWith({
      contributions: contributionRepo({
        save: async () => {
          throw new DuplicateContributionError();
        },
      }),
      years: base.years,
      attestations: base.attestations,
    });

    expectError(await record.execute(recordBase), "ALREADY_RECORDED");
  });

  test("maps a duplicate attestation save to ATTESTATION_ALREADY_USED", async () => {
    const base = await configuredYears();
    const { record } = recordWith({
      contributions: contributionRepo({
        save: async () => {
          throw new DuplicateBankAttestationError();
        },
      }),
      years: base.years,
      attestations: base.attestations,
    });

    expectError(await record.execute(recordBase), "ATTESTATION_ALREADY_USED");
  });

  test("maps a missing member save to MEMBER_NOT_FOUND", async () => {
    const base = await configuredYears();
    const { record } = recordWith({
      contributions: contributionRepo({
        save: async () => {
          throw new UnknownContributionMemberError();
        },
      }),
      years: base.years,
      attestations: base.attestations,
    });

    expectError(await record.execute(recordBase), "MEMBER_NOT_FOUND");
  });

  test("returns UNEXPECTED when the repository fails", async () => {
    const base = await configuredYears();
    const { record } = recordWith({
      contributions: contributionRepo({
        save: async () => {
          throw new Error("commit failed");
        },
      }),
      years: base.years,
      attestations: base.attestations,
    });

    expectError(await record.execute(recordBase), "UNEXPECTED");
  });

  test("rejects an ineligible member", async () => {
    for (const [failure, code] of [
      ["MEMBER_NOT_FOUND", "MEMBER_NOT_FOUND"],
      ["MEMBER_INACTIVE", "MEMBER_INACTIVE"],
      ["MEMBER_NOT_APPROVED", "MEMBER_NOT_APPROVED"],
      ["KYC_NOT_VERIFIED", "KYC_NOT_VERIFIED"],
      ["KYC_EXPIRED", "KYC_EXPIRED"],
      ["KYC_REVOKED", "KYC_REVOKED"],
    ] as const) {
      const base = await configuredYears();
      const { record } = recordWith({
        years: base.years,
        attestations: base.attestations,
        eligibility: { check: async () => failure },
      });

      expectError(await record.execute(recordBase), code);
    }
  });
});

const bankAttestationBase = {
  id: "attestation-1",
  memberId: "member-1",
  contributionYear: 2026,
  amount: 1_000_000,
  bankReference: "BANK-REF-001",
  actor: "ray",
  createdAt: 1_700_000_000_000,
};

const bankCommand = {
  memberId: "member-1",
  contributionYear: 2026,
  amount: 1_000_000,
  bankReference: "BANK-REF-001",
  createdAt: 1_700_000_000_000,
  actor: "ray",
};

function bankMember() {
  return unwrap(
    Member.admit({
      id: "member-1",
      ownerPkh: OwnerPkh.parse("1".repeat(56))!,
      kycAttestationId: "kyc-1",
      boardApprovalRef: "BOARD-2026-004",
      approvedAt: 1_700_000_000_000,
      memberClass: "STANDARD",
      joinedAt: 1_700_000_000_000,
    }),
  );
}

function memberById(member: Member): MemberRepository {
  return {
    findById: async (id) => (id === member.id ? member : null),
    findByOwnerPkh: async () => null,
    save: async () => {},
  };
}

function bankSetup() {
  const years = new InMemoryContributionYearRepository();
  const attestations = new InMemoryBankAttestationRepository();
  const members = new InMemoryMemberRepository();
  const audit = new InMemoryAuditLog();
  const contributions = new InMemoryContributionRepository();
  const unitOfWork = createInMemoryUnitOfWork(() => ({
    years,
    attestations,
    contributions,
    audit,
  }));

  return {
    years,
    attestations,
    members,
    audit,
    configureYear: new ConfigureContributionYear(unitOfWork),
    createAttestation: new CreateBankAttestation(
      members,
      new SequentialIdGenerator("attestation"),
      unitOfWork,
    ),
  };
}

async function bankConfigured() {
  const container = bankSetup();
  await container.members.save(bankMember());
  unwrap(await container.configureYear.execute(yearCommand));
  return container;
}

describe("BankAttestation", () => {
  test("records the bank evidence and trims the reference", () => {
    const attestation = unwrap(
      BankAttestation.create({
        ...bankAttestationBase,
        memberId: "  member-1  ",
        bankReference: "  BANK-REF-001  ",
      }),
    );

    expect(attestation.memberId).toBe("member-1");
    expect(attestation.contributionYear).toBe(2026);
    expect(Number(attestation.amount)).toBe(1_000_000);
    expect(attestation.bankReference).toBe("BANK-REF-001");
    expect(attestation.actor).toBe("ray");
    expect(attestation.createdAt).toBe(1_700_000_000_000);
  });

  test("rejects invalid bank attestation input", () => {
    expectError(
      BankAttestation.create({ ...bankAttestationBase, memberId: "   " }),
      "INVALID_MEMBER",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, contributionYear: 0 }),
      "INVALID_YEAR",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, amount: 0 }),
      "INVALID_AMOUNT",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, amount: -1 }),
      "INVALID_AMOUNT",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, amount: 1.5 }),
      "INVALID_AMOUNT",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, bankReference: "   " }),
      "INVALID_BANK_REFERENCE",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, actor: "Ray" }),
      "INVALID_ACTOR",
    );
    expectError(
      BankAttestation.create({ ...bankAttestationBase, createdAt: -1 }),
      "INVALID_TIME",
    );
  });

  test("rehydrate revalidates the stored row", () => {
    expect(
      unwrap(BankAttestation.rehydrate(bankAttestationBase)).bankReference,
    ).toBe("BANK-REF-001");
    expectError(
      BankAttestation.rehydrate({ ...bankAttestationBase, actor: "Ray" }),
      "INVALID_ACTOR",
    );
  });
});

describe("CreateBankAttestation", () => {
  test("saves the attestation and writes the audit event", async () => {
    const { attestations, audit, createAttestation } = await bankConfigured();
    const attestation = unwrap(await createAttestation.execute(bankCommand));

    expect(String(attestation.id)).toBe("attestation-1");
    expect(Number(attestation.amount)).toBe(1_000_000);
    expect(await attestations.findById("attestation-1")).toBe(attestation);

    const events = await audit.list({ entityType: "BANK_ATTESTATION" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: "ray",
      action: "BANK_ATTESTATION_CREATED",
      entityType: "BANK_ATTESTATION",
      entityId: "attestation-1",
      detail: null,
      occurredAt: 1_700_000_000_000,
    });
    expect(JSON.stringify(events[0])).not.toContain("BANK-REF-001");
  });

  test("rejects an invalid operator before writing anything", async () => {
    const { attestations, audit, createAttestation } = await bankConfigured();

    expectError(
      await createAttestation.execute({ ...bankCommand, actor: "Ray Nord" }),
      "INVALID_ACTOR",
    );
    expect(await attestations.findById("attestation-1")).toBeNull();
    expect(await audit.list({ entityType: "BANK_ATTESTATION" })).toEqual([]);
  });

  test("rejects a year that is not configured", async () => {
    const container = bankSetup();
    await container.members.save(bankMember());

    expectError(
      await container.createAttestation.execute(bankCommand),
      "YEAR_NOT_CONFIGURED",
    );
    expect(await container.attestations.findById("attestation-1")).toBeNull();
    expect(
      await container.audit.list({ entityType: "BANK_ATTESTATION" }),
    ).toEqual([]);
  });

  test("rejects an unknown member", async () => {
    const container = bankSetup();
    unwrap(await container.configureYear.execute(yearCommand));

    expectError(
      await container.createAttestation.execute(bankCommand),
      "MEMBER_NOT_FOUND",
    );
    expect(await container.attestations.findById("attestation-1")).toBeNull();
    expect(
      await container.audit.list({ entityType: "BANK_ATTESTATION" }),
    ).toEqual([]);
  });

  test("rejects an amount that differs from the configured annual amount", async () => {
    const { attestations, audit, createAttestation } = await bankConfigured();

    expectError(
      await createAttestation.execute({ ...bankCommand, amount: 900_000 }),
      "AMOUNT_MISMATCH",
    );
    expect(await attestations.findById("attestation-1")).toBeNull();
    expect(await audit.list({ entityType: "BANK_ATTESTATION" })).toEqual([]);
  });

  test("rejects a duplicate bank reference", async () => {
    const { audit, createAttestation } = await bankConfigured();
    unwrap(await createAttestation.execute(bankCommand));

    expectError(
      await createAttestation.execute(bankCommand),
      "BANK_REFERENCE_ALREADY_USED",
    );
    expect(await audit.list({ entityType: "BANK_ATTESTATION" })).toHaveLength(1);
  });

  test("trims the member id and bank reference", async () => {
    const { attestations, createAttestation } = await bankConfigured();

    const attestation = unwrap(
      await createAttestation.execute({
        ...bankCommand,
        memberId: "  member-1  ",
        bankReference: "  BANK-REF-001  ",
      }),
    );

    expect(attestation.memberId).toBe("member-1");
    expect(attestation.bankReference).toBe("BANK-REF-001");
    expect(await attestations.findById("attestation-1")).toBe(attestation);
  });

  test("maps a duplicate save to BANK_REFERENCE_ALREADY_USED", async () => {
    const { years } = await bankConfigured();
    const duplicate = new CreateBankAttestation(
      memberById(bankMember()),
      new SequentialIdGenerator("attestation"),
      createInMemoryUnitOfWork(() => ({
        years,
        attestations: {
          findById: async () => null,
          save: async () => {
            throw new DuplicateBankReferenceError();
          },
        },
        contributions: new InMemoryContributionRepository(),
        audit: new InMemoryAuditLog(),
      })),
    );

    expectError(
      await duplicate.execute(bankCommand),
      "BANK_REFERENCE_ALREADY_USED",
    );
  });

  test("returns UNEXPECTED when the repository fails", async () => {
    const { years } = await bankConfigured();
    const failing = new CreateBankAttestation(
      memberById(bankMember()),
      new SequentialIdGenerator("attestation"),
      createInMemoryUnitOfWork(() => ({
        years,
        attestations: {
          findById: async () => null,
          save: async () => {
            throw new Error("commit failed");
          },
        },
        contributions: new InMemoryContributionRepository(),
        audit: new InMemoryAuditLog(),
      })),
    );

    expectError(await failing.execute(bankCommand), "UNEXPECTED");
  });
});
