import { err, idr, ok, type IdrAmount, type Result } from "@sequoia/shared";
import { parseActor } from "../../../shared/audit/audit-event";
import type { UnexpectedError } from "../../../shared/errors";

export type BankAttestationId = string & {
  readonly __brand: "BankAttestationId";
};

export type BankAttestationError =
  | { readonly code: "INVALID_MEMBER" }
  | { readonly code: "INVALID_YEAR" }
  | { readonly code: "INVALID_AMOUNT" }
  | { readonly code: "INVALID_BANK_REFERENCE" }
  | { readonly code: "INVALID_ACTOR" }
  | { readonly code: "INVALID_TIME" }
  | { readonly code: "MEMBER_NOT_FOUND" }
  | { readonly code: "YEAR_NOT_CONFIGURED" }
  | { readonly code: "BANK_REFERENCE_ALREADY_USED" }
  | UnexpectedError;

export class DuplicateBankReferenceError extends Error {
  constructor() {
    super("Bank reference already used");
    this.name = "DuplicateBankReferenceError";
  }
}

export class DuplicateBankAttestationIdError extends Error {
  constructor() {
    super("Bank attestation id already used");
    this.name = "DuplicateBankAttestationIdError";
  }
}

export class UnknownBankAttestationMemberError extends Error {
  constructor() {
    super("Bank attestation member not found");
    this.name = "UnknownBankAttestationMemberError";
  }
}

export class UnknownBankAttestationYearError extends Error {
  constructor() {
    super("Bank attestation contribution year not found");
    this.name = "UnknownBankAttestationYearError";
  }
}

export class BankAttestation {
  private constructor(
    readonly id: BankAttestationId,
    readonly memberId: string,
    readonly contributionYear: number,
    readonly amount: IdrAmount,
    readonly bankReference: string,
    readonly actor: string,
    readonly createdAt: number,
  ) {}

  static create(input: {
    id: string;
    memberId: string;
    contributionYear: number;
    amount: number;
    bankReference: string;
    actor: string;
    createdAt: number;
  }): Result<BankAttestation, BankAttestationError> {
    const memberId = input.memberId.trim();
    if (!memberId) return err({ code: "INVALID_MEMBER" });

    if (!Number.isInteger(input.contributionYear) || input.contributionYear <= 0) {
      return err({ code: "INVALID_YEAR" });
    }

    const amount = idr(input.amount);
    if (!amount.ok || amount.value <= 0) return err({ code: "INVALID_AMOUNT" });

    const bankReference = input.bankReference.trim();
    if (!bankReference) return err({ code: "INVALID_BANK_REFERENCE" });

    const actor = parseActor(input.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

    if (!Number.isInteger(input.createdAt) || input.createdAt < 0) {
      return err({ code: "INVALID_TIME" });
    }

    return ok(
      new BankAttestation(
        input.id as BankAttestationId,
        memberId,
        input.contributionYear,
        amount.value,
        bankReference,
        actor,
        input.createdAt,
      ),
    );
  }

  static rehydrate(input: {
    id: string;
    memberId: string;
    contributionYear: number;
    amount: number;
    bankReference: string;
    actor: string;
    createdAt: number;
  }): Result<BankAttestation, BankAttestationError> {
    return BankAttestation.create(input);
  }
}

export interface BankAttestationRepository {
  findById(id: string): Promise<BankAttestation | null>;
  save(attestation: BankAttestation): Promise<void>;
}
