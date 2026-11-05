import { err, MemberClass, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import type { UnitOfWork } from "../../../shared/persistence/unit-of-work";
import {
  Member,
  type MemberRepository,
  type MembershipError,
} from "../domain/member";
import { OwnerPkh } from "../domain/owner-pkh";
import type { KycEligibility } from "../domain/ports/kyc-eligibility";
import type { MembershipWriteScope } from "./write-scope";

export type AdmitMemberCommand = {
  readonly ownerPkh: string;
  readonly kycAttestationId: string;
  readonly boardApprovalRef: string;
  readonly memberClass: MemberClass;
  readonly joinedAt: number;
  readonly now: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class AdmitMember {
  constructor(
    private readonly members: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly kyc: KycEligibility,
    private readonly unitOfWork: UnitOfWork<MembershipWriteScope>,
  ) {}

  async execute(
    command: AdmitMemberCommand,
  ): Promise<Result<Member, MembershipError>> {
    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

    // Pilot policy: founder admission waits for the founder rules to be designed.
    if (command.memberClass === MemberClass.Founder) {
      return err({ code: "MEMBER_CLASS_NOT_ALLOWED" });
    }

    const ownerPkh = OwnerPkh.parse(command.ownerPkh);
    if (!ownerPkh) return err({ code: "INVALID_OWNER" });

    let eligibility;
    try {
      eligibility = await this.kyc.check({
        subjectPkh: ownerPkh.value,
        attestationId: command.kycAttestationId,
        at: Math.max(command.joinedAt, command.now),
      });
    } catch (cause) {
      return err(unexpected(cause));
    }

    // Shortcut: a revoked attestation blocks admission but does not freeze an
    // existing member. Wire that to voting and exit when those contexts exist.
    switch (eligibility) {
      case null:
        break;
      case "MISMATCH":
        return err({ code: "KYC_SUBJECT_MISMATCH" });
      case "EXPIRED":
        return err({ code: "KYC_EXPIRED" });
      case "REVOKED":
        return err({ code: "KYC_REVOKED" });
      case "NOT_FOUND":
      case "SUPERSEDED":
        return err({ code: "KYC_NOT_VERIFIED" });
    }

    let existing: Member | null;
    try {
      existing = await this.members.findByOwnerPkh(ownerPkh);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (existing) return err({ code: "ALREADY_MEMBER" });

    const member = Member.admit({
      id: this.ids.next(),
      ownerPkh,
      kycAttestationId: command.kycAttestationId,
      boardApprovalRef: command.boardApprovalRef,
      approvedAt: command.now,
      memberClass: command.memberClass,
      joinedAt: command.joinedAt,
    });
    if (!member.ok) return member;

    try {
      await this.unitOfWork.run(async (write) => {
        await write.members.save(member.value);
        await write.audit.record({
          actor,
          action: AUDIT_ACTIONS.memberAdmitted,
          entityType: AUDIT_ENTITY_TYPES.member,
          entityId: member.value.id,
          detail: member.value.boardApprovalRef,
          occurredAt: member.value.approvedAt,
        });
      });
    } catch (cause) {
      return err(unexpected(cause));
    }

    return member;
  }
}
