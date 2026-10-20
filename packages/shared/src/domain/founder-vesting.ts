import { bps, type BasisPoints } from "./money";
import { err, ok, type Result } from "./result";

export const FOUNDER_CLIFF_MONTHS = 36;
export const FOUNDER_CONVERSION_MONTH = 60;

export type VestingTranche = {
  readonly atMonth: number;
  readonly cumulativeBps: BasisPoints;
};

const asBps = (value: number): BasisPoints => value as BasisPoints;

export const FOUNDER_VESTING: readonly VestingTranche[] = [
  { atMonth: 48, cumulativeBps: asBps(5_000) },
  { atMonth: 60, cumulativeBps: asBps(10_000) },
];

export function founderVestedBps(
  monthsSinceJoin: number,
): Result<BasisPoints> {
  if (!Number.isInteger(monthsSinceJoin) || monthsSinceJoin < 0) {
    return err("Months since join must be a non-negative integer");
  }

  let vested = 0;

  for (const tranche of FOUNDER_VESTING) {
    if (monthsSinceJoin >= tranche.atMonth) {
      vested = tranche.cumulativeBps;
    }
  }

  return bps(vested);
}

export function founderRedeemableBps(
  monthsSinceJoin: number,
  alreadyRedeemed: BasisPoints,
): Result<BasisPoints> {
  const vested = founderVestedBps(monthsSinceJoin);
  if (!vested.ok) return vested;

  const redeemable = vested.value - alreadyRedeemed;

  if (redeemable < 0) {
    return err("Already redeemed exceeds vested founder capital");
  }

  return bps(redeemable);
}
