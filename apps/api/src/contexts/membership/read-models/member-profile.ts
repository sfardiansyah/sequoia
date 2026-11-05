import type { MemberClass } from "@sequoia/shared";
import type { ContributionSource } from "../../capital/domain/contribution";
import type { KycStatus } from "../../identity/domain/kyc-status";
import type { MemberStatus } from "../domain/member";

export type ContributionSummary = {
  readonly year: number;
  /** Unit amounts are bigint, so they cross the read model as strings. */
  readonly annualAmount: string;
  readonly memberCapital: string;
  readonly capitalParticipation: string;
  readonly source: ContributionSource;
};

export type MemberProfile = {
  readonly id: string;
  readonly ownerPkh: string;
  readonly memberClass: MemberClass;
  readonly status: MemberStatus;
  readonly joinedAt: number;
  readonly kyc: {
    readonly status: KycStatus;
    readonly expiresAt: number;
  };
  readonly contributions: readonly ContributionSummary[];
};

/**
 * Read model: one SQL join, no aggregate. `at` is required because KYC status
 * is derived from expiry rather than stored. The KYC block comes from the
 * subject's newest attestation, not the row recorded at admission, so a
 * renewal (which supersedes the admission row) stays visible.
 */
export interface MemberProfileReader {
  findByOwnerPkh(ownerPkh: string, at: number): Promise<MemberProfile | null>;
}
