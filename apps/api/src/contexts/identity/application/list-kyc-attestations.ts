import { err, ok, type Result } from "@sequoia/shared";
import { unexpected } from "../../../shared/errors";
import type { KycStatus } from "../domain/kyc-status";
import type { IdentityError, KycAttestationRepository } from "../domain/kyc-attestation";
import {
  toKycAttestationView,
  type KycAttestationView,
} from "./get-kyc-attestation";

export type ListKycAttestationsQuery = {
  readonly subjectPkh?: string | undefined;
  readonly expiresBefore?: number | undefined;
  readonly status?: KycStatus | undefined;
  readonly at: number;
};

export class ListKycAttestations {
  constructor(private readonly attestations: KycAttestationRepository) {}

  async execute(
    query: ListKycAttestationsQuery,
  ): Promise<Result<readonly KycAttestationView[], IdentityError>> {
    let attestations;
    try {
      attestations = await this.attestations.list({
        subjectPkh: query.subjectPkh,
        expiresBefore: query.expiresBefore,
      });
    } catch (cause) {
      return err(unexpected(cause));
    }

    const views = attestations.map((attestation) =>
      toKycAttestationView(attestation, query.at),
    );

    return ok(
      query.status === undefined
        ? views
        : views.filter((view) => view.status === query.status),
    );
  }
}
