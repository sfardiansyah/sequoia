import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { execMigrations } from "./infrastructure/database/testing";
import { describePilotFlow } from "./testing/pilot-flow-contract";

describePilotFlow("pilot harness flow (PGlite)", async () => {
  const client = new PGlite();
  await execMigrations(client);

  return {
    db: drizzle(client),
    close: () => client.close(),
  };
});
