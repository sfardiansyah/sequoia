export const MEMBER_CLASSES = ["standard", "founder"] as const;

export type MemberClass = (typeof MEMBER_CLASSES)[number];

export const STANDARD_SPLIT = {
  depositBps: 7_000,
  projectBps: 3_000,
} as const;

export const FOUNDER_SPLIT = {
  depositBps: 2_000,
  projectBps: 8_000,
} as const;

export function contributionSplitFor(memberClass: MemberClass): {
  depositBps: number;
  projectBps: number;
} {
  return memberClass === "founder" ? FOUNDER_SPLIT : STANDARD_SPLIT;
}
