import { err, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import type { UnitOfWork } from "../../../shared/persistence/unit-of-work";
import { unexpected } from "../../../shared/errors";
import {
  KycAttestation,
  type IdentityError,
  type KycAttestationRepository,
} from "../domain/kyc-attestation";
import type { IdentityWriteScope } from "./write-scope";

export type RevokeKycAttestationCommand = {
  readonly attestationId: string;
  readonly reason: string;
  readonly revokedAt: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class RevokeKycAttestation {
  constructor(
    private readonly attestations: KycAttestationRepository,
    private readonly unitOfWork: UnitOfWork<IdentityWriteScope>,
  ) {}

  async execute(
    command: RevokeKycAttestationCommand,
  ): Promise<Result<KycAttestation, IdentityError>> {
    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

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
      await this.unitOfWork.run(async (write) => {
        await write.attestations.save(revoked.value);
        await write.audit.record({
          actor,
          action: AUDIT_ACTIONS.kycRevoked,
          entityType: AUDIT_ENTITY_TYPES.kycAttestation,
          entityId: revoked.value.id,
          detail: null,
          occurredAt: command.revokedAt,
        });
      });
    } catch (cause) {
      return err(unexpected(cause));
    }

    return revoked;
  }
}
