const SUBJECT_PKH_PATTERN = /^[0-9a-f]{56}$/;

export class SubjectPkh {
  private constructor(readonly value: string) {}

  static parse(input: string): SubjectPkh | null {
    const value = input.trim().toLowerCase();
    return SUBJECT_PKH_PATTERN.test(value) ? new SubjectPkh(value) : null;
  }
}
