import {
  BPS_DENOMINATOR,
  DEFAULT_SPLITS,
  MemberClass,
  STANDARD_CAPITAL_PARTICIPATION_MAX_BPS,
  bps,
  err,
  idr,
  ok,
  type BasisPoints,
  type ContributionSplitBps,
  type IdrAmount,
  type Result,
} from "@sequoia/shared";
import type { UnexpectedError } from "../../../shared/errors";

const PILOT_SPLIT = DEFAULT_SPLITS[MemberClass.Standard];

export class DuplicateContributionYearError extends Error {
  constructor() {
    super("Contribution year already configured");
    this.name = "DuplicateContributionYearError";
  }
}

export type ContributionYearError =
  | { readonly code: "INVALID_YEAR" }
  | { readonly code: "INVALID_APPROVAL_REF" }
  | { readonly code: "INVALID_AMOUNT" }
  | { readonly code: "INVALID_SPLIT" }
  | { readonly code: "INVALID_CAP" }
  | { readonly code: "INVALID_TIME" }
  | { readonly code: "INVALID_ACTOR" }
  | { readonly code: "YEAR_ALREADY_CONFIGURED" }
  | UnexpectedError;

export class ContributionYear {
  private constructor(
    readonly year: number,
    readonly approvalRef: string,
    readonly annualAmount: IdrAmount,
    readonly memberCapitalBps: BasisPoints,
    readonly capitalParticipationBps: BasisPoints,
    readonly standardCapitalParticipationMaxBps: BasisPoints,
    readonly createdAt: number,
  ) {}

  get split(): ContributionSplitBps {
    return {
      memberCapitalBps: this.memberCapitalBps,
      capitalParticipationBps: this.capitalParticipationBps,
    };
  }

  static configure(input: {
    year: number;
    approvalRef: string;
    annualAmount: number;
    memberCapitalBps: number;
    capitalParticipationBps: number;
    standardCapitalParticipationMaxBps: number;
    createdAt: number;
  }): Result<ContributionYear, ContributionYearError> {
    if (!Number.isInteger(input.year) || input.year <= 0) {
      return err({ code: "INVALID_YEAR" });
    }

    const approvalRef = input.approvalRef.trim();
    if (!approvalRef) return err({ code: "INVALID_APPROVAL_REF" });

    const annualAmount = idr(input.annualAmount);
    if (!annualAmount.ok || annualAmount.value <= 0) {
      return err({ code: "INVALID_AMOUNT" });
    }

    const memberCapitalBps = bps(input.memberCapitalBps);
    if (!memberCapitalBps.ok) return err({ code: "INVALID_SPLIT" });

    const capitalParticipationBps = bps(input.capitalParticipationBps);
    if (!capitalParticipationBps.ok) return err({ code: "INVALID_SPLIT" });

    const maxBps = bps(input.standardCapitalParticipationMaxBps);
    if (!maxBps.ok) return err({ code: "INVALID_CAP" });

    // Plan §3.2: the share is capped at 50% by governance. The cap travels with
    // the year but it cannot raise the ceiling.
    if (maxBps.value > STANDARD_CAPITAL_PARTICIPATION_MAX_BPS) {
      return err({ code: "INVALID_CAP" });
    }

    if (
      memberCapitalBps.value + capitalParticipationBps.value !==
      BPS_DENOMINATOR
    ) {
      return err({ code: "INVALID_SPLIT" });
    }

    if (capitalParticipationBps.value > maxBps.value) {
      return err({ code: "INVALID_CAP" });
    }

    // The pilot pins the plan's 70/30 split in the domain, not only in the CLI.
    if (
      memberCapitalBps.value !== PILOT_SPLIT.memberCapitalBps ||
      capitalParticipationBps.value !== PILOT_SPLIT.capitalParticipationBps
    ) {
      return err({ code: "INVALID_SPLIT" });
    }

    if (!Number.isInteger(input.createdAt) || input.createdAt < 0) {
      return err({ code: "INVALID_TIME" });
    }

    return ok(
      new ContributionYear(
        input.year,
        approvalRef,
        annualAmount.value,
        memberCapitalBps.value,
        capitalParticipationBps.value,
        maxBps.value,
        input.createdAt,
      ),
    );
  }

  static rehydrate(input: {
    year: number;
    approvalRef: string;
    annualAmount: number;
    memberCapitalBps: number;
    capitalParticipationBps: number;
    standardCapitalParticipationMaxBps: number;
    createdAt: number;
  }): Result<ContributionYear, ContributionYearError> {
    return ContributionYear.configure(input);
  }
}

export interface ContributionYearRepository {
  findByYear(year: number): Promise<ContributionYear | null>;
  save(year: ContributionYear): Promise<void>;
}
