import {
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

    this.byId.set(contribution.id, contribution);
    this.byMemberYear.set(key, contribution);
  }
}
