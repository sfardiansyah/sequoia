/**
 * What capital needs from membership when creating a bank attestation: does
 * this member exist? Keeping it a port keeps the capital application independent
 * of the membership domain.
 */
export interface MemberDirectory {
  exists(memberId: string): Promise<boolean>;
}
