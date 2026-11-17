import { expect, test } from "bun:test";
import { isTimestampOnlyLockDiff } from "./check-contracts";

const line = (seconds: number) =>
  `"aiken-lang/fuzz@v3" = [{ secs_since_epoch = ${seconds}, nanos_since_epoch = 576230381 }, "e50b4b551afc5ca73975315ef1e73e587f73fe0570396ecc58e293d512e62f30"]`;

const diff = (before: string, after: string) =>
  `diff --git a/contracts/aiken.lock b/contracts/aiken.lock\n--- a/contracts/aiken.lock\n+++ b/contracts/aiken.lock\n-${before}\n+${after}\n`;

test("accepts a fuzz etag timestamp refresh", () => {
  expect(isTimestampOnlyLockDiff(diff(line(1794066843), line(1794927361)))).toBe(
    true,
  );
});

test("rejects a changed dependency hash", () => {
  const changed = line(1794927361).replace(
    "e50b4b551afc5ca73975315ef1e73e587f73fe0570396ecc58e293d512e62f30",
    "00",
  );

  expect(isTimestampOnlyLockDiff(diff(line(1794066843), changed))).toBe(false);
});

test("rejects unrelated lock changes", () => {
  expect(isTimestampOnlyLockDiff(diff(line(1794066843), '"other" = 1'))).toBe(
    false,
  );
});
