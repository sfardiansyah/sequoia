import { err, ok, type Result } from "./result";

export type IdrAmount = number & { readonly __brand: "IdrAmount" };
export type BasisPoints = number & { readonly __brand: "BasisPoints" };

export const BPS_DENOMINATOR = 10_000;

export function idr(value: number): Result<IdrAmount> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return err("IDR amount must be a non-negative safe integer");
  }

  return ok(value as IdrAmount);
}

export function bps(value: number): Result<BasisPoints> {
  if (!Number.isInteger(value) || value < 0 || value > BPS_DENOMINATOR) {
    return err("Basis points must be an integer between 0 and 10000");
  }

  return ok(value as BasisPoints);
}

export function applyBps(amount: IdrAmount, points: BasisPoints): IdrAmount {
  return Math.floor((amount * points) / BPS_DENOMINATOR) as IdrAmount;
}

export function addIdr(a: IdrAmount, b: IdrAmount): Result<IdrAmount> {
  return idr(a + b);
}
