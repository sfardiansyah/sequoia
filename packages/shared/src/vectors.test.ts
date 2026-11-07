import { describe, expect, test } from "bun:test";
import vectors from "../vectors/aiken.json";
import {
  founderVestedBps,
  idr,
  splitContribution,
  type Result,
} from "./index";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("shared Aiken test vectors", () => {
  test("split vectors match @sequoia/shared", () => {
    for (const vector of vectors.split) {
      const split = unwrap(
        splitContribution(unwrap(idr(vector.amount)), {
          memberCapitalBps: vector.memberCapitalBps,
          capitalParticipationBps: vector.capitalParticipationBps,
        }),
      );

      expect({
        amount: vector.amount,
        memberCapital: split.memberCapital.toString(),
        capitalParticipation: split.capitalParticipation.toString(),
      }).toEqual({
        amount: vector.amount,
        memberCapital: String(vector.memberCapital),
        capitalParticipation: String(vector.capitalParticipation),
      });
    }
  });

  test("vesting vectors match @sequoia/shared", () => {
    for (const vector of vectors.vesting) {
      expect({
        months: vector.months,
        vestedBps: Number(unwrap(founderVestedBps(vector.months))),
      }).toEqual(vector);
    }
  });
});
