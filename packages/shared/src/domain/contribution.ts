import type { ContributionSplitBps } from "./member-class";
import { BPS_DENOMINATOR, bps, type IdrAmount } from "./money";
import { err, ok, type Result } from "./result";

export type ContributionSplit = {
  readonly memberCapital: bigint;
  readonly capitalParticipation: bigint;
};

/**
 * The split is passed in, never looked up: a governance vote can change it, so
 * the caller owns the parameters and snapshots the bps it used per contribution.
 */
export function splitContribution(
  amount: IdrAmount,
  split: ContributionSplitBps,
): Result<ContributionSplit> {
  const memberCapitalBps = bps(split.memberCapitalBps);
  if (!memberCapitalBps.ok) return memberCapitalBps;

  const capitalParticipationBps = bps(split.capitalParticipationBps);
  if (!capitalParticipationBps.ok) return capitalParticipationBps;

  if (
    memberCapitalBps.value + capitalParticipationBps.value !== BPS_DENOMINATOR
  ) {
    return err("Contribution split must total 10000 bps");
  }

  // Floor Member Capital: the remainder goes to at-risk Capital Participation,
  // so an odd amount never over-promises redemption.
  const amountUnits = BigInt(amount);
  const memberCapital =
    (amountUnits * BigInt(memberCapitalBps.value)) / BigInt(BPS_DENOMINATOR);

  return ok({
    memberCapital,
    capitalParticipation: amountUnits - memberCapital,
  });
}
