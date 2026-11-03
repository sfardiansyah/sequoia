import { describe, expect, test } from "bun:test";
import { resolveOperator } from "./operator";

describe("resolveOperator", () => {
  test("accepts a lower-case slug", () => {
    expect(resolveOperator({ SEQUOIA_OPERATOR: " board-ops " })).toBe(
      "board-ops",
    );
  });

  test("rejects a missing or mixed-case operator", () => {
    expect(() => resolveOperator({})).toThrow(/SEQUOIA_OPERATOR/);
    expect(() => resolveOperator({ SEQUOIA_OPERATOR: "Ray Nord" })).toThrow(
      /lower-case slug/,
    );
  });
});
