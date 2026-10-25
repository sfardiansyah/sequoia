import { err, ok, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import type { KycStatus } from "../domain/kyc-status";
import type {
  IdentityError,
  KycAttestation,
  KycAttestationRepository,
} from "../domain/kyc-attestation";

export type KycAttestationView = {
  readonly id: string;
  readonly subjectPkh: string;
  readonly issuerId: string;
  readonly evidenceRef: string;
  readonly issuedAt: number;
  readonly status: KycStatus;
  readonly expiresAt: number;
};

export function toKycAttestationView(
  attestation: KycAttestation,
  at: number,
): KycAttestationView {
  return {
    id: attestation.id,
    subjectPkh: attestation.subjectPkh.value,
    issuerId: attestation.issuerId,
    evidenceRef: attestation.evidenceRef,
    issuedAt: attestation.issuedAt,
    status: attestation.statusAt(at),
    expiresAt: attestation.expiresAt,
  };
}

export class GetKycAttestation {
  constructor(private readonly attestations: KycAttestationRepository) {}

  async execute(input: {
    id: string;
    at: number;
  }): Promise<Result<KycAttestationView | null, IdentityError>> {
    let attestation;
    try {
      attestation = await this.attestations.findById(input.id);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (!attestation) return ok(null);

    return ok(toKycAttestationView(attestation, input.at));
  }
}
