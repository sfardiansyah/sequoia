import type { Issuer, IssuerDirectory } from "../domain/issuer";
import {
  KycAttestation,
  type KycAttestationRepository,
} from "../domain/kyc-attestation";

export class InMemoryKycAttestationRepository
  implements KycAttestationRepository
{
  private readonly byId = new Map<string, KycAttestation>();

  async findById(id: string): Promise<KycAttestation | null> {
    return this.byId.get(id) ?? null;
  }

  async save(attestation: KycAttestation): Promise<void> {
    // Mirrors kyc_attestations_one_active so the contract test means something.
    for (const existing of this.byId.values()) {
      if (
        existing.id !== attestation.id &&
        existing.subjectPkh.value === attestation.subjectPkh.value &&
        existing.status === "ACTIVE" &&
        attestation.status === "ACTIVE"
      ) {
        throw new Error(
          `Duplicate active attestation: ${attestation.subjectPkh.value}`,
        );
      }
    }

    this.byId.set(attestation.id, attestation);
  }

  async saveIssued(attestation: KycAttestation): Promise<void> {
    for (const [id, existing] of this.byId) {
      if (
        existing.subjectPkh.value === attestation.subjectPkh.value &&
        existing.status === "ACTIVE"
      ) {
        this.byId.set(id, existing.supersede());
      }
    }

    await this.save(attestation);
  }

  async list(filter: {
    subjectPkh?: string;
    expiresBefore?: number;
  } = {}): Promise<KycAttestation[]> {
    return [...this.byId.values()]
      .filter(
        (attestation) =>
          (filter.subjectPkh === undefined ||
            attestation.subjectPkh.value === filter.subjectPkh) &&
          (filter.expiresBefore === undefined ||
            attestation.expiresAt < filter.expiresBefore),
      )
      .sort((left, right) => right.issuedAt - left.issuedAt);
  }
}

export class InMemoryIssuerDirectory implements IssuerDirectory {
  private readonly byId = new Map<string, Issuer>();

  constructor(issuers: readonly Issuer[] = [
    { id: "MANUAL", name: "Manual", active: true },
    { id: "INTERNAL", name: "Internal", active: true },
  ]) {
    for (const issuer of issuers) this.byId.set(issuer.id, issuer);
  }

  async find(id: string): Promise<Issuer | null> {
    return this.byId.get(id) ?? null;
  }
}
