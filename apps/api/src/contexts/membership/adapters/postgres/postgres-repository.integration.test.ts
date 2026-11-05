import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import { DrizzleAuditLog } from "../../../../shared/audit/adapters/postgres/audit-log";
import { SequentialIdGenerator } from "../../../../shared/id-generator";
import { createDrizzleUnitOfWork } from "../../../../shared/persistence/adapters/postgres/unit-of-work";
import { InMemoryKycEligibility } from "../in-memory";
import {
  CONTRACT_ATTESTATION_ID,
  CONTRACT_SUBJECT_PKH,
  describeMemberRepository,
} from "../member-repository-contract";
import { AdmitMember } from "../../application/admit-member";
import { DrizzleMemberRepository } from "./member-repository";
import { PostgresMemberProfileReader } from "./member-profile-reader";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  await client`TRUNCATE TABLE members, kyc_attestations CASCADE`;
  await client`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      ${CONTRACT_ATTESTATION_ID}, ${CONTRACT_SUBJECT_PKH}, 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    )
  `;

  const db = drizzle(client, { schema });

  return {
    client,
    db,
    repository: new DrizzleMemberRepository(db),
    profile: new PostgresMemberProfileReader(client),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeMemberRepository("DrizzleMemberRepository (Postgres)", setup);

  describe("PostgresMemberProfileReader", () => {
    test("reads the subject's newest attestation and derives expiry", async () => {
      const { client, profile, close } = await setup();

      try {
        await client`
          INSERT INTO members
            (id, owner_pkh, kyc_attestation_id, board_approval_ref, approved_at,
             member_class, status, joined_at)
          VALUES (
            'member-1', ${CONTRACT_SUBJECT_PKH}, ${CONTRACT_ATTESTATION_ID},
            'board-2026-04', 1700000000000,
            'STANDARD', 'ACTIVE', 1700000000000
          )
        `;

        const admitted = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_800_000_000_000,
        );
        expect(admitted?.kyc.status).toBe("ACTIVE");
        expect(admitted?.kyc.expiresAt).toBe(4_102_444_800_000);

        await client`
          UPDATE kyc_attestations SET status = 'SUPERSEDED'
           WHERE id = ${CONTRACT_ATTESTATION_ID}
        `;
        await client`
          INSERT INTO kyc_attestations
            (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
          VALUES (
            'kyc-renewed', ${CONTRACT_SUBJECT_PKH}, 'MANUAL', 'renewal',
            1800000000000, 1900000000000, 'ACTIVE'
          )
        `;

        const renewed = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_850_000_000_000,
        );
        expect(renewed?.kyc.status).toBe("ACTIVE");
        expect(renewed?.kyc.expiresAt).toBe(1_900_000_000_000);

        const expired = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_900_000_000_000,
        );
        expect(expired?.kyc.status).toBe("EXPIRED");
      } finally {
        await close();
      }
    });
  });

  describe("member admission (Postgres)", () => {
    test("commits the admitted member and its audit row together", async () => {
      const { client, db, repository, close } = await setup();

      try {
        const audit = new DrizzleAuditLog(db);
        const admit = new AdmitMember(
          repository,
          new SequentialIdGenerator("member"),
          new InMemoryKycEligibility().eligible(
            CONTRACT_SUBJECT_PKH,
            CONTRACT_ATTESTATION_ID,
          ),
          createDrizzleUnitOfWork(db, (tx) => ({
            members: new DrizzleMemberRepository(tx),
            audit: new DrizzleAuditLog(tx),
          })),
        );

        const result = await admit.execute({
          ownerPkh: CONTRACT_SUBJECT_PKH,
          kycAttestationId: CONTRACT_ATTESTATION_ID,
          boardApprovalRef: "board-2026-04",
          memberClass: "STANDARD",
          joinedAt: 1_700_000_000_000,
          now: 1_700_000_000_000,
          actor: "ray",
        });
        if (!result.ok) throw new Error(result.error.code);

        const stored = await repository.findById(result.value.id);
        expect(stored?.boardApprovalRef).toBe("board-2026-04");
        expect(stored?.approvedAt).toBe(1_700_000_000_000);

        const events = await audit.list({ entityId: result.value.id });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          action: "MEMBER_ADMITTED",
          entityType: "MEMBER",
          detail: "board-2026-04",
          occurredAt: 1_700_000_000_000,
        });
      } finally {
        await close();
      }
    });
  });
}
