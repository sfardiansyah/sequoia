import { InMemoryNonceStore } from "./in-memory-nonce-store";
import { describeNonceStore } from "./nonce-store-contract";

describeNonceStore("InMemoryNonceStore", async () => ({
  store: new InMemoryNonceStore(),
  close: async () => {},
}));
