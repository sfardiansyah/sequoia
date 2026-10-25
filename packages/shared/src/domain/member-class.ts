export const MemberClass = {
  Standard: "STANDARD",
  Founder: "FOUNDER",
} as const;

export type MemberClass = (typeof MemberClass)[keyof typeof MemberClass];

export const MEMBER_CLASSES = Object.values(MemberClass) as MemberClass[];

export type ContributionSplitBps = {
  readonly depositBps: number;
  readonly projectBps: number;
};

export const DEFAULT_SPLITS = {
  [MemberClass.Standard]: { depositBps: 7_000, projectBps: 3_000 },
  [MemberClass.Founder]: { depositBps: 2_000, projectBps: 8_000 },
} satisfies Record<MemberClass, ContributionSplitBps>;

export function defaultSplitFor(
  memberClass: MemberClass,
): ContributionSplitBps {
  return DEFAULT_SPLITS[memberClass];
}

export function isMemberClass(value: string): value is MemberClass {
  return (MEMBER_CLASSES as readonly string[]).includes(value);
}
