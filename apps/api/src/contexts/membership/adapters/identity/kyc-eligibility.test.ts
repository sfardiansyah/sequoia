import { describe, expect, test } from "bun:test";
import { GetKycAttestation } from "../../../identity/application/get-kyc-attestation";
import { ListKycAttestations } from "../../../identity/application/list-kyc-attestations";
import { InMemoryKycAttestationRepository } from "../../../identity/adapters/in-memory";
import { KycAttestation } from "../../../identity/domain/kyc-attestation";
import { IdentityKycEligibility } from "./kyc-eligibility";

const subject = "18987c1612069d4080a0eb247820cb987fea81bddeaafdd41f996281";
const issuedAt = 1_700_000_000_000;

function setup() {
  const attestations = new InMemoryKycAttestationRepository();
  return {
    attestations,
    eligibility: new IdentityKycEligibility(
      new GetKycAttestation(attestations),
      new ListKycAttestations(attestations),
    ),
  };
}

function attestation(input: {
  id: string;
  expiresAt?: number;
  issuedAt?: number;
}) {
  const issued = KycAttestation.issue({
    id: input.id,
    subjectPkh: subject,
    issuerId: "MANUAL",
    evidenceRef: "fixture",
    issuedAt: input.issuedAt ?? issuedAt,
    expiresAt: input.expiresAt ?? issuedAt + 1_000,
  });
  if (!issued.ok) throw new Error(issued.error.code);
  return issued.value;
}

describe("IdentityKycEligibility.checkCurrent", () => {
  test("uses the newest active attestation, not the admission record", async () => {
    const { attestations, eligibility } = setup();
    await attestations.saveIssued(attestation({ id: "kyc-1" }));
    await attestations.saveIssued(
      attestation({ id: "kyc-2", issuedAt: issuedAt + 1 }),
    );

    expect(
      await eligibility.checkCurrent({ subjectPkh: subject, at: issuedAt + 2 }),
    ).toBeNull();
  });

  test("returns NOT_FOUND when the subject has no attestation", async () => {
    const { eligibility } = setup();

    expect(
      await eligibility.checkCurrent({ subjectPkh: subject, at: issuedAt }),
    ).toBe("NOT_FOUND");
  });

  test("returns EXPIRED after the current attestation expires", async () => {
    const { attestations, eligibility } = setup();
    await attestations.saveIssued(attestation({ id: "kyc-1" }));

    expect(
      await eligibility.checkCurrent({
        subjectPkh: subject,
        at: issuedAt + 1_001,
      }),
    ).toBe("EXPIRED");
  });

  test("returns REVOKED when the current attestation is revoked", async () => {
    const { attestations, eligibility } = setup();
    const issued = attestation({ id: "kyc-1" });
    await attestations.saveIssued(issued);
    const revoked = issued.revoke({
      reasonCode: "SANCTIONS",
      revokedAt: issuedAt + 1,
    });
    if (!revoked.ok) throw new Error(revoked.error.code);
    await attestations.save(revoked.value);

    expect(
      await eligibility.checkCurrent({ subjectPkh: subject, at: issuedAt + 2 }),
    ).toBe("REVOKED");
  });
});
