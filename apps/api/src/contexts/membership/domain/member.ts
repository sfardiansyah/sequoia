import { err, ok, type MemberClass, type Result } from "@sequoia/shared";
import type { UnexpectedError } from "../../../shared/errors";
import { OwnerPkh } from "./owner-pkh";

export type MemberId = string & { readonly __brand: "MemberId" };

export const MemberStatus = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Exited: "EXITED",
} as const;

export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export type MembershipError =
  | { readonly code: "INVALID_OWNER" }
  | { readonly code: "INVALID_KYC_ATTESTATION" }
  | { readonly code: "INVALID_JOIN_TIME" }
  | { readonly code: "KYC_NOT_VERIFIED" }
  | { readonly code: "KYC_EXPIRED" }
  | { readonly code: "KYC_REVOKED" }
  | { readonly code: "KYC_SUBJECT_MISMATCH" }
  | { readonly code: "ALREADY_MEMBER" }
  | { readonly code: "MEMBER_NOT_FOUND" }
  | UnexpectedError;

export class Member {
  private constructor(
    readonly id: MemberId,
    readonly ownerPkh: OwnerPkh,
    readonly kycAttestationId: string,
    readonly memberClass: MemberClass,
    readonly status: MemberStatus,
    readonly joinedAt: number,
  ) {}

  static admit(input: {
    id: string;
    ownerPkh: OwnerPkh;
    kycAttestationId: string;
    memberClass: MemberClass;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const kycAttestationId = input.kycAttestationId.trim();

    if (!kycAttestationId) return err({ code: "INVALID_KYC_ATTESTATION" });
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err({ code: "INVALID_JOIN_TIME" });
    }

    return ok(
      new Member(
        input.id as MemberId,
        input.ownerPkh,
        kycAttestationId,
        input.memberClass,
        MemberStatus.Active,
        input.joinedAt,
      ),
    );
  }

  static rehydrate(input: {
    id: string;
    ownerPkh: string;
    kycAttestationId: string;
    memberClass: MemberClass;
    status: MemberStatus;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const ownerPkh = OwnerPkh.parse(input.ownerPkh);
    const kycAttestationId = input.kycAttestationId.trim();

    if (!ownerPkh) return err({ code: "INVALID_OWNER" });
    if (!kycAttestationId) return err({ code: "INVALID_KYC_ATTESTATION" });
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err({ code: "INVALID_JOIN_TIME" });
    }

    return ok(
      new Member(
        input.id as MemberId,
        ownerPkh,
        kycAttestationId,
        input.memberClass,
        input.status,
        input.joinedAt,
      ),
    );
  }
}

export interface MemberRepository {
  findByOwnerPkh(ownerPkh: OwnerPkh): Promise<Member | null>;
  save(member: Member): Promise<void>;
}
