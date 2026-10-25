import { randomUUID } from "node:crypto";

export interface IdGenerator {
  next(): string;
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/** Deterministic ids for tests; never used by composition. */
export class SequentialIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix = "id") {}

  next(): string {
    return `${this.prefix}-${this.nextId++}`;
  }
}
