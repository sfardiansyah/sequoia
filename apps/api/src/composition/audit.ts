import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleAuditLog } from "../shared/audit/adapters/postgres/audit-log";
import * as schema from "../shared/audit/adapters/postgres/schema";

export function createAuditContainer(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  const db = drizzle(client, { schema });

  return {
    audit: new DrizzleAuditLog(db),
    close: () => client.end(),
  };
}
