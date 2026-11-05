import { err, ok, type Result } from "@sequoia/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  parseActor,
} from "../../../shared/audit/audit-event";
import { unexpected } from "../../../shared/errors";
import type { IdGenerator } from "../../../shared/id-generator";
import type { UnitOfWork } from "../../../shared/persistence/unit-of-work";
import type { MemberRepository } from "../../membership/domain/member";
import {
  BankAttestation,
  DuplicateBankReferenceError,
  UnknownBankAttestationMemberError,
  type BankAttestationError,
} from "../domain/bank-attestation";
import type { CapitalWriteScope } from "./write-scope";

export type CreateBankAttestationCommand = {
  readonly memberId: string;
  readonly contributionYear: number;
  readonly amount: number;
  readonly bankReference: string;
  readonly createdAt: number;
  /** Operator running the command; recorded in the audit trail. */
  readonly actor: string;
};

export class CreateBankAttestation {
  constructor(
    private readonly members: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: UnitOfWork<CapitalWriteScope>,
  ) {}

  async execute(
    command: CreateBankAttestationCommand,
  ): Promise<Result<BankAttestation, BankAttestationError>> {
    const actor = parseActor(command.actor);
    if (!actor) return err({ code: "INVALID_ACTOR" });

    const memberId = command.memberId.trim();
    if (!memberId) return err({ code: "INVALID_MEMBER" });

    if (
      !Number.isInteger(command.contributionYear) ||
      command.contributionYear <= 0
    ) {
      return err({ code: "INVALID_YEAR" });
    }

    let member;
    try {
      member = await this.members.findById(memberId);
    } catch (cause) {
      return err(unexpected(cause));
    }
    if (!member) return err({ code: "MEMBER_NOT_FOUND" });

    const id = this.ids.next();

    try {
      return await this.unitOfWork.run<
        Result<BankAttestation, BankAttestationError>
      >(async (write) => {
        const year = await write.years.findByYear(command.contributionYear);
        if (!year) return err({ code: "YEAR_NOT_CONFIGURED" });

        const attestation = BankAttestation.create({
          id,
          memberId,
          contributionYear: year.year,
          amount: command.amount,
          bankReference: command.bankReference,
          actor,
          createdAt: command.createdAt,
        });
        if (!attestation.ok) return attestation;

        // The annual amount is fixed per year, so any other amount cannot fund
        // a contribution. Reject it at the source.
        if (attestation.value.amount !== year.annualAmount) {
          return err({ code: "AMOUNT_MISMATCH" });
        }

        await write.attestations.save(attestation.value);
        await write.audit.record({
          actor,
          action: AUDIT_ACTIONS.bankAttestationCreated,
          entityType: AUDIT_ENTITY_TYPES.bankAttestation,
          entityId: attestation.value.id,
          // The bank reference is evidence, not audit detail.
          detail: null,
          occurredAt: attestation.value.createdAt,
        });

        return ok(attestation.value);
      });
    } catch (cause) {
      if (cause instanceof DuplicateBankReferenceError) {
        return err({ code: "BANK_REFERENCE_ALREADY_USED" });
      }
      if (cause instanceof UnknownBankAttestationMemberError) {
        return err({ code: "MEMBER_NOT_FOUND" });
      }
      return err(unexpected(cause));
    }
  }
}
