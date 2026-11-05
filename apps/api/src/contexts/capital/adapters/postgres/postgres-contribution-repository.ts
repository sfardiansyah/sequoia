import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleBankAttestationRepository } from "./bank-attestation-repository";
import { DrizzleContributionRepository } from "./contribution-repository";
import { DrizzleContributionYearRepository } from "./contribution-year-repository";
import * as schema from "./schema";

export function createPostgresContributionRepository(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });

  return {
    client,
    db,
    repository: new DrizzleContributionRepository(db),
    years: new DrizzleContributionYearRepository(db),
    attestations: new DrizzleBankAttestationRepository(db),
  };
}
