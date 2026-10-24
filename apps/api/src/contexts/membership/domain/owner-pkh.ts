const OWNER_PKH_PATTERN = /^[0-9a-f]{56}$/;

export class OwnerPkh {
  private constructor(readonly value: string) {}

  static parse(input: string): OwnerPkh | null {
    const value = input.trim().toLowerCase();
    return OWNER_PKH_PATTERN.test(value) ? new OwnerPkh(value) : null;
  }
}
