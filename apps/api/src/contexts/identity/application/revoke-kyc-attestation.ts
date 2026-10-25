import { err, ok, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import {
  KycAttestation,
  type IdentityError,
  type KycAttestationRepository,
} from "../domain/kyc-attestation";

export type RevokeKycAttestationCommand = {
  readonly attestationId: string;
  readonly reason: string;
  readonly revokedAt: number;
};

export class RevokeKycAttestation {
  constructor(private readonly attestations: KycAttestationRepository) {}

  async execute(
    command: RevokeKycAttestationCommand,
  ): Promise<Result<KycAttestation, IdentityError>> {
    let attestation: KycAttestation | null;
    try {
      attestation = await this.attestations.findById(command.attestationId);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (!attestation) return err({ code: "ATTESTATION_NOT_FOUND" });

    const revoked = attestation.revoke({
      reason: command.reason,
      revokedAt: command.revokedAt,
    });
    if (!revoked.ok) return revoked;

    try {
      await this.attestations.save(revoked.value);
    } catch (cause) {
      return err(unexpected(cause));
    }

    return revoked;
  }
}
