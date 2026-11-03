import { InMemoryAuditLog } from "./in-memory";
import { describeAuditLog } from "./audit-log-contract";

describeAuditLog("InMemoryAuditLog", async () => ({
  log: new InMemoryAuditLog(),
  close: async () => {},
}));
