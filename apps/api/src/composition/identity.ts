import { UuidGenerator } from "../shared/id-generator";
import { DrizzleAuditLog } from "../shared/audit/adapters/postgres/audit-log";
import { WarnOnFailureAuditLog } from "../shared/audit/adapters/warn-on-failure";
import { createPostgresIdentityRepository } from "../contexts/identity/adapters/postgres/postgres-identity-repository";
import { GetKycAttestation } from "../contexts/identity/application/get-kyc-attestation";
import { IssueKycAttestation } from "../contexts/identity/application/issue-kyc-attestation";
import { ListKycAttestations } from "../contexts/identity/application/list-kyc-attestations";
import { RevokeKycAttestation } from "../contexts/identity/application/revoke-kyc-attestation";

export function createIdentityContainer(databaseUrl: string) {
  const { client, db, attestations, issuers } =
    createPostgresIdentityRepository(databaseUrl);
  const audit = new WarnOnFailureAuditLog(new DrizzleAuditLog(db));

  return {
    issueKycAttestation: new IssueKycAttestation(
      attestations,
      issuers,
      new UuidGenerator(),
      audit,
    ),
    revokeKycAttestation: new RevokeKycAttestation(attestations, audit),
    getKycAttestation: new GetKycAttestation(attestations),
    listKycAttestations: new ListKycAttestations(attestations),
    close: () => client.end(),
  };
}
