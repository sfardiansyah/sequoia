import { describe, expect, test } from "bun:test";
import {
  KycAttestation,
  type KycAttestationRepository,
} from "../domain/kyc-attestation";

export type KycAttestationRepositoryHarness = {
  repository: KycAttestationRepository;
  close: () => Promise<void>;
};

export const CONTRACT_ATTESTATION_SUBJECT =
  "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";

function attestation(input: {
  id: string;
  subjectPkh?: string;
  issuedAt?: number;
  expiresAt?: number;
}): KycAttestation {
  const issued = KycAttestation.issue({
    id: input.id,
    subjectPkh: input.subjectPkh ?? CONTRACT_ATTESTATION_SUBJECT,
    issuerId: "MANUAL",
    evidenceRef: "contract-fixture",
    issuedAt: input.issuedAt ?? 1_700_000_000_000,
    expiresAt: input.expiresAt ?? 1_750_000_000_000,
  });
  if (!issued.ok) throw new Error(issued.error.code);
  return issued.value;
}

export function describeKycAttestationRepository(
  name: string,
  create: () => Promise<KycAttestationRepositoryHarness>,
): void {
  describe(name, () => {
    test("returns null for an unknown id", async () => {
      const { repository, close } = await create();

      try {
        expect(await repository.findById("missing")).toBeNull();
      } finally {
        await close();
      }
    });

    test("saves and finds an attestation", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "kyc-1" }));

        const found = await repository.findById("kyc-1");
        expect(found?.id).toBe("kyc-1");
        expect(found?.subjectPkh.value).toBe(CONTRACT_ATTESTATION_SUBJECT);
        expect(found?.status).toBe("ACTIVE");
      } finally {
        await close();
      }
    });

    test("rejects two active attestations for one subject", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "kyc-1" }));
        await expect(
          repository.save(attestation({ id: "kyc-2" })),
        ).rejects.toThrow();
      } finally {
        await close();
      }
    });

    test("saveIssued supersedes the subject's active attestation", async () => {
      const { repository, close } = await create();

      try {
        await repository.saveIssued(attestation({ id: "kyc-1" }));
        await repository.saveIssued(
          attestation({ id: "kyc-2", issuedAt: 1_710_000_000_000 }),
        );

        expect((await repository.findById("kyc-1"))?.status).toBe("SUPERSEDED");
        expect((await repository.findById("kyc-2"))?.status).toBe("ACTIVE");
      } finally {
        await close();
      }
    });

    test("revoking an active attestation keeps one row per id", async () => {
      const { repository, close } = await create();

      try {
        const issued = attestation({ id: "kyc-1" });
        await repository.save(issued);

        const revoked = issued.revoke({
          reason: "sanctions hit",
          revokedAt: 1_701_000_000_000,
        });
        if (!revoked.ok) throw new Error(revoked.error.code);
        await repository.save(revoked.value);

        const found = await repository.findById("kyc-1");
        expect(found?.status).toBe("REVOKED");
        expect(found?.revokeReason).toBe("sanctions hit");
      } finally {
        await close();
      }
    });

    test("lists attestations by subject and expiry", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "kyc-1" }));
        await repository.save(
          attestation({
            id: "kyc-2",
            subjectPkh: "b".repeat(56),
            expiresAt: 1_720_000_000_000,
          }),
        );

        expect(
          (await repository.list()).map((row) => row.id).sort(),
        ).toEqual(["kyc-1", "kyc-2"]);
        expect(
          (
            await repository.list({ subjectPkh: "b".repeat(56) })
          ).map((row) => row.id),
        ).toEqual(["kyc-2"]);
        expect(
          (
            await repository.list({ expiresBefore: 1_730_000_000_000 })
          ).map((row) => row.id),
        ).toEqual(["kyc-2"]);
      } finally {
        await close();
      }
    });
  });
}
