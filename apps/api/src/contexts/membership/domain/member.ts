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

export class DuplicateOwnerPkhError extends Error {
  constructor() {
    super("Owner public key hash already has a member");
    this.name = "DuplicateOwnerPkhError";
  }
}

export type MembershipError =
  | { readonly code: "INVALID_OWNER" }
  | { readonly code: "INVALID_KYC_ATTESTATION" }
  | { readonly code: "INVALID_BOARD_APPROVAL_REF" }
  | { readonly code: "INVALID_APPROVAL_TIME" }
  | { readonly code: "INVALID_JOIN_TIME" }
  | { readonly code: "INVALID_ACTOR" }
  | { readonly code: "MEMBER_CLASS_NOT_ALLOWED" }
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
    readonly boardApprovalRef: string,
    readonly approvedAt: number,
    readonly memberClass: MemberClass,
    readonly status: MemberStatus,
    readonly joinedAt: number,
  ) {}

  static admit(input: {
    id: string;
    ownerPkh: OwnerPkh;
    kycAttestationId: string;
    boardApprovalRef: string;
    approvedAt: number;
    memberClass: MemberClass;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    return Member.build({
      ...input,
      status: MemberStatus.Active,
    });
  }

  static rehydrate(input: {
    id: string;
    ownerPkh: string;
    kycAttestationId: string;
    boardApprovalRef: string;
    approvedAt: number;
    memberClass: MemberClass;
    status: MemberStatus;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const ownerPkh = OwnerPkh.parse(input.ownerPkh);
    if (!ownerPkh) return err({ code: "INVALID_OWNER" });

    return Member.build({ ...input, ownerPkh });
  }

  private static build(input: {
    id: string;
    ownerPkh: OwnerPkh;
    kycAttestationId: string;
    boardApprovalRef: string;
    approvedAt: number;
    memberClass: MemberClass;
    status: MemberStatus;
    joinedAt: number;
  }): Result<Member, MembershipError> {
    const kycAttestationId = input.kycAttestationId.trim();
    const boardApprovalRef = input.boardApprovalRef.trim();

    if (!kycAttestationId) return err({ code: "INVALID_KYC_ATTESTATION" });
    if (!boardApprovalRef) {
      return err({ code: "INVALID_BOARD_APPROVAL_REF" });
    }
    if (!Number.isInteger(input.approvedAt) || input.approvedAt < 0) {
      return err({ code: "INVALID_APPROVAL_TIME" });
    }
    if (!Number.isInteger(input.joinedAt) || input.joinedAt < 0) {
      return err({ code: "INVALID_JOIN_TIME" });
    }

    return ok(
      new Member(
        input.id as MemberId,
        input.ownerPkh,
        kycAttestationId,
        boardApprovalRef,
        input.approvedAt,
        input.memberClass,
        input.status,
        input.joinedAt,
      ),
    );
  }
}

export interface MemberRepository {
  findById(id: string): Promise<Member | null>;
  findByOwnerPkh(ownerPkh: OwnerPkh): Promise<Member | null>;
  save(member: Member): Promise<void>;
}
