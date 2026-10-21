import { migrateDatabase } from "../infrastructure/database/migrate";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

await migrateDatabase(databaseUrl);
console.log("Migrations applied");
