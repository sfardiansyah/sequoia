export type Issuer = {
  /** SCREAMING_SNAKE_CASE kind: MANUAL, INTERNAL, PRIVY, ... */
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
};

export interface IssuerDirectory {
  find(id: string): Promise<Issuer | null>;
}
