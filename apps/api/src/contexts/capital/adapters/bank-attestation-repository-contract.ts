import { describe, expect, test } from "bun:test";
import {
  BankAttestation,
  DuplicateBankAttestationIdError,
  DuplicateBankReferenceError,
  type BankAttestationRepository,
} from "../domain/bank-attestation";

export type BankAttestationRepositoryHarness = {
  repository: BankAttestationRepository;
  close: () => Promise<void>;
};

export const CONTRACT_BANK_MEMBER_ID = "member-1";

function attestation(input: {
  id?: string;
  bankReference?: string;
}): BankAttestation {
  const created = BankAttestation.create({
    id: input.id ?? "attestation-1",
    memberId: CONTRACT_BANK_MEMBER_ID,
    contributionYear: 2026,
    amount: 1_000_000,
    bankReference: input.bankReference ?? "BANK-REF-001",
    actor: "ray",
    createdAt: 1_700_000_000_000,
  });
  if (!created.ok) throw new Error(created.error.code);
  return created.value;
}

export function describeBankAttestationRepository(
  name: string,
  create: () => Promise<BankAttestationRepositoryHarness>,
): void {
  describe(name, () => {
    test("returns null for an unknown id", async () => {
      const { repository, close } = await create();

      try {
        expect(await repository.findById("missing-attestation")).toBeNull();
      } finally {
        await close();
      }
    });

    test("saves and finds the bank evidence", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({}));

        const found = await repository.findById("attestation-1");
        expect(found?.memberId).toBe(CONTRACT_BANK_MEMBER_ID);
        expect(found?.contributionYear).toBe(2026);
        expect(Number(found?.amount)).toBe(1_000_000);
        expect(found?.bankReference).toBe("BANK-REF-001");
        expect(found?.actor).toBe("ray");
        expect(found?.createdAt).toBe(1_700_000_000_000);
      } finally {
        await close();
      }
    });

    test("rejects a duplicate bank reference", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "attestation-1" }));
        await expect(
          repository.save(
            attestation({ id: "attestation-2", bankReference: "BANK-REF-001" }),
          ),
        ).rejects.toThrow(DuplicateBankReferenceError);
      } finally {
        await close();
      }
    });

    test("rejects a duplicate attestation id", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "attestation-1" }));
        await expect(
          repository.save(
            attestation({ id: "attestation-1", bankReference: "BANK-REF-002" }),
          ),
        ).rejects.toThrow(DuplicateBankAttestationIdError);
      } finally {
        await close();
      }
    });

    test("accepts another reference for the same member and year", async () => {
      const { repository, close } = await create();

      try {
        await repository.save(attestation({ id: "attestation-1" }));
        await repository.save(
          attestation({ id: "attestation-2", bankReference: "BANK-REF-002" }),
        );

        expect(await repository.findById("attestation-1")).not.toBeNull();
        expect(await repository.findById("attestation-2")).not.toBeNull();
      } finally {
        await close();
      }
    });
  });
}
