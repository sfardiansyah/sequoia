import {
  DuplicateBankAttestationIdError,
  DuplicateBankReferenceError,
  type BankAttestation,
  type BankAttestationRepository,
} from "../domain/bank-attestation";
import {
  DuplicateBankAttestationError,
  DuplicateContributionError,
  type Contribution,
  type ContributionRepository,
} from "../domain/contribution";
import type {
  ContributionYear,
  ContributionYearRepository,
} from "../domain/contribution-year";

export class InMemoryContributionYearRepository
  implements ContributionYearRepository
{
  private readonly byYear = new Map<number, ContributionYear>();

  async findByYear(year: number): Promise<ContributionYear | null> {
    return this.byYear.get(year) ?? null;
  }

  async save(year: ContributionYear): Promise<void> {
    if (this.byYear.has(year.year)) {
      throw new Error(`Duplicate contribution year: ${year.year}`);
    }

    this.byYear.set(year.year, year);
  }
}

export class InMemoryContributionRepository implements ContributionRepository {
  private readonly byId = new Map<string, Contribution>();
  private readonly byMemberYear = new Map<string, Contribution>();
  private readonly byAttestation = new Map<string, Contribution>();

  async findByMemberAndYear(
    memberId: string,
    contributionYear: number,
  ): Promise<Contribution | null> {
    return this.byMemberYear.get(`${memberId}:${contributionYear}`) ?? null;
  }

  async save(contribution: Contribution): Promise<void> {
    if (this.byId.has(contribution.id)) {
      throw new DuplicateContributionError();
    }

    const key = `${contribution.memberId}:${contribution.contributionYear}`;
    if (this.byMemberYear.has(key)) {
      throw new DuplicateContributionError();
    }
    if (this.byAttestation.has(contribution.bankAttestationId)) {
      throw new DuplicateBankAttestationError();
    }

    this.byId.set(contribution.id, contribution);
    this.byMemberYear.set(key, contribution);
    this.byAttestation.set(contribution.bankAttestationId, contribution);
  }
}

export class InMemoryBankAttestationRepository
  implements BankAttestationRepository
{
  private readonly byId = new Map<string, BankAttestation>();
  private readonly byReference = new Map<string, BankAttestation>();

  async findById(id: string): Promise<BankAttestation | null> {
    return this.byId.get(id) ?? null;
  }

  async save(attestation: BankAttestation): Promise<void> {
    if (this.byId.has(attestation.id)) {
      throw new DuplicateBankAttestationIdError();
    }
    if (this.byReference.has(attestation.bankReference)) {
      throw new DuplicateBankReferenceError();
    }

    this.byId.set(attestation.id, attestation);
    this.byReference.set(attestation.bankReference, attestation);
  }
}
