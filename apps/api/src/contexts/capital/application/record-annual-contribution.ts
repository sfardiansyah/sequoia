import { err, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import {
  Contribution,
  DuplicateContributionError,
  UnknownContributionMemberError,
  type ContributionError,
  type ContributionRepository,
} from "../domain/contribution";
import type { ContributionYearRepository } from "../domain/contribution-year";
import type { ContributionEligibility } from "../domain/ports/contribution-eligibility";

export type RecordAnnualContributionCommand = {
  readonly memberId: string;
  readonly contributionYear: number;
  readonly recordedAt: number;
};

export class RecordAnnualContribution {
  constructor(
    private readonly contributions: ContributionRepository,
    private readonly years: ContributionYearRepository,
    private readonly eligibility: ContributionEligibility,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    command: RecordAnnualContributionCommand,
  ): Promise<Result<Contribution, ContributionError>> {
    if (
      !Number.isInteger(command.contributionYear) ||
      command.contributionYear <= 0
    ) {
      return err({ code: "INVALID_YEAR" });
    }

    const memberId = command.memberId.trim();
    if (!memberId) return err({ code: "INVALID_MEMBER" });
    if (!Number.isInteger(command.recordedAt) || command.recordedAt < 0) {
      return err({ code: "INVALID_TIME" });
    }

    let year;
    try {
      year = await this.years.findByYear(command.contributionYear);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (!year) return err({ code: "YEAR_NOT_CONFIGURED" });

    let failure;
    try {
      failure = await this.eligibility.check({
        memberId,
        // KYC must be valid now even when an admin backfills recordedAt.
        at: Math.max(command.recordedAt, Date.now()),
      });
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (failure) return err({ code: failure });

    const contribution = Contribution.record({
      id: this.ids.next(),
      memberId,
      contributionYear: year.year,
      annualAmount: year.annualAmount,
      split: year.split,
      recordedAt: command.recordedAt,
    });
    if (!contribution.ok) return contribution;

    let existing: Contribution | null;
    try {
      existing = await this.contributions.findByMemberAndYear(
        contribution.value.memberId,
        contribution.value.contributionYear,
      );
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (existing) return err({ code: "ALREADY_RECORDED" });

    try {
      await this.contributions.save(contribution.value);
    } catch (cause) {
      if (cause instanceof DuplicateContributionError) {
        return err({ code: "ALREADY_RECORDED" });
      }
      if (cause instanceof UnknownContributionMemberError) {
        return err({ code: "MEMBER_NOT_FOUND" });
      }
      return err(unexpected(cause));
    }

    return contribution;
  }
}
