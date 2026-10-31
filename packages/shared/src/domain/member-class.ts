export const MemberClass = {
  Standard: "STANDARD",
  Founder: "FOUNDER",
} as const;

export type MemberClass = (typeof MemberClass)[keyof typeof MemberClass];

export const MEMBER_CLASSES = Object.values(MemberClass) as MemberClass[];

export type ContributionSplitBps = {
  readonly memberCapitalBps: number;
  readonly capitalParticipationBps: number;
};

export const DEFAULT_SPLITS = {
  [MemberClass.Standard]: {
    memberCapitalBps: 7_000,
    capitalParticipationBps: 3_000,
  },
  [MemberClass.Founder]: {
    memberCapitalBps: 7_000,
    capitalParticipationBps: 3_000,
  },
} satisfies Record<MemberClass, ContributionSplitBps>;

export function defaultSplitFor(
  memberClass: MemberClass,
): ContributionSplitBps {
  return DEFAULT_SPLITS[memberClass];
}

export function isMemberClass(value: string): value is MemberClass {
  return (MEMBER_CLASSES as readonly string[]).includes(value);
}
