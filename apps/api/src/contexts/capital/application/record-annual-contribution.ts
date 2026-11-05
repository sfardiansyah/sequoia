import { err, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import type { UnitOfWork } from "../../../shared/persistence/unit-of-work";
import type { BankAttestationRepository } from "../domain/bank-attestation";
import {
  Contribution,
  ContributionSource,
  DuplicateBankAttestationError,
  DuplicateContributionError,
  UnknownContributionMemberError,
  type ContributionError,
  type ContributionRepository,
} from "../domain/contribution";
import type { ContributionYearRepository } from "../domain/contribution-year";
import type { ContributionEligibility } from "../domain/ports/contribution-eligibility";
import type { CapitalWriteScope } from "./write-scope";

export type RecordAnnualContributionCommand = {
  readonly memberId: string;
  readonly contributionYear: number;
  readonly bankAttestationId: string;
  readonly recordedAt: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class RecordAnnualContribution {
  constructor(
    private readonly contributions: ContributionRepository,
    private readonly years: ContributionYearRepository,
    private readonly attestations: BankAttestationRepository,
    private readonly eligibility: ContributionEligibility,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: UnitOfWork<CapitalWriteScope>,
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

    const bankAttestationId = command.bankAttestationId.trim();
    if (!bankAttestationId) return err({ code: "INVALID_ATTESTATION" });

    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

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

    let attestation;
    try {
      attestation = await this.attestations.findById(bankAttestationId);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (!attestation) return err({ code: "ATTESTATION_NOT_FOUND" });

    if (
      attestation.memberId !== memberId ||
      attestation.contributionYear !== year.year ||
      attestation.amount !== year.annualAmount
    ) {
      return err({ code: "ATTESTATION_MISMATCH" });
    }

    let existing: Contribution | null;
    try {
      existing = await this.contributions.findByMemberAndYear(
        memberId,
        year.year,
      );
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (existing) return err({ code: "ALREADY_RECORDED" });

    let used: Contribution | null;
    try {
      used = await this.contributions.findByBankAttestationId(
        bankAttestationId,
      );
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (used) return err({ code: "ATTESTATION_ALREADY_USED" });

    const contribution = Contribution.record({
      id: this.ids.next(),
      memberId,
      contributionYear: year.year,
      bankAttestationId,
      source: ContributionSource.Pilot,
      chainTx: null,
      annualAmount: year.annualAmount,
      split: year.split,
      recordedAt: command.recordedAt,
    });
    if (!contribution.ok) return contribution;

    try {
      await this.unitOfWork.run(async (write) => {
        await write.contributions.save(contribution.value);
        await write.audit.record({
          actor,
          action: AUDIT_ACTIONS.contributionRecorded,
          entityType: AUDIT_ENTITY_TYPES.contribution,
          entityId: contribution.value.id,
          detail: null,
          occurredAt: contribution.value.recordedAt,
        });
      });
    } catch (cause) {
      if (cause instanceof DuplicateContributionError) {
        return err({ code: "ALREADY_RECORDED" });
      }
      if (cause instanceof DuplicateBankAttestationError) {
        return err({ code: "ATTESTATION_ALREADY_USED" });
      }
      if (cause instanceof UnknownContributionMemberError) {
        return err({ code: "MEMBER_NOT_FOUND" });
      }
      return err(unexpected(cause));
    }

    return contribution;
  }
}
