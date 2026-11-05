import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Result } from "@sequoia/shared";
import { DrizzleAuditLog } from "../../shared/audit/adapters/postgres/audit-log";
import type { AuditEvent, NewAuditEvent } from "../../shared/audit/audit-event";
import type { AuditFilter, AuditLog } from "../../shared/audit/port";
import { createDrizzleUnitOfWork } from "../../shared/persistence/adapters/postgres/unit-of-work";
import { execMigrations } from "../../infrastructure/database/testing";
import { DrizzleContributionYearRepository } from "./adapters/postgres/contribution-year-repository";
import * as schema from "./adapters/postgres/schema";
import { ConfigureContributionYear } from "./application/configure-contribution-year";
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
