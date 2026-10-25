import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureMigrated } from "../../../../infrastructure/database/testing";
import {
  CONTRACT_ATTESTATION_ID,
  CONTRACT_SUBJECT_PKH,
  describeMemberRepository,
} from "../member-repository-contract";
import { DrizzleMemberRepository } from "./member-repository";
import { PostgresMemberProfileReader } from "./member-profile-reader";
import * as schema from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";

async function setup() {
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

  await ensureMigrated(databaseUrl);
  const client = postgres(databaseUrl, { max: 1 });
  await client`TRUNCATE TABLE members, kyc_attestations`;
  await client`
    INSERT INTO kyc_attestations
      (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
    VALUES (
      ${CONTRACT_ATTESTATION_ID}, ${CONTRACT_SUBJECT_PKH}, 'MANUAL',
      'contract-fixture', 0, 4102444800000, 'ACTIVE'
    )
  `;

  const db = drizzle(client, { schema });

  return {
    client,
    repository: new DrizzleMemberRepository(db),
    profile: new PostgresMemberProfileReader(client),
    close: () => client.end(),
  };
}

if (runIntegration && databaseUrl) {
  describeMemberRepository("DrizzleMemberRepository (Postgres)", setup);

  describe("PostgresMemberProfileReader", () => {
    test("reads the subject's newest attestation and derives expiry", async () => {
      const { client, profile, close } = await setup();

      try {
        await client`
          INSERT INTO members
            (id, owner_pkh, kyc_attestation_id, member_class, status, joined_at)
          VALUES (
            'member-1', ${CONTRACT_SUBJECT_PKH}, ${CONTRACT_ATTESTATION_ID},
            'STANDARD', 'ACTIVE', 1700000000000
          )
        `;

        const admitted = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_800_000_000_000,
        );
        expect(admitted?.kyc.status).toBe("ACTIVE");
        expect(admitted?.kyc.expiresAt).toBe(4_102_444_800_000);

        await client`
          UPDATE kyc_attestations SET status = 'SUPERSEDED'
           WHERE id = ${CONTRACT_ATTESTATION_ID}
        `;
        await client`
          INSERT INTO kyc_attestations
            (id, subject_pkh, issuer_id, evidence_ref, issued_at, expires_at, status)
          VALUES (
            'kyc-renewed', ${CONTRACT_SUBJECT_PKH}, 'MANUAL', 'renewal',
            1800000000000, 1900000000000, 'ACTIVE'
          )
        `;

        const renewed = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_850_000_000_000,
        );
        expect(renewed?.kyc.status).toBe("ACTIVE");
        expect(renewed?.kyc.expiresAt).toBe(1_900_000_000_000);

        const expired = await profile.findByOwnerPkh(
          CONTRACT_SUBJECT_PKH,
          1_900_000_000_000,
        );
        expect(expired?.kyc.status).toBe("EXPIRED");
      } finally {
        await close();
      }
    });
  });
}
