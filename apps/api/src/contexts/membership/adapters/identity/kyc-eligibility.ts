import type { GetKycAttestation } from "../../../identity/application/get-kyc-attestation";
import type {
  KycEligibility,
  KycEligibilityFailure,
} from "../../domain/ports/kyc-eligibility";

export class IdentityKycEligibility implements KycEligibility {
  constructor(private readonly getKycAttestation: GetKycAttestation) {}

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

    switch (attestation.status) {
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
