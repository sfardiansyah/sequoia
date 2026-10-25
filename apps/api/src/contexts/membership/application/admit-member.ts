import { err, type MemberClass, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import {
  Member,
  type MemberRepository,
  type MembershipError,
} from "../domain/member";
import { OwnerPkh } from "../domain/owner-pkh";
import type { KycEligibility } from "../domain/ports/kyc-eligibility";

export type AdmitMemberCommand = {
  readonly ownerPkh: string;
  readonly kycAttestationId: string;
  readonly memberClass: MemberClass;
  readonly joinedAt: number;
  readonly now: number;
};

export class AdmitMember {
  constructor(
    private readonly members: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly kyc: KycEligibility,
  ) {}

  async execute(
    command: AdmitMemberCommand,
  ): Promise<Result<Member, MembershipError>> {
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
      memberClass: command.memberClass,
      joinedAt: command.joinedAt,
    });
    if (!member.ok) return member;

    try {
      await this.members.save(member.value);
    } catch (cause) {
      return err(unexpected(cause));
    }

    return member;
  }
}
