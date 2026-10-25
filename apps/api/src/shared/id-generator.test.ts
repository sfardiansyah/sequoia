import { describe, expect, test } from "bun:test";
import { UuidGenerator } from "./id-generator";

describe("UuidGenerator", () => {
  test("generates unique UUIDs", () => {
    const ids = new UuidGenerator();
    const first = ids.next();
    const second = ids.next();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});
