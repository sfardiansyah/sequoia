import {
  bps,
  err,
  idr,
  ok,
  splitContribution,
  type BasisPoints,
  type ContributionSplitBps,
  type IdrAmount,
  type Result,
} from "@sequoia/shared";
import type { UnexpectedError } from "../../../shared/errors";

export type ContributionId = string & { readonly __brand: "ContributionId" };

export const ContributionSource = {
  Pilot: "PILOT",
  Chain: "CHAIN",
} as const;

export type ContributionSource =
  (typeof ContributionSource)[keyof typeof ContributionSource];

export type ContributionError =
  | { readonly code: "INVALID_MEMBER" }
  | { readonly code: "INVALID_YEAR" }
  | { readonly code: "INVALID_AMOUNT" }
  | { readonly code: "INVALID_TIME" }
  | { readonly code: "INVALID_SPLIT" }
  | { readonly code: "INVALID_SNAPSHOT" }
  | { readonly code: "INVALID_ATTESTATION" }
  | { readonly code: "INVALID_PROVENANCE" }
  | { readonly code: "INVALID_ACTOR" }
  | { readonly code: "ALREADY_RECORDED" }
  | { readonly code: "ATTESTATION_NOT_FOUND" }
  | { readonly code: "ATTESTATION_MISMATCH" }
  | { readonly code: "ATTESTATION_ALREADY_USED" }
  | { readonly code: "MEMBER_NOT_FOUND" }
  | { readonly code: "MEMBER_INACTIVE" }
  | { readonly code: "MEMBER_NOT_APPROVED" }
  | { readonly code: "KYC_NOT_VERIFIED" }
  | { readonly code: "KYC_EXPIRED" }
  | { readonly code: "KYC_REVOKED" }
  | { readonly code: "YEAR_NOT_CONFIGURED" }
  | UnexpectedError;

export class DuplicateContributionError extends Error {
  constructor() {
    super("Contribution already recorded");
    this.name = "DuplicateContributionError";
  }
}

export class DuplicateBankAttestationError extends Error {
  constructor() {
    super("Bank attestation already funds a contribution");
    this.name = "DuplicateBankAttestationError";
  }
}

export class UnknownContributionMemberError extends Error {
  constructor() {
    super("Contribution member not found");
    this.name = "UnknownContributionMemberError";
  }
}

export class Contribution {
  private constructor(
    readonly id: ContributionId,
    readonly memberId: string,
    readonly contributionYear: number,
    readonly bankAttestationId: string,
    readonly source: ContributionSource,
    readonly chainTx: string | null,
    readonly annualAmount: IdrAmount,
    readonly memberCapitalBps: BasisPoints,
    readonly capitalParticipationBps: BasisPoints,
    readonly memberCapital: bigint,
    readonly capitalParticipation: bigint,
    readonly recordedAt: number,
  ) {}

  static record(input: {
    id: string;
    memberId: string;
    contributionYear: number;
    bankAttestationId: string;
    source: ContributionSource;
    chainTx: string | null;
    annualAmount: number;
    split: ContributionSplitBps;
    recordedAt: number;
  }): Result<Contribution, ContributionError> {
    const memberId = input.memberId.trim();
    if (!memberId) return err({ code: "INVALID_MEMBER" });

    if (!Number.isInteger(input.contributionYear) || input.contributionYear <= 0) {
      return err({ code: "INVALID_YEAR" });
    }

    const bankAttestationId = input.bankAttestationId.trim();
    if (!bankAttestationId) return err({ code: "INVALID_ATTESTATION" });

    if (
      input.source !== ContributionSource.Pilot &&
      input.source !== ContributionSource.Chain
    ) {
      return err({ code: "INVALID_PROVENANCE" });
    }

    const chainTx = input.chainTx?.trim() ?? null;
    if (
      (input.source === ContributionSource.Pilot && chainTx !== null) ||
      (input.source === ContributionSource.Chain && !chainTx)
    ) {
      return err({ code: "INVALID_PROVENANCE" });
    }

    const annualAmount = idr(input.annualAmount);
    if (!annualAmount.ok) return err({ code: "INVALID_AMOUNT" });

    if (!Number.isInteger(input.recordedAt) || input.recordedAt < 0) {
      return err({ code: "INVALID_TIME" });
    }

    const memberCapitalBps = bps(input.split.memberCapitalBps);
    if (!memberCapitalBps.ok) return err({ code: "INVALID_SPLIT" });

    const capitalParticipationBps = bps(input.split.capitalParticipationBps);
    if (!capitalParticipationBps.ok) return err({ code: "INVALID_SPLIT" });

    const split = splitContribution(annualAmount.value, input.split);
    if (!split.ok) return err({ code: "INVALID_SPLIT" });

    return ok(
      new Contribution(
        input.id as ContributionId,
        memberId,
        input.contributionYear,
        bankAttestationId,
        input.source,
        chainTx,
        annualAmount.value,
        memberCapitalBps.value,
        capitalParticipationBps.value,
        split.value.memberCapital,
        split.value.capitalParticipation,
        input.recordedAt,
      ),
    );
  }

  static rehydrate(input: {
    id: string;
    memberId: string;
    contributionYear: number;
    bankAttestationId: string;
    source: ContributionSource;
    chainTx: string | null;
    annualAmount: number;
    memberCapitalBps: number;
    capitalParticipationBps: number;
    memberCapital: bigint;
    capitalParticipation: bigint;
    recordedAt: number;
  }): Result<Contribution, ContributionError> {
    const recorded = Contribution.record({
      id: input.id,
      memberId: input.memberId,
      contributionYear: input.contributionYear,
      bankAttestationId: input.bankAttestationId,
      source: input.source,
      chainTx: input.chainTx,
      annualAmount: input.annualAmount,
      split: {
        memberCapitalBps: input.memberCapitalBps,
        capitalParticipationBps: input.capitalParticipationBps,
      },
      recordedAt: input.recordedAt,
    });
    if (!recorded.ok) return recorded;

    if (
      recorded.value.memberCapital !== input.memberCapital ||
      recorded.value.capitalParticipation !== input.capitalParticipation
    ) {
      return err({ code: "INVALID_SNAPSHOT" });
    }

    return recorded;
  }
}

export interface ContributionRepository {
  findByMemberAndYear(
    memberId: string,
    contributionYear: number,
  ): Promise<Contribution | null>;
  findByBankAttestationId(id: string): Promise<Contribution | null>;
  save(contribution: Contribution): Promise<void>;
}
