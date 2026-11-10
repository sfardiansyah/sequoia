import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  assertTestDatabase,
  ensureMigrated,
} from "../../../../infrastructure/database/testing";
import { describeKycAttestationRepository } from "../kyc-attestation-repository-contract";
import { DrizzleKycAttestationRepository } from "./kyc-attestation-repository";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  // Issuers are seeded by the migration; only attestations are reset.
  await client`TRUNCATE TABLE kyc_attestations, members CASCADE`;

  const db = drizzle(client, { schema });

  return {
    client,
    repository: new DrizzleKycAttestationRepository(db),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  assertTestDatabase(databaseUrl);
  describeKycAttestationRepository(
    "DrizzleKycAttestationRepository (Postgres)",
    setup,
  );

  describe("kyc_attestations privacy constraints (Postgres)", () => {
    test("rejects a free-text revoke reason and a bad retain-until", async () => {
      const { client, close } = await setup();

      try {
        await expect(
          client`
            INSERT INTO kyc_attestations
              (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at,
               status, revoked_at, revoke_reason_code)
            VALUES ('kyc-bad', ${"a".repeat(56)}, 'MANUAL', 'ref', 0, 1,
                    'REVOKED', 1, 'sanctions hit')
          `,
        ).rejects.toThrow();

        await expect(
          client`
            INSERT INTO kyc_attestations
              (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at,
               status, retain_until)
            VALUES ('kyc-bad', ${"a".repeat(56)}, 'MANUAL', 'ref', 5, 10,
                    'ACTIVE', 5)
          `,
        ).rejects.toThrow();
      } finally {
        await close();
      }
    });
  });
}
