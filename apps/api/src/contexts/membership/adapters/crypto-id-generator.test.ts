import { describe, expect, test } from "bun:test";
import { CryptoIdGenerator } from "./crypto-id-generator";

describe("CryptoIdGenerator", () => {
  test("generates unique UUIDs", () => {
    const ids = new CryptoIdGenerator();
    const first = ids.next();
    const second = ids.next();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});
