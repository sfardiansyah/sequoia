import { drizzle } from "drizzle-orm/pglite";
import {
  closePgliteTestDatabase,
  openPgliteTestDatabase,
} from "./infrastructure/database/testing";
import { describePilotFlow } from "./testing/pilot-flow-contract";

describePilotFlow("pilot harness flow (PGlite)", async () => {
  const client = await openPgliteTestDatabase();

  return {
    db: drizzle(client),
    close: closePgliteTestDatabase,
  };
});
