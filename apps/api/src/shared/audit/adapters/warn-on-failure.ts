import type { AuditEvent, NewAuditEvent } from "../audit-event";
import type { AuditFilter, AuditLog } from "../port";

/**
 * A mutation that already committed must not be reported as failed just because
 * its audit row could not be written. Report the gap instead.
 *
 * shortcut: the audit row and the mutation are separate commits, so a crash
 * between them loses the row; upgrade when the unit-of-work ticket lands.
 */
export class WarnOnFailureAuditLog implements AuditLog {
  constructor(
    private readonly inner: AuditLog,
    private readonly warn: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  async record(event: NewAuditEvent): Promise<void> {
    try {
      await this.inner.record(event);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      this.warn(
        `warning: audit write failed (${reason}); the change was applied`,
      );
    }
  }

  list(filter?: AuditFilter): Promise<AuditEvent[]> {
    return this.inner.list(filter);
  }
}
