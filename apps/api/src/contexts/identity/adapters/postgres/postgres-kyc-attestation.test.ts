import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { execMigrations } from "../../../../infrastructure/database/testing";
import { describeKycAttestationRepository } from "../kyc-attestation-repository-contract";
import { DrizzleKycAttestationRepository } from "./kyc-attestation-repository";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  await execMigrations(client);
  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleKycAttestationRepository(db),
    close: () => client.close(),
  };
}

describeKycAttestationRepository("DrizzleKycAttestationRepository", setup);
