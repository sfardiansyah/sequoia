import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Result } from "@sequoia/shared";
import { DrizzleAuditLog } from "../../shared/audit/adapters/postgres/audit-log";
import type { AuditEvent, NewAuditEvent } from "../../shared/audit/audit-event";
import type { AuditFilter, AuditLog } from "../../shared/audit/port";
import { SequentialIdGenerator } from "../../shared/id-generator";
import { createDrizzleUnitOfWork } from "../../shared/persistence/adapters/postgres/unit-of-work";
import { execMigrations } from "../../infrastructure/database/testing";
import { Member, type MemberRepository } from "../membership/domain/member";
import { OwnerPkh } from "../membership/domain/owner-pkh";
import { DrizzleBankAttestationRepository } from "./adapters/postgres/bank-attestation-repository";
import { DrizzleContributionRepository } from "./adapters/postgres/contribution-repository";
import { DrizzleContributionYearRepository } from "./adapters/postgres/contribution-year-repository";
import * as schema from "./adapters/postgres/schema";
import { ConfigureContributionYear } from "./application/configure-contribution-year";
import { CreateBankAttestation } from "./application/create-bank-attestation";
import { RecordAnnualContribution } from "./application/record-annual-contribution";
import type {
  BankAttestation,
  BankAttestationError,
} from "./domain/bank-attestation";
import type {
  Contribution,
  ContributionError,
} from "./domain/contribution";
import type {
  ContributionYear,
  ContributionYearError,
} from "./domain/contribution-year";

const yearCommand = {
  year: 2026,
  approvalRef: "BOARD-2026-001",
  annualAmount: 1_000_000,
  memberCapitalBps: 7_000,
  capitalParticipationBps: 3_000,
  standardCapitalParticipationMaxBps: 5_000,
  createdAt: 1_700_000_000_000,
  actor: "ray",
};

/**
 * Wraps the real audit adapter so a test can make one write fail mid-transaction.
 * The failure is a real rejected INSERT (the `entity_id` CHECK), not an
 * exception thrown before the driver sees it.
 */
class SwitchableAuditLog implements AuditLog {
  constructor(
    private readonly inner: AuditLog,
    private readonly state: { failing: boolean },
  ) {}

  async record(event: NewAuditEvent): Promise<void> {
    if (this.state.failing) {
      await this.inner.record({ ...event, entityId: "" });
      return;
    }
    await this.inner.record(event);
  }

  list(filter?: AuditFilter): Promise<AuditEvent[]> {
    return this.inner.list(filter);
  }
}

/**
 * Lets a test make the year write fail while the audit log stays healthy.
 */
class SwitchableContributionYearRepository extends DrizzleContributionYearRepository {
  constructor(
    db: ConstructorParameters<typeof DrizzleContributionYearRepository>[0],
    private readonly state: { failing: boolean },
  ) {
    super(db);
  }

  override async save(year: ContributionYear): Promise<void> {
    if (this.state.failing) throw new Error("year write failed");
    await super.save(year);
  }
}

async function setup() {
  const client = new PGlite();
  await execMigrations(client);
  const db = drizzle(client, { schema });

  const auditState = { failing: false };
  const writeState = { failing: false };
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    years: new SwitchableContributionYearRepository(tx, writeState),
    attestations: new DrizzleBankAttestationRepository(tx),
    contributions: new DrizzleContributionRepository(tx),
    audit: new SwitchableAuditLog(new DrizzleAuditLog(tx), auditState),
  }));

  return {
    configure: new ConfigureContributionYear(unitOfWork),
    years: new DrizzleContributionYearRepository(db),
    audit: new DrizzleAuditLog(db),
    auditState,
    writeState,
    close: () => client.close(),
  };
}

