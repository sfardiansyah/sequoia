import { err, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import type { AuditLog } from "../../../shared/audit/port";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import type { IssuerDirectory } from "../domain/issuer";
import {
  KycAttestation,
  type IdentityError,
  type KycAttestationRepository,
} from "../domain/kyc-attestation";

export type IssueKycAttestationCommand = {
  readonly subjectPkh: string;
  /** Issuer id, which is also the kind: MANUAL, INTERNAL, PRIVY, ... */
  readonly issuerId: string;
  readonly evidenceRef: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class IssueKycAttestation {
  constructor(
    private readonly attestations: KycAttestationRepository,
    private readonly issuers: IssuerDirectory,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    command: IssueKycAttestationCommand,
  ): Promise<Result<KycAttestation, IdentityError>> {
    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

    const issuerId = command.issuerId.trim().toUpperCase();

    let issuer;
    try {
      issuer = await this.issuers.find(issuerId);
    } catch (cause) {
      return err(unexpected(cause));
    }

    if (!issuer) return err({ code: "ISSUER_NOT_FOUND" });
    if (!issuer.active) return err({ code: "ISSUER_INACTIVE" });

    const attestation = KycAttestation.issue({
      id: this.ids.next(),
      subjectPkh: command.subjectPkh,
      issuerId: issuer.id,
      evidenceRef: command.evidenceRef,
      issuedAt: command.issuedAt,
      expiresAt: command.expiresAt,
    });
    if (!attestation.ok) return attestation;

    try {
      await this.attestations.saveIssued(attestation.value);
    } catch (cause) {
      return err(unexpected(cause));
    }

    await this.audit.record({
      actor,
      action: AUDIT_ACTIONS.kycIssued,
      entityType: AUDIT_ENTITY_TYPES.kycAttestation,
      entityId: attestation.value.id,
      detail: null,
      occurredAt: command.issuedAt,
    });

    return attestation;
  }
}
