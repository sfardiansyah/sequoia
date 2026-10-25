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

/** Plan §3.2: standard project share is capped at 50% by governance. */
export const STANDARD_PROJECT_MAX_BPS = 5_000 as BasisPoints;

export type CapitalParameters = {
  readonly annualAmount: IdrAmount;
  readonly standardProjectMaxBps: BasisPoints;
  readonly splits: Record<MemberClass, ContributionSplitBps>;
};

/** The annual amount is announced each year, so it has no default. */
export function defaultCapitalParameters(
  annualAmount: IdrAmount,
): CapitalParameters {
  return {
    annualAmount,
    standardProjectMaxBps: STANDARD_PROJECT_MAX_BPS,
    splits: DEFAULT_SPLITS,
  };
}

export function validateCapitalParameters(
  params: CapitalParameters,
): Result<CapitalParameters> {
  const annualAmount = idr(params.annualAmount);
  if (!annualAmount.ok) return annualAmount;

  const maxBps = bps(params.standardProjectMaxBps);
  if (!maxBps.ok) return maxBps;

  for (const memberClass of MEMBER_CLASSES) {
    const split = params.splits[memberClass];

    const depositBps = bps(split.depositBps);
    if (!depositBps.ok) return depositBps;

    const projectBps = bps(split.projectBps);
    if (!projectBps.ok) return projectBps;

    if (depositBps.value + projectBps.value !== BPS_DENOMINATOR) {
      return err(`${memberClass} split must total 10000 bps`);
    }

    if (
      memberClass === MemberClass.Standard &&
      projectBps.value > maxBps.value
    ) {
      return err("Standard project share exceeds the configured cap");
    }
  }

  return ok(params);
}
