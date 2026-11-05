export type ContributionEligibilityFailure =
  | "MEMBER_NOT_FOUND"
  | "MEMBER_INACTIVE"
  | "MEMBER_NOT_APPROVED"
  | "KYC_NOT_VERIFIED"
  | "KYC_EXPIRED"
  | "KYC_REVOKED";

/**
 * What capital needs from membership and identity: may this member receive a
 * contribution at this time? null means eligible.
 */
export interface ContributionEligibility {
  check(input: {
    readonly memberId: string;
    readonly at: number;
  }): Promise<ContributionEligibilityFailure | null>;
}
