import {
  DEFAULT_SPLITS,
  MEMBER_CLASSES,
  MemberClass,
  type ContributionSplitBps,
} from "./member-class";
import {
  BPS_DENOMINATOR,
  bps,
  idr,
  type BasisPoints,
  type IdrAmount,
} from "./money";
import { err, ok, type Result } from "./result";

/** Plan §3.2: standard Capital Participation share is capped at 50% by governance. */
export const STANDARD_CAPITAL_PARTICIPATION_MAX_BPS = 5_000 as BasisPoints;

export type CapitalParameters = {
  readonly annualAmount: IdrAmount;
  readonly standardCapitalParticipationMaxBps: BasisPoints;
  readonly splits: Record<MemberClass, ContributionSplitBps>;
};

/** The annual amount is announced each year, so it has no default. */
export function defaultCapitalParameters(
  annualAmount: IdrAmount,
): CapitalParameters {
  return {
    annualAmount,
    standardCapitalParticipationMaxBps:
      STANDARD_CAPITAL_PARTICIPATION_MAX_BPS,
    splits: DEFAULT_SPLITS,
  };
}

export function validateCapitalParameters(
  params: CapitalParameters,
): Result<CapitalParameters> {
  const annualAmount = idr(params.annualAmount);
  if (!annualAmount.ok) return annualAmount;

  const maxBps = bps(params.standardCapitalParticipationMaxBps);
  if (!maxBps.ok) return maxBps;

  for (const memberClass of MEMBER_CLASSES) {
    const split = params.splits[memberClass];

    const memberCapitalBps = bps(split.memberCapitalBps);
    if (!memberCapitalBps.ok) return memberCapitalBps;

    const capitalParticipationBps = bps(split.capitalParticipationBps);
    if (!capitalParticipationBps.ok) return capitalParticipationBps;

    if (
      memberCapitalBps.value + capitalParticipationBps.value !==
      BPS_DENOMINATOR
    ) {
      return err(`${memberClass} split must total 10000 bps`);
    }

    if (
      memberClass === MemberClass.Standard &&
      capitalParticipationBps.value > maxBps.value
    ) {
      return err(
        "Standard Capital Participation share exceeds the configured cap",
      );
    }
  }

  return ok(params);
}
