import type { GetKycAttestation } from "../../../identity/application/get-kyc-attestation";
import type { ListKycAttestations } from "../../../identity/application/list-kyc-attestations";
import type {
  KycEligibility,
  KycEligibilityFailure,
} from "../../domain/ports/kyc-eligibility";

export class IdentityKycEligibility implements KycEligibility {
  constructor(
    private readonly getKycAttestation: GetKycAttestation,
    private readonly listKycAttestations: ListKycAttestations,
  ) {}

  async check(input: {
    readonly subjectPkh: string;
    readonly attestationId: string;
    readonly at: number;
  }): Promise<KycEligibilityFailure | null> {
    const result = await this.getKycAttestation.execute({
      id: input.attestationId,
      at: input.at,
    });
    if (!result.ok) {
      throw new Error(`KYC lookup failed: ${result.error.code}`);
    }

    const attestation = result.value;
    if (!attestation) return "NOT_FOUND";
    if (attestation.subjectPkh !== input.subjectPkh) return "MISMATCH";

    return this.failureFor(attestation.status);
  }

  async checkCurrent(input: {
    readonly subjectPkh: string;
    readonly at: number;
  }): Promise<KycEligibilityFailure | null> {
    const result = await this.listKycAttestations.execute({
      subjectPkh: input.subjectPkh,
      at: input.at,
    });
    if (!result.ok) {
      throw new Error(`KYC lookup failed: ${result.error.code}`);
    }

    const attestation = result.value[0];
    if (!attestation) return "NOT_FOUND";

    return this.failureFor(attestation.status);
  }

  private failureFor(
    status: "ACTIVE" | "EXPIRED" | "SUPERSEDED" | "REVOKED",
  ): KycEligibilityFailure | null {
    switch (status) {
      case "ACTIVE":
        return null;
      case "EXPIRED":
        return "EXPIRED";
      case "REVOKED":
        return "REVOKED";
      case "SUPERSEDED":
        return "SUPERSEDED";
    }
  }
}
