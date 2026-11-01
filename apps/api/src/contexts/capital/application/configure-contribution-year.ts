import { err, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import {
  ContributionYear,
  type ContributionYearError,
  type ContributionYearRepository,
} from "../domain/contribution-year";

export type ConfigureContributionYearCommand = {
  readonly year: number;
  readonly annualAmount: number;
  readonly memberCapitalBps: number;
  readonly capitalParticipationBps: number;
  readonly standardCapitalParticipationMaxBps: number;
  readonly createdAt: number;
};

export class ConfigureContributionYear {
  constructor(private readonly years: ContributionYearRepository) {}

  async execute(
    command: ConfigureContributionYearCommand,
  ): Promise<Result<ContributionYear, ContributionYearError>> {
    const year = ContributionYear.configure(command);
    if (!year.ok) return year;

    let existing: ContributionYear | null;
    try {
      existing = await this.years.findByYear(year.value.year);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (existing) return err({ code: "YEAR_ALREADY_CONFIGURED" });

    try {
      await this.years.save(year.value);
    } catch (cause) {
      return err(unexpected(cause));
    }

    return year;
  }
}
