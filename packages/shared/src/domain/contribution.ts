import { contributionSplitFor, type MemberClass } from "./member-class";
import { BPS_DENOMINATOR, bps, type IdrAmount } from "./money";
import { err, ok, type Result } from "./result";

export type ContributionSplit = {
  readonly deposit: IdrAmount;
  readonly project: IdrAmount;
};

export function splitContribution(
  amount: IdrAmount,
  memberClass: MemberClass,
): Result<ContributionSplit> {
  const split = contributionSplitFor(memberClass);

  const depositBps = bps(split.depositBps);
  if (!depositBps.ok) return depositBps;

  const projectBps = bps(split.projectBps);
  if (!projectBps.ok) return projectBps;

  if (depositBps.value + projectBps.value !== BPS_DENOMINATOR) {
    return err("Contribution split must total 10000 bps");
  }

  const deposit = Math.floor(
    (amount * depositBps.value) / BPS_DENOMINATOR,
  ) as IdrAmount;

  return ok({
    deposit,
    project: (amount - deposit) as IdrAmount,
  });
}
