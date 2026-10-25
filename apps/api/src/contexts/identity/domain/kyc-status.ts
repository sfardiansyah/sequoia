export const KycStatus = {
  Active: "ACTIVE",
  Expired: "EXPIRED",
  Superseded: "SUPERSEDED",
  Revoked: "REVOKED",
} as const;

export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const AttestationState = {
  Active: "ACTIVE",
  Superseded: "SUPERSEDED",
  Revoked: "REVOKED",
} as const;

export type AttestationState =
  (typeof AttestationState)[keyof typeof AttestationState];

export type KycSnapshot = {
  readonly expiresAt: number;
  readonly status: AttestationState;
};

/**
 * The single place that decides what a KYC snapshot means at a point in time.
 * The admission port and the member profile read both go through this.
 */
export function kycStatusAt(snapshot: KycSnapshot, now: number): KycStatus {
  if (snapshot.status === AttestationState.Revoked) return KycStatus.Revoked;
  if (snapshot.status === AttestationState.Superseded) {
    return KycStatus.Superseded;
  }

  return snapshot.expiresAt > now ? KycStatus.Active : KycStatus.Expired;
}
