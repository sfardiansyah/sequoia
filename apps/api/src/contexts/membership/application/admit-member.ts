import { err, type MemberClass, type Result } from "@coop/shared";
import {
  Member,
  type MemberRepository,
  type MembershipError,
} from "../domain/member";

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
    if (!command.kycVerified) return err("KYC_NOT_VERIFIED");
    if (!command.boardApproved) return err("BOARD_NOT_APPROVED");

    const existing = await this.members.findByOwnerPkh(command.ownerPkh);
    if (existing) return err("ALREADY_MEMBER");

    const member = Member.admit({
      id: this.ids.next(),
      ownerPkh: command.ownerPkh,
      kycCommitment: command.kycCommitment,
      memberClass: command.memberClass,
      joinedAt: command.joinedAt,
    });
    if (!member.ok) return member;

    await this.members.save(member.value);
    return member;
  }
}
