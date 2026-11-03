import { describe, expect, test } from "bun:test";
import type { AuditEvent } from "../audit-event";
import type { AuditLog } from "../port";
import { WarnOnFailureAuditLog } from "./warn-on-failure";

const failing: AuditLog = {
  async record() {
    throw new Error("connection reset");
  },
  async list(): Promise<AuditEvent[]> {
    return [];
  },
};

describe("WarnOnFailureAuditLog", () => {
  test("warns instead of rejecting when the audit write fails", async () => {
    const warnings: string[] = [];
    const log = new WarnOnFailureAuditLog(failing, (message) =>
      warnings.push(message),
    );

    await log.record({
      actor: "ray",
      action: "KYC_ISSUED",
      entityType: "KYC_ATTESTATION",
      entityId: "kyc-1",
      detail: null,
      occurredAt: 1_700_000_000_000,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("connection reset");
    expect(warnings[0]).toContain("the change was applied");
  });

  test("records without warning when the audit write succeeds", async () => {
    const warnings: string[] = [];
    const inner: AuditLog = {
      async record() {},
      async list() {
        return [];
      },
    };
    const log = new WarnOnFailureAuditLog(inner, (message) =>
      warnings.push(message),
    );

    await log.record({
      actor: "ray",
      action: "KYC_REVOKED",
      entityType: "KYC_ATTESTATION",
      entityId: "kyc-1",
      detail: null,
      occurredAt: 1_700_000_000_000,
    });

    expect(warnings).toEqual([]);
  });
});
