import { UuidGenerator } from "../shared/id-generator";
import { DrizzleAuditLog } from "../shared/audit/adapters/postgres/audit-log";
import { createDrizzleUnitOfWork } from "../shared/persistence/adapters/postgres/unit-of-work";
import { createPostgresIdentityRepository } from "../contexts/identity/adapters/postgres/postgres-identity-repository";
import { DrizzleKycAttestationRepository } from "../contexts/identity/adapters/postgres/kyc-attestation-repository";
import { GetKycAttestation } from "../contexts/identity/application/get-kyc-attestation";
import { IssueKycAttestation } from "../contexts/identity/application/issue-kyc-attestation";
import { ListKycAttestations } from "../contexts/identity/application/list-kyc-attestations";
import { RevokeKycAttestation } from "../contexts/identity/application/revoke-kyc-attestation";

export function createIdentityContainer(databaseUrl: string) {
  const { client, db, attestations, issuers } =
    createPostgresIdentityRepository(databaseUrl);
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    attestations: new DrizzleKycAttestationRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));

  return {
    issueKycAttestation: new IssueKycAttestation(
      issuers,
      new UuidGenerator(),
      unitOfWork,
    ),
    revokeKycAttestation: new RevokeKycAttestation(attestations, unitOfWork),
    getKycAttestation: new GetKycAttestation(attestations),
    listKycAttestations: new ListKycAttestations(attestations),
    close: () => client.end(),
  };
}
