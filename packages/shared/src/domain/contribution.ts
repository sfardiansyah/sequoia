import type { ContributionSplitBps } from "./member-class";
import { BPS_DENOMINATOR, bps, type IdrAmount } from "./money";
import { err, ok, type Result } from "./result";

export type ContributionSplit = {
  readonly deposit: IdrAmount;
  readonly project: IdrAmount;
};

/**
 * The split is passed in, never looked up: a governance vote can change it, so
 * the caller owns the parameters and snapshots the bps it used per contribution.
 */
export function splitContribution(
  amount: IdrAmount,
  split: ContributionSplitBps,
): Result<ContributionSplit> {
  const depositBps = bps(split.depositBps);
  if (!depositBps.ok) return depositBps;

  const projectBps = bps(split.projectBps);
  if (!projectBps.ok) return projectBps;

  if (depositBps.value + projectBps.value !== BPS_DENOMINATOR) {
    return err("Contribution split must total 10000 bps");
  }

  // Floor the refundable deposit: the remainder goes to at-risk capital, so an
  // odd amount never over-promises a refund.
  const deposit = Math.floor(
    (amount * depositBps.value) / BPS_DENOMINATOR,
  ) as IdrAmount;

  return ok({
    deposit,
    project: (amount - deposit) as IdrAmount,
  });
}
