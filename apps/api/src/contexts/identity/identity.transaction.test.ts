import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/pglite";
import type { Result } from "@sequoia/shared";
import { DrizzleAuditLog } from "../../shared/audit/adapters/postgres/audit-log";
import type { AuditEvent, NewAuditEvent } from "../../shared/audit/audit-event";
import type { AuditFilter, AuditLog } from "../../shared/audit/port";
import { createDrizzleUnitOfWork } from "../../shared/persistence/adapters/postgres/unit-of-work";
import { SequentialIdGenerator } from "../../shared/id-generator";
import {
  closePgliteTestDatabase,
  openPgliteTestDatabase,
} from "../../infrastructure/database/testing";
import {
  DrizzleIssuerDirectory,
  DrizzleKycAttestationRepository,
} from "./adapters/postgres/kyc-attestation-repository";
import * as schema from "./adapters/postgres/schema";
import { IssueKycAttestation } from "./application/issue-kyc-attestation";
import { RevokeKycAttestation } from "./application/revoke-kyc-attestation";
import type { IdentityError, KycAttestation } from "./domain/kyc-attestation";

const subject = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const issuedAt = 1_700_000_000_000;
const expiresAt = 1_750_000_000_000;

const issueCommand = {
  subjectPkh: subject,
  issuerId: "MANUAL",
  evidenceRef: "s3://bucket/member-1/",
  issuedAt,
  expiresAt,
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
 * Lets a test make the domain write fail while the audit log stays healthy.
 */
class SwitchableAttestationRepository extends DrizzleKycAttestationRepository {
  constructor(
    db: ConstructorParameters<typeof DrizzleKycAttestationRepository>[0],
    private readonly state: { failing: boolean },
  ) {
    super(db);
  }

  override async saveIssued(attestation: KycAttestation): Promise<void> {
    if (this.state.failing) throw new Error("attestation write failed");
    await super.saveIssued(attestation);
  }

  override async save(attestation: KycAttestation): Promise<void> {
    if (this.state.failing) throw new Error("attestation write failed");
    await super.save(attestation);
  }
}

async function setup() {
  const client = await openPgliteTestDatabase();
  const db = drizzle(client, { schema });

  const auditState = { failing: false };
  const writeState = { failing: false };
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    attestations: new SwitchableAttestationRepository(tx, writeState),
    audit: new SwitchableAuditLog(new DrizzleAuditLog(tx), auditState),
  }));

  return {
    issue: new IssueKycAttestation(
      new DrizzleIssuerDirectory(db),
      new SequentialIdGenerator("kyc"),
      unitOfWork,
    ),
    revoke: new RevokeKycAttestation(
      new DrizzleKycAttestationRepository(db),
      unitOfWork,
    ),
    attestations: new DrizzleKycAttestationRepository(db),
    audit: new DrizzleAuditLog(db),
    auditState,
    writeState,
    close: closePgliteTestDatabase,
  };
}

function unwrap(result: Result<KycAttestation, IdentityError>): KycAttestation {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("KYC writes and the audit trail", () => {
  test("commits the attestation and its audit row together", async () => {
    const { issue, attestations, audit, close } = await setup();
    try {
      const attestation = unwrap(await issue.execute(issueCommand));

      expect((await attestations.findById(attestation.id))?.status).toBe(
        "ACTIVE",
      );
      expect((await audit.list()).map((row) => row.action)).toEqual([
        "KYC_ISSUED",
      ]);
    } finally {
      await close();
    }
  });

  test("leaves no attestation behind when the audit write fails", async () => {
    const { issue, attestations, audit, auditState, close } = await setup();
    try {
      auditState.failing = true;
      const result = await issue.execute(issueCommand);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNEXPECTED");
      expect(await attestations.list()).toEqual([]);
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("leaves no audit row behind when the domain write fails", async () => {
    const { issue, attestations, audit, writeState, close } = await setup();
    try {
      writeState.failing = true;
      const result = await issue.execute(issueCommand);

      expect(result.ok).toBe(false);
      expect(await attestations.list()).toEqual([]);
      expect(await audit.list()).toEqual([]);
    } finally {
      await close();
    }
  });

  test("rolls back the supersede when a superseding issue fails to audit", async () => {
    const { issue, attestations, auditState, close } = await setup();
    try {
      const first = unwrap(await issue.execute(issueCommand));

      auditState.failing = true;
      expect((await issue.execute(issueCommand)).ok).toBe(false);

      expect((await attestations.findById(first.id))?.status).toBe("ACTIVE");
      expect(await attestations.list()).toHaveLength(1);
    } finally {
      await close();
    }
  });

  test("leaves the attestation active when a revocation audit fails", async () => {
    const { issue, revoke, attestations, auditState, close } = await setup();
    try {
      const attestation = unwrap(await issue.execute(issueCommand));

      auditState.failing = true;
      const result = await revoke.execute({
        attestationId: attestation.id,
        reasonCode: "SANCTIONS",
        revokedAt: issuedAt + 1,
        actor: "board-ops",
      });

      expect(result.ok).toBe(false);
      expect((await attestations.findById(attestation.id))?.status).toBe(
        "ACTIVE",
      );
    } finally {
      await close();
    }
  });
});
