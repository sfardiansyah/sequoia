import { err, type MemberClass, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import {
  Member,
  type MemberRepository,
  type MembershipError,
} from "../domain/member";
import { OwnerPkh } from "../domain/owner-pkh";

export interface IdGenerator {
  next(): string;
}

export type AdmitMemberCommand = {
  readonly ownerPkh: string;
  readonly kycCommitment: string;
  readonly memberClass: MemberClass;
  readonly joinedAt: number;
  readonly kycVerified: boolean;
  readonly boardApproved: boolean;
};

export class AdmitMember {
  constructor(
    private readonly members: MemberRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    command: AdmitMemberCommand,
  ): Promise<Result<Member, MembershipError>> {
    if (!command.kycVerified) return err({ code: "KYC_NOT_VERIFIED" });
    if (!command.boardApproved) return err({ code: "BOARD_NOT_APPROVED" });

    const ownerPkh = OwnerPkh.parse(command.ownerPkh);
    if (!ownerPkh) return err({ code: "INVALID_OWNER" });

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
      kycCommitment: command.kycCommitment,
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
