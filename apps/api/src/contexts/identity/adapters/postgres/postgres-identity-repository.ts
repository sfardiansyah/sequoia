import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  DrizzleIssuerDirectory,
  DrizzleKycAttestationRepository,
} from "./kyc-attestation-repository";
import * as schema from "./schema";

export function createPostgresIdentityRepository(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });

  return {
    client,
    attestations: new DrizzleKycAttestationRepository(db),
    issuers: new DrizzleIssuerDirectory(db),
  };
}
