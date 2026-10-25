import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describeKycAttestationRepository } from "../kyc-attestation-repository-contract";
import { DrizzleKycAttestationRepository } from "./kyc-attestation-repository";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../../infrastructure/database/migrations/0001_init.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);
  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleKycAttestationRepository(db),
    close: () => client.close(),
  };
}

describeKycAttestationRepository("DrizzleKycAttestationRepository", setup);
