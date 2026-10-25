import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  CONTRACT_ATTESTATION_ID,
  CONTRACT_SUBJECT_PKH,
  describeMemberRepository,
} from "../member-repository-contract";
import { DrizzleMemberRepository } from "./member-repository";
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
  await client.exec(`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      '${CONTRACT_ATTESTATION_ID}', '${CONTRACT_SUBJECT_PKH}', 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    )
  `);

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleMemberRepository(db),
    close: () => client.close(),
  };
}

describeMemberRepository("DrizzleMemberRepository", setup);
