import {
  DuplicateOwnerPkhError,
  type Member,
  type MemberRepository,
} from "../domain/member";
import type { OwnerPkh } from "../domain/owner-pkh";
import type {
  KycEligibility,
  KycEligibilityFailure,
} from "../domain/ports/kyc-eligibility";

export class InMemoryMemberRepository implements MemberRepository {
  private readonly byId = new Map<string, Member>();
  private readonly byOwner = new Map<string, Member>();

  async findById(id: string): Promise<Member | null> {
    return this.byId.get(id) ?? null;
  }

  async findByOwnerPkh(ownerPkh: OwnerPkh): Promise<Member | null> {
    return this.byOwner.get(ownerPkh.value) ?? null;
  }

  async save(member: Member): Promise<void> {
    const existing = this.byOwner.get(member.ownerPkh.value);
    if (existing && existing.id !== member.id) {
      throw new DuplicateOwnerPkhError();
    }

    this.byId.set(member.id, member);
    this.byOwner.set(member.ownerPkh.value, member);
  }
}

export class InMemoryKycEligibility implements KycEligibility {
  private readonly attestations = new Map<
    string,
    { subjectPkh: string; failure: KycEligibilityFailure | null }
  >();

  eligible(subjectPkh: string, attestationId: string): this {
    this.attestations.set(attestationId, { subjectPkh, failure: null });
    return this;
  }

  failing(
    attestationId: string,
    failure: KycEligibilityFailure,
    subjectPkh: string,
  ): this {
    this.attestations.set(attestationId, { subjectPkh, failure });
    return this;
  }

  async check(input: {
    readonly subjectPkh: string;
    readonly attestationId: string;
    readonly at: number;
  }): Promise<KycEligibilityFailure | null> {
    const attestation = this.attestations.get(input.attestationId);
    if (!attestation) return "NOT_FOUND";
    if (attestation.subjectPkh !== input.subjectPkh) return "MISMATCH";
    return attestation.failure;
  }

  async checkCurrent(input: {
    readonly subjectPkh: string;
    readonly at: number;
  }): Promise<KycEligibilityFailure | null> {
    for (const attestation of this.attestations.values()) {
      if (attestation.subjectPkh === input.subjectPkh) {
        return attestation.failure;
      }
    }

    return "NOT_FOUND";
  }
}
