import { describe, expect, test } from "bun:test";
import {
  bps,
  defaultCapitalParameters,
  defaultSplitFor,
  founderRedeemableBps,
  founderVestedBps,
  idr,
  isMemberClass,
  splitContribution,
  validateCapitalParameters,
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
    const split = unwrap(
      splitContribution(unwrap(idr(1_000_000)), defaultSplitFor("STANDARD")),
    );
    expect({
      memberCapital: split.memberCapital,
      capitalParticipation: split.capitalParticipation,
    }).toEqual({
      memberCapital: 700_000n,
      capitalParticipation: 300_000n,
    });
  });

  test("splits a founder contribution 70/30", () => {
    const split = unwrap(
      splitContribution(unwrap(idr(1_000_000)), defaultSplitFor("FOUNDER")),
    );
    expect({
      memberCapital: split.memberCapital,
      capitalParticipation: split.capitalParticipation,
    }).toEqual({
      memberCapital: 700_000n,
      capitalParticipation: 300_000n,
    });
  });

  test("assigns the rounding remainder to Capital Participation", () => {
    const standard = unwrap(
      splitContribution(unwrap(idr(101)), defaultSplitFor("STANDARD")),
    );
    const founder = unwrap(
      splitContribution(unwrap(idr(101)), defaultSplitFor("FOUNDER")),
    );

    expect({
      memberCapital: standard.memberCapital,
      capitalParticipation: standard.capitalParticipation,
    }).toEqual({
      memberCapital: 70n,
      capitalParticipation: 31n,
    });
    expect({
      memberCapital: founder.memberCapital,
      capitalParticipation: founder.capitalParticipation,
    }).toEqual({
      memberCapital: 70n,
      capitalParticipation: 31n,
    });
  });

  test("keeps exact units for large IDR amounts", () => {
    const amount = unwrap(idr(1_000_000_000_000_000));
    const split = unwrap(
      splitContribution(amount, defaultSplitFor("STANDARD")),
    );

    expect(split.memberCapital).toBe(700_000_000_000_000n);
    expect(split.capitalParticipation).toBe(300_000_000_000_000n);
  });

  test("never loses an IDR unit", () => {
    for (const memberClass of ["STANDARD", "FOUNDER"] as const) {
      const amount = unwrap(idr(101));
      const split = unwrap(splitContribution(amount, defaultSplitFor(memberClass)));
      expect(split.memberCapital + split.capitalParticipation).toBe(
        BigInt(amount),
      );
    }
  });

  test("rejects a split that does not total 10000 bps", () => {
    const split = splitContribution(unwrap(idr(100)), {
      memberCapitalBps: 7_000,
      capitalParticipationBps: 2_000,
    });
    expect(split.ok).toBe(false);
  });
});

describe("capital parameters", () => {
  const annualAmount = unwrap(idr(1_000_000));

  test("accepts the defaults for the year's annual amount", () => {
    const params = defaultCapitalParameters(annualAmount);
    expect(n(unwrap(validateCapitalParameters(params)).annualAmount)).toBe(
      n(annualAmount),
    );
  });

  test("rejects a standard Capital Participation share above the governance cap", () => {
    const params = defaultCapitalParameters(annualAmount);
    const result = validateCapitalParameters({
      ...params,
      splits: {
        ...params.splits,
        STANDARD: { memberCapitalBps: 4_000, capitalParticipationBps: 6_000 },
      },
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a founder split that does not total 10000 bps", () => {
    const params = defaultCapitalParameters(annualAmount);
    const result = validateCapitalParameters({
      ...params,
      splits: {
        ...params.splits,
        FOUNDER: { memberCapitalBps: 7_000, capitalParticipationBps: 2_000 },
      },
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a non-integer annual amount", () => {
    const result = validateCapitalParameters({
      ...defaultCapitalParameters(annualAmount),
      annualAmount: 1.5 as typeof annualAmount,
    });
    expect(result.ok).toBe(false);
  });
});

describe("member class", () => {
  test("accepts only declared classes", () => {
    expect(isMemberClass("STANDARD")).toBe(true);
    expect(isMemberClass("FOUNDER")).toBe(true);
    expect(isMemberClass("standard")).toBe(false);
    expect(isMemberClass("admin")).toBe(false);
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
