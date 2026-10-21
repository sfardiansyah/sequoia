import { describe, expect, test } from "bun:test";
import { InMemoryRateLimiter } from "./adapters/in-memory-rate-limiter";

describe("InMemoryRateLimiter", () => {
  test("limits requests per window and resets", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter(2, 1_000, () => now);

    expect(limiter.allow("nonce:addr")).toBe(true);
    expect(limiter.allow("nonce:addr")).toBe(true);
    expect(limiter.allow("nonce:addr")).toBe(false);
    expect(limiter.allow("nonce:other")).toBe(true);

    now += 1_001;
    expect(limiter.allow("nonce:addr")).toBe(true);
  });
});
