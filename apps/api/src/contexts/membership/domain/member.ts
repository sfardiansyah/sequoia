import { err, ok, type MemberClass, type Result } from "@sequoia/shared";
import type { UnexpectedError } from "../../../shared/errors";

export type MemberId = string & { readonly __brand: "MemberId" };

export const MemberStatus = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Exited: "EXITED",
} as const;

export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export type MembershipError =
  | { readonly code: "INVALID_OWNER" }
  | { readonly code: "INVALID_KYC_COMMITMENT" }
  | { readonly code: "INVALID_JOIN_TIME" }
  | { readonly code: "KYC_NOT_VERIFIED" }
  | { readonly code: "BOARD_NOT_APPROVED" }
  | { readonly code: "ALREADY_MEMBER" }
  | { readonly code: "MEMBER_NOT_FOUND" }
  | UnexpectedError;

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

    if (!ownerPkh) return err({ code: "INVALID_OWNER" });
    if (!kycCommitment) return err({ code: "INVALID_KYC_COMMITMENT" });
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err({ code: "INVALID_JOIN_TIME" });
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

  static rehydrate(input: {
    id: string;
    ownerPkh: string;
    kycCommitment: string;
    memberClass: MemberClass;
    status: MemberStatus;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const ownerPkh = input.ownerPkh.trim();
    const kycCommitment = input.kycCommitment.trim();

    if (!ownerPkh) return err({ code: "INVALID_OWNER" });
    if (!kycCommitment) return err({ code: "INVALID_KYC_COMMITMENT" });
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err({ code: "INVALID_JOIN_TIME" });
    }

    return ok(
      new Member(
        input.id as MemberId,
        ownerPkh,
        kycCommitment,
        input.memberClass,
        input.status,
        input.joinedAt,
      ),
    );
  }
}

export interface MemberRepository {
  findByOwnerPkh(ownerPkh: string): Promise<Member | null>;
  save(member: Member): Promise<void>;
}
