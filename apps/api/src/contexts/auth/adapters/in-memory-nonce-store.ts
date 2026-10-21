import type { NonceStore } from "../types";

export class InMemoryNonceStore implements NonceStore {
  private readonly entries = new Map<
    string,
    { address: string; expiresAt: number }
  >();

  async create(input: {
    nonce: string;
    address: string;
    expiresAt: number;
  }): Promise<void> {
    this.entries.set(input.nonce, {
      address: input.address,
      expiresAt: input.expiresAt,
    });
  }

  async consume(input: {
    nonce: string;
    address: string;
    now: number;
  }): Promise<boolean> {
    const entry = this.entries.get(input.nonce);
    if (entry) this.entries.delete(input.nonce);

    return Boolean(
      entry && entry.address === input.address && entry.expiresAt >= input.now,
    );
  }
}
