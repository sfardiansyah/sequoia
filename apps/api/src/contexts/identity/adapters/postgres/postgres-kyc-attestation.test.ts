import { describe, expect, test } from "bun:test";
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

describe("kyc_attestations privacy constraints", () => {
  test("rejects a free-text revoke reason", async () => {
    const client = new PGlite();
    await execMigrations(client);

    try {
      await expect(
        client.exec(`
          INSERT INTO kyc_attestations
            (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at,
             status, revoked_at, revoke_reason_code)
          VALUES ('kyc-bad', '${"a".repeat(56)}', 'MANUAL', 'ref', 0, 1,
                  'REVOKED', 1, 'sanctions hit')
        `),
      ).rejects.toThrow(/revoke_reason_code/);
    } finally {
      await client.close();
    }
  });

  test("requires a reason code on a revoked row", async () => {
    const client = new PGlite();
    await execMigrations(client);

    try {
      await expect(
        client.exec(`
          INSERT INTO kyc_attestations
            (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at,
             status, revoked_at)
          VALUES ('kyc-bad', '${"a".repeat(56)}', 'MANUAL', 'ref', 0, 1,
                  'REVOKED', 1)
        `),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  test("rejects retain-until that does not follow issued-at", async () => {
    const client = new PGlite();
    await execMigrations(client);

    try {
      await expect(
        client.exec(`
          INSERT INTO kyc_attestations
            (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at,
             status, retain_until)
          VALUES ('kyc-bad', '${"a".repeat(56)}', 'MANUAL', 'ref', 5, 10,
                  'ACTIVE', 5)
        `),
      ).rejects.toThrow(/check constraint/);
    } finally {
      await client.close();
    }
  });
});
