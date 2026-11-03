import { describe, expect, test } from "bun:test";
import type { NewAuditEvent } from "../audit-event";
import type { AuditLog } from "../port";

export type AuditLogHarness = {
  log: AuditLog;
  close: () => Promise<void>;
};

function event(overrides: Partial<NewAuditEvent> = {}): NewAuditEvent {
  return {
    actor: "ray",
    action: "KYC_ISSUED",
    entityType: "KYC_ATTESTATION",
    entityId: "kyc-1",
    detail: null,
    occurredAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function describeAuditLog(
  name: string,
  create: () => Promise<AuditLogHarness>,
): void {
  describe(name, () => {
    test("records an event and lists it back", async () => {
      const { log, close } = await create();

      try {
        await log.record(event());

        const rows = await log.list();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          actor: "ray",
          action: "KYC_ISSUED",
          entityType: "KYC_ATTESTATION",
          entityId: "kyc-1",
          detail: null,
          occurredAt: 1_700_000_000_000,
        });
      } finally {
        await close();
      }
    });

    test("filters by entity type, entity id, and actor", async () => {
      const { log, close } = await create();

      try {
        await log.record(event());
        await log.record(
          event({ actor: "board-ops", entityId: "kyc-2", action: "KYC_REVOKED" }),
        );

        expect((await log.list({ entityId: "kyc-2" })).map((row) => row.actor)).toEqual([
          "board-ops",
        ]);
        expect(await log.list({ actor: "nobody" })).toEqual([]);
        expect(await log.list({ entityType: "ADMISSION" })).toEqual([]);
        expect(
          (await log.list({ entityType: "KYC_ATTESTATION" })).map(
            (row) => row.entityId,
          ).sort(),
        ).toEqual(["kyc-1", "kyc-2"]);
      } finally {
        await close();
      }
    });

    test("returns newest first and applies the limit", async () => {
      const { log, close } = await create();

      try {
        for (let index = 0; index < 3; index += 1) {
          await log.record(
            event({ entityId: `kyc-${index}`, occurredAt: 1_700_000_000_000 + index }),
          );
        }

        expect((await log.list()).map((row) => row.entityId)).toEqual([
          "kyc-2",
          "kyc-1",
          "kyc-0",
        ]);
        expect((await log.list({ limit: 1 })).map((row) => row.entityId)).toEqual([
          "kyc-2",
        ]);
      } finally {
        await close();
      }
    });
  });
}
