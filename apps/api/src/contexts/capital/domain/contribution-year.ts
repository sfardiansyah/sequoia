import {
  BPS_DENOMINATOR,
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

export type ContributionYearError =
  | { readonly code: "INVALID_YEAR" }
  | { readonly code: "INVALID_AMOUNT" }
  | { readonly code: "INVALID_SPLIT" }
  | { readonly code: "INVALID_CAP" }
  | { readonly code: "INVALID_TIME" }
  | { readonly code: "YEAR_ALREADY_CONFIGURED" }
  | UnexpectedError;

export class ContributionYear {
  private constructor(
    readonly year: number,
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
    annualAmount: number;
    memberCapitalBps: number;
    capitalParticipationBps: number;
    standardCapitalParticipationMaxBps: number;
    createdAt: number;
  }): Result<ContributionYear, ContributionYearError> {
    if (!Number.isInteger(input.year) || input.year <= 0) {
      return err({ code: "INVALID_YEAR" });
    }

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

    if (
      memberCapitalBps.value + capitalParticipationBps.value !==
      BPS_DENOMINATOR
    ) {
      return err({ code: "INVALID_SPLIT" });
    }

    if (capitalParticipationBps.value > maxBps.value) {
      return err({ code: "INVALID_CAP" });
    }

    if (!Number.isInteger(input.createdAt) || input.createdAt < 0) {
      return err({ code: "INVALID_TIME" });
    }

    return ok(
      new ContributionYear(
        input.year,
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
