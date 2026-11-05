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
import { InMemoryKycEligibility } from "./adapters/in-memory";
import { DrizzleMemberRepository } from "./adapters/postgres/member-repository";
import * as schema from "./adapters/postgres/schema";
import { AdmitMember } from "./application/admit-member";
import type { Member, MemberRepository, MembershipError } from "./domain/member";

const subject = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const attestationId = "kyc-1";
const now = 1_700_000_000_000;

const admitCommand = {
  ownerPkh: subject,
  kycAttestationId: attestationId,
  boardApprovalRef: "board-2026-04",
  memberClass: "STANDARD" as const,
  joinedAt: now,
  now,
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

class SwitchableMemberRepository extends DrizzleMemberRepository {
  constructor(
    db: ConstructorParameters<typeof DrizzleMemberRepository>[0],
    private readonly state: { failing: boolean },
  ) {
    super(db);
  }

  override async save(member: Member): Promise<void> {
    if (this.state.failing) throw new Error("member write failed");
    await super.save(member);
  }
}

async function setup() {
  const client = new PGlite();
  await execMigrations(client);
  await client.exec(`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      '${attestationId}', '${subject}', 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    )
  `);
  const db = drizzle(client, { schema });

  const auditState = { failing: false };
  const writeState = { failing: false };
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    members: new SwitchableMemberRepository(tx, writeState),
    audit: new SwitchableAuditLog(new DrizzleAuditLog(tx), auditState),
  }));

  return {
    admit: new AdmitMember(
      new DrizzleMemberRepository(db),
      new SequentialIdGenerator("member"),
      new InMemoryKycEligibility().eligible(subject, attestationId),
      unitOfWork,
    ),
    members: new DrizzleMemberRepository(db),
    audit: new DrizzleAuditLog(db),
    auditState,
    writeState,
    close: () => client.close(),
  };
}

function unwrap(result: Result<Member, MembershipError>): Member {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("Admission and the audit trail", () => {
  test("commits the member and its audit row together", async () => {
    const { admit, members, audit, close } = await setup();
    try {
      const member = unwrap(await admit.execute(admitCommand));

      expect((await members.findById(member.id))?.boardApprovalRef).toBe(
        "board-2026-04",
      );
      expect((await audit.list({ entityId: member.id })).map((row) => ({
        action: row.action,
        detail: row.detail,
        occurredAt: row.occurredAt,
      }))).toEqual([
        {
          action: "MEMBER_ADMITTED",
          detail: "board-2026-04",
          occurredAt: now,
        },
      ]);
    } finally {
      await close();
    }
  });

  test("leaves no member behind when the audit write fails", async () => {
    const { admit, members, audit, auditState, close } = await setup();
    try {
      auditState.failing = true;
      const result = await admit.execute(admitCommand);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNEXPECTED");
      expect(await members.findById("member-1")).toBeNull();
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("leaves no audit row behind when the member write fails", async () => {
    const { admit, audit, writeState, close } = await setup();
    try {
      writeState.failing = true;
      const result = await admit.execute(admitCommand);

      expect(result.ok).toBe(false);
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });
});
