import { err, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import type { AuditLog } from "../../../shared/audit/port";
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
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class RevokeKycAttestation {
  constructor(
    private readonly attestations: KycAttestationRepository,
    private readonly audit: AuditLog,
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
      await this.attestations.save(revoked.value);
    } catch (cause) {
      return err(unexpected(cause));
    }

    await this.audit.record({
      actor,
      action: AUDIT_ACTIONS.kycRevoked,
      entityType: AUDIT_ENTITY_TYPES.kycAttestation,
      entityId: revoked.value.id,
      detail: null,
      occurredAt: command.revokedAt,
    });

    return revoked;
  }
}
