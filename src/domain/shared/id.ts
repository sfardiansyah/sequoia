import { nanoid } from "nanoid";

export class ID {
  id: string;

  constructor(id?: string) {
    this.id = id || nanoid();
  }

  toString = (): string => this.id;
}
