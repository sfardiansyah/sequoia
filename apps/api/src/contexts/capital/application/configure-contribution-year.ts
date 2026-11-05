import { err, ok, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import { unexpected } from "../../../shared/errors";
import type { UnitOfWork } from "../../../shared/persistence/unit-of-work";
import {
  ContributionYear,
  type ContributionYearError,
} from "../domain/contribution-year";
import type { CapitalWriteScope } from "./write-scope";

export type ConfigureContributionYearCommand = {
  readonly year: number;
  readonly approvalRef: string;
  readonly annualAmount: number;
  readonly memberCapitalBps: number;
  readonly capitalParticipationBps: number;
  readonly standardCapitalParticipationMaxBps: number;
  readonly createdAt: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class ConfigureContributionYear {
  constructor(private readonly unitOfWork: UnitOfWork<CapitalWriteScope>) {}

  async execute(
    command: ConfigureContributionYearCommand,
  ): Promise<Result<ContributionYear, ContributionYearError>> {
    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

    const year = ContributionYear.configure(command);
    if (!year.ok) return year;

    try {
      return await this.unitOfWork.run<
        Result<ContributionYear, ContributionYearError>
      >(async (write) => {
        const existing = await write.years.findByYear(year.value.year);
        if (existing) return err({ code: "YEAR_ALREADY_CONFIGURED" });

        await write.years.save(year.value);
        await write.audit.record({
          actor,
          action: AUDIT_ACTIONS.contributionYearConfigured,
          entityType: AUDIT_ENTITY_TYPES.contributionYear,
          entityId: String(year.value.year),
          detail: year.value.approvalRef,
          occurredAt: year.value.createdAt,
        });

        return ok(year.value);
      });
    } catch (cause) {
      return err(unexpected(cause));
    }
  }
}
