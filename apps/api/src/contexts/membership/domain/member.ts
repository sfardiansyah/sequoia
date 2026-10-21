import { err, ok, type MemberClass, type Result } from "@coop/shared";

export type MemberId = string & { readonly __brand: "MemberId" };

export const MemberStatus = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Exited: "EXITED",
} as const;

export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export type MembershipError =
  | "INVALID_OWNER"
  | "INVALID_KYC_COMMITMENT"
  | "INVALID_JOIN_TIME"
  | "KYC_NOT_VERIFIED"
  | "BOARD_NOT_APPROVED"
  | "ALREADY_MEMBER";

export class Member {
  private constructor(
    readonly id: MemberId,
    readonly ownerPkh: string,
    readonly kycCommitment: string,
    readonly memberClass: MemberClass,
    readonly status: MemberStatus,
    readonly joinedAt: number,
  ) {}

  static admit(input: {
    id: string;
    ownerPkh: string;
    kycCommitment: string;
    memberClass: MemberClass;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const ownerPkh = input.ownerPkh.trim();
    const kycCommitment = input.kycCommitment.trim();

    if (!ownerPkh) return err("INVALID_OWNER");
    if (!kycCommitment) return err("INVALID_KYC_COMMITMENT");
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err("INVALID_JOIN_TIME");
    }

    return ok(
      new Member(
        input.id as MemberId,
        ownerPkh,
        kycCommitment,
        input.memberClass,
        MemberStatus.Active,
        input.joinedAt,
      ),
    );
  }
}

export interface MemberRepository {
  findByOwnerPkh(ownerPkh: string): Promise<Member | null>;
  save(member: Member): Promise<void>;
}
