import { defineCommand } from "citty";
import { migrateDatabase } from "../infrastructure/database/migrate";

export default defineCommand({
  meta: {
    name: "migrate",
    description: "Apply database migrations",
  },
  async run() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");

    await migrateDatabase(databaseUrl);
    console.log("Migrations applied");
  },
});
