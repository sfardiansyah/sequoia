import { describe, expect, test } from "bun:test";
import {
  bps,
  founderRedeemableBps,
  founderVestedBps,
  idr,
  splitContribution,
  type Result,
} from "./index";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function n(value: number): number {
  return value;
}

describe("IDR amounts and basis points", () => {
  test("accepts non-negative safe integers", () => {
    expect(n(unwrap(idr(0)))).toBe(0);
    expect(n(unwrap(idr(1_000_000)))).toBe(1_000_000);
  });

  test("rejects negative and fractional amounts", () => {
    expect(idr(-1).ok).toBe(false);
    expect(idr(1.5).ok).toBe(false);
  });

  test("rejects basis points outside 0..10000", () => {
    expect(bps(0).ok).toBe(true);
    expect(bps(10_000).ok).toBe(true);
    expect(bps(10_001).ok).toBe(false);
    expect(bps(-1).ok).toBe(false);
  });
});

describe("contribution split", () => {
  test("splits a standard contribution 70/30", () => {
    const split = unwrap(splitContribution(unwrap(idr(1_000_000)), "standard"));
    expect({ deposit: n(split.deposit), project: n(split.project) }).toEqual({
      deposit: 700_000,
      project: 300_000,
    });
  });

  test("splits a founder contribution 20/80", () => {
    const split = unwrap(splitContribution(unwrap(idr(1_000_000)), "founder"));
    expect({ deposit: n(split.deposit), project: n(split.project) }).toEqual({
      deposit: 200_000,
      project: 800_000,
    });
  });

  test("assigns the rounding remainder to project capital", () => {
    const standard = unwrap(splitContribution(unwrap(idr(101)), "standard"));
    const founder = unwrap(splitContribution(unwrap(idr(101)), "founder"));

    expect({ deposit: n(standard.deposit), project: n(standard.project) }).toEqual({
      deposit: 70,
      project: 31,
    });
    expect({ deposit: n(founder.deposit), project: n(founder.project) }).toEqual({
      deposit: 20,
      project: 81,
    });
  });

  test("never loses an IDR unit", () => {
    for (const memberClass of ["standard", "founder"] as const) {
      const amount = unwrap(idr(101));
      const split = unwrap(splitContribution(amount, memberClass));
      expect(n(split.deposit) + n(split.project)).toBe(n(amount));
    }
  });
});

describe("founder vesting", () => {
  test("has no vesting before the first annual tranche", () => {
    expect(n(unwrap(founderVestedBps(0)))).toBe(0);
    expect(n(unwrap(founderVestedBps(36)))).toBe(0);
    expect(n(unwrap(founderVestedBps(47)))).toBe(0);
  });

  test("vests 50% at each annual tranche", () => {
    expect(n(unwrap(founderVestedBps(48)))).toBe(5_000);
    expect(n(unwrap(founderVestedBps(60)))).toBe(10_000);
    expect(n(unwrap(founderVestedBps(100)))).toBe(10_000);
  });

  test("rejects invalid month values", () => {
    expect(founderVestedBps(-1).ok).toBe(false);
    expect(founderVestedBps(1.5).ok).toBe(false);
  });

  test("only releases the unredeemed vested amount", () => {
    expect(n(unwrap(founderRedeemableBps(48, unwrap(bps(0)))))).toBe(5_000);
    expect(n(unwrap(founderRedeemableBps(48, unwrap(bps(5_000)))))).toBe(0);
    expect(n(unwrap(founderRedeemableBps(60, unwrap(bps(5_000)))))).toBe(5_000);
    expect(founderRedeemableBps(48, unwrap(bps(6_000))).ok).toBe(false);
  });
});
