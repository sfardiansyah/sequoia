import {
  MemberStatus,
  type MemberRepository,
} from "../../../membership/domain/member";
import type { KycEligibility } from "../../../membership/domain/ports/kyc-eligibility";
import type { ContributionEligibility } from "../../domain/ports/contribution-eligibility";

export class MembershipContributionEligibility
  implements ContributionEligibility
{
  constructor(
    private readonly members: MemberRepository,
    private readonly kyc: KycEligibility,
  ) {}

  async check(input: {
    readonly memberId: string;
    readonly at: number;
  }) {
    const member = await this.members.findById(input.memberId);
    if (!member) return "MEMBER_NOT_FOUND" as const;
    if (member.status !== MemberStatus.Active) {
      return "MEMBER_INACTIVE" as const;
    }
    if (!member.boardApprovalRef) {
      return "MEMBER_NOT_APPROVED" as const;
    }

    const failure = await this.kyc.checkCurrent({
      subjectPkh: member.ownerPkh.value,
      at: input.at,
    });

    switch (failure) {
      case null:
        return null;
      case "EXPIRED":
        return "KYC_EXPIRED" as const;
      case "REVOKED":
        return "KYC_REVOKED" as const;
      case "MISMATCH":
      case "NOT_FOUND":
      case "SUPERSEDED":
        return "KYC_NOT_VERIFIED" as const;
    }
  }
}