function unwrap(
  result: Result<ContributionYear, ContributionYearError>,
): ContributionYear {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("contribution-year writes and the audit trail", () => {
  test("commits the year and its audit row together", async () => {
    const { configure, years, audit, close } = await setup();
    try {
      const year = unwrap(await configure.execute(yearCommand));

      const found = await years.findByYear(year.year);
      expect(found?.approvalRef).toBe("BOARD-2026-001");

      const events = await audit.list();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor: "ray",
        action: "CONTRIBUTION_YEAR_CONFIGURED",
        entityType: "CONTRIBUTION_YEAR",
        entityId: "2026",
        detail: "BOARD-2026-001",
        occurredAt: yearCommand.createdAt,
      });
    } finally {
      await close();
    }
  });

  test("leaves no year behind when the audit write fails", async () => {
    const { configure, years, audit, auditState, close } = await setup();
    try {
      auditState.failing = true;
      const result = await configure.execute(yearCommand);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNEXPECTED");
      expect(await years.findByYear(yearCommand.year)).toBeNull();
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("leaves no audit row behind when the year write fails", async () => {
    const { configure, years, audit, writeState, close } = await setup();
    try {
      writeState.failing = true;
      const result = await configure.execute(yearCommand);

      expect(result.ok).toBe(false);
      expect(await years.findByYear(yearCommand.year)).toBeNull();
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("keeps the existing year when a second configuration is rejected", async () => {
    const { configure, years, audit, close } = await setup();
    try {
      const year = unwrap(await configure.execute(yearCommand));
      const result = await configure.execute({
        ...yearCommand,
        annualAmount: 2_000_000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("YEAR_ALREADY_CONFIGURED");
      expect((await years.findByYear(year.year))?.annualAmount).toBe(
        year.annualAmount,
      );
      expect(await audit.list()).toHaveLength(1);
    } finally {
      await close();
    }
  });
});

const bankCommand = {
  memberId: "member-1",
  contributionYear: 2026,
  amount: 1_000_000,
  bankReference: "BANK-REF-001",
  createdAt: 1_700_000_000_100,
  actor: "ray",
};

class SwitchableBankAttestationRepository extends DrizzleBankAttestationRepository {
  constructor(
    db: ConstructorParameters<typeof DrizzleBankAttestationRepository>[0],
    private readonly state: { failing: boolean },
  ) {
    super(db);
  }

  override async save(attestation: BankAttestation): Promise<void> {
    if (this.state.failing) throw new Error("attestation write failed");
    await super.save(attestation);
  }
}

function bankMember(): Member {
  const admitted = Member.admit({
    id: "member-1",
    ownerPkh: OwnerPkh.parse("1".repeat(56))!,
    kycAttestationId: "kyc-1",
    boardApprovalRef: "BOARD-2026-004",
    approvedAt: 1_700_000_000_000,
    memberClass: "STANDARD",
    joinedAt: 1_700_000_000_000,
  });
  if (!admitted.ok) throw new Error(admitted.error.code);
  return admitted.value;
}

function membersWithMember(): MemberRepository {
  const member = bankMember();
  return {
    findById: async (id) => (id === member.id ? member : null),
    findByOwnerPkh: async () => null,
    save: async () => {},
  };
}

async function bankSetup() {
  const client = new PGlite();
  await execMigrations(client);
  await client.exec(`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      'kyc-1', '${"1".repeat(56)}', 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    );
    INSERT INTO members
      (id, owner_pkh, kyc_attestation_id, board_approval_ref, approved_at,
       member_class, status, joined_at)
    VALUES (
      'member-1', '${"1".repeat(56)}', 'kyc-1',
      'board-2026-04', 1700000000000,
      'STANDARD', 'ACTIVE', 1700000000000
    );
    INSERT INTO contribution_years
      (year, approval_ref, annual_amount, member_capital_bps,
       capital_participation_bps, standard_capital_participation_max_bps,
       created_at)
    VALUES (2026, 'BOARD-2026-001', 1000000, 7000, 3000, 5000, 1700000000000);
  `);

  const db = drizzle(client, { schema });
  const auditState = { failing: false };
  const writeState = { failing: false };
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    years: new DrizzleContributionYearRepository(tx),
    attestations: new SwitchableBankAttestationRepository(tx, writeState),
    contributions: new DrizzleContributionRepository(tx),
    audit: new SwitchableAuditLog(new DrizzleAuditLog(tx), auditState),
  }));

  return {
    createAttestation: new CreateBankAttestation(
      membersWithMember(),
      new SequentialIdGenerator("attestation"),
      unitOfWork,
    ),
    attestations: new DrizzleBankAttestationRepository(db),
    audit: new DrizzleAuditLog(db),
    auditState,
    writeState,
    close: () => client.close(),
  };
}

function unwrapBank(
  result: Result<BankAttestation, BankAttestationError>,
): BankAttestation {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("bank attestation writes and the audit trail", () => {
  test("commits the attestation and its audit row together", async () => {
    const { createAttestation, attestations, audit, close } = await bankSetup();
    try {
      const attestation = unwrapBank(
        await createAttestation.execute(bankCommand),
      );

      expect(
        (await attestations.findById(attestation.id))?.bankReference,
      ).toBe("BANK-REF-001");

      const events = await audit.list({ entityType: "BANK_ATTESTATION" });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor: "ray",
        action: "BANK_ATTESTATION_CREATED",
        entityType: "BANK_ATTESTATION",
        entityId: attestation.id,
        detail: null,
        occurredAt: bankCommand.createdAt,
      });
    } finally {
      await close();
    }
  });

  test("leaves no attestation behind when the audit write fails", async () => {
    const { createAttestation, attestations, audit, auditState, close } =
      await bankSetup();
    try {
      auditState.failing = true;
      const result = await createAttestation.execute(bankCommand);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNEXPECTED");
      expect(await attestations.findById("attestation-1")).toBeNull();
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("leaves no audit row behind when the attestation write fails", async () => {
    const { createAttestation, attestations, audit, writeState, close } =
      await bankSetup();
    try {
      writeState.failing = true;
      const result = await createAttestation.execute(bankCommand);

      expect(result.ok).toBe(false);
      expect(await attestations.findById("attestation-1")).toBeNull();
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });
});

class SwitchableContributionRepository extends DrizzleContributionRepository {
  constructor(
    db: ConstructorParameters<typeof DrizzleContributionRepository>[0],
    private readonly state: { failing: boolean },
  ) {
    super(db);
  }

  override async save(contribution: Contribution): Promise<void> {
    if (this.state.failing) throw new Error("contribution write failed");
    await super.save(contribution);
  }
}

const contributionCommand = {
  memberId: "member-1",
  contributionYear: 2026,
  bankAttestationId: "attestation-1",
  recordedAt: 1_700_000_000_000,
  actor: "ray",
};

async function contributionSetup() {
  const client = new PGlite();
  await execMigrations(client);
  await client.exec(`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      'kyc-1', '${"1".repeat(56)}', 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    );
    INSERT INTO members
      (id, owner_pkh, kyc_attestation_id, board_approval_ref, approved_at,
       member_class, status, joined_at)
    VALUES (
      'member-1', '${"1".repeat(56)}', 'kyc-1',
      'board-2026-04', 1700000000000,
      'STANDARD', 'ACTIVE', 1700000000000
    );
    INSERT INTO contribution_years
      (year, approval_ref, annual_amount, member_capital_bps,
       capital_participation_bps, standard_capital_participation_max_bps,
       created_at)
    VALUES (2026, 'BOARD-2026-001', 1000000, 7000, 3000, 5000, 1700000000000);
    INSERT INTO bank_attestations
      (id, member_id, contribution_year, amount, bank_reference, actor, created_at)
    VALUES ('attestation-1', 'member-1', 2026, 1000000, 'BANK-REF-1', 'ray',
            1700000000000);
  `);

  const db = drizzle(client, { schema });
  const auditState = { failing: false };
  const writeState = { failing: false };
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    years: new DrizzleContributionYearRepository(tx),
    attestations: new DrizzleBankAttestationRepository(tx),
    contributions: new SwitchableContributionRepository(tx, writeState),
    audit: new SwitchableAuditLog(new DrizzleAuditLog(tx), auditState),
  }));

  return {
    record: new RecordAnnualContribution(
      new DrizzleContributionRepository(db),
      new DrizzleContributionYearRepository(db),
      new DrizzleBankAttestationRepository(db),
      { check: async () => null },
      new SequentialIdGenerator("contribution"),
      unitOfWork,
    ),
    contributions: new DrizzleContributionRepository(db),
    audit: new DrizzleAuditLog(db),
    auditState,
    writeState,
    close: () => client.close(),
  };
}

function unwrapContribution(
  result: Result<Contribution, ContributionError>,
): Contribution {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("contribution writes and the audit trail", () => {
  test("commits the contribution and its audit row together", async () => {
    const { record, contributions, audit, close } = await contributionSetup();
    try {
      const contribution = unwrapContribution(
        await record.execute(contributionCommand),
      );

      expect(
        String(
          (await contributions.findByMemberAndYear("member-1", 2026))?.id,
        ),
      ).toBe(String(contribution.id));
      expect(contribution.bankAttestationId).toBe("attestation-1");
      expect(contribution.source).toBe("PILOT");

      const events = await audit.list({ entityType: "CONTRIBUTION" });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor: "ray",
        action: "CONTRIBUTION_RECORDED",
        entityType: "CONTRIBUTION",
        entityId: contribution.id,
        detail: null,
        occurredAt: contributionCommand.recordedAt,
      });
    } finally {
      await close();
    }
  });

  test("leaves no contribution behind when the audit write fails", async () => {
    const { record, contributions, audit, auditState, close } =
      await contributionSetup();
    try {
      auditState.failing = true;
      const result = await record.execute(contributionCommand);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNEXPECTED");
      expect(
        await contributions.findByMemberAndYear("member-1", 2026),
      ).toBeNull();
      expect(await audit.list({ entityType: "CONTRIBUTION" })).toEqual([]);
    } finally {
      await close();
    }
  });

  test("leaves no audit row behind when the contribution write fails", async () => {
    const { record, contributions, audit, writeState, close } =
      await contributionSetup();
    try {
      writeState.failing = true;
      const result = await record.execute(contributionCommand);

      expect(result.ok).toBe(false);
      expect(
        await contributions.findByMemberAndYear("member-1", 2026),
      ).toBeNull();
      expect(await audit.list({ entityType: "CONTRIBUTION" })).toEqual([]);
    } finally {
      await close();
    }
  });
});
