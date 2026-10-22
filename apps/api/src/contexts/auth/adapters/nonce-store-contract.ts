import { describe, expect, test } from "bun:test";
import type { NonceStore } from "../types";

export type NonceStoreHarness = {
  store: NonceStore;
  close: () => Promise<void>;
};

export function describeNonceStore(
  name: string,
  create: () => Promise<NonceStoreHarness>,
): void {
  describe(name, () => {
    test("consumes a nonce once for the bound address", async () => {
      const { store, close } = await create();

      try {
        await store.create({
          nonce: "nonce-1",
          address: "addr_test1-member",
          expiresAt: 1_000,
        });

        expect(
          await store.consume({
            nonce: "nonce-1",
            address: "addr_test1-member",
            now: 999,
          }),
        ).toBe(true);
        expect(
          await store.consume({
            nonce: "nonce-1",
            address: "addr_test1-member",
            now: 999,
          }),
        ).toBe(false);
      } finally {
        await close();
      }
    });

    test("leaves a nonce intact for a different address", async () => {
      const { store, close } = await create();

      try {
        await store.create({
          nonce: "nonce-2",
          address: "addr_test1-member",
          expiresAt: 1_000,
        });

        expect(
          await store.consume({
            nonce: "nonce-2",
            address: "addr_test1-other",
            now: 999,
          }),
        ).toBe(false);
        expect(
          await store.consume({
            nonce: "nonce-2",
            address: "addr_test1-member",
            now: 999,
          }),
        ).toBe(true);
      } finally {
        await close();
      }
    });

    test("rejects expired and unknown nonces", async () => {
      const { store, close } = await create();

      try {
        await store.create({
          nonce: "nonce-3",
          address: "addr_test1-member",
          expiresAt: 1_000,
        });

        expect(
          await store.consume({
            nonce: "nonce-3",
            address: "addr_test1-member",
            now: 1_001,
          }),
        ).toBe(false);
        expect(
          await store.consume({
            nonce: "unknown",
            address: "addr_test1-member",
            now: 999,
          }),
        ).toBe(false);
      } finally {
        await close();
      }
    });
  });
}
