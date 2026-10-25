export type KycEligibilityFailure =
  | "NOT_FOUND"
  | "SUPERSEDED"
  | "MISMATCH"
  | "EXPIRED"
  | "REVOKED";

/**
 * What membership needs from the identity context and nothing more:
 * is this attestation a valid proof of KYC for this wallet at this time?
 * null means eligible.
 */
export interface KycEligibility {
  check(input: {
    readonly subjectPkh: string;
    readonly attestationId: string;
    readonly at: number;
  }): Promise<KycEligibilityFailure | null>;
}
