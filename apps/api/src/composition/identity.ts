import { UuidGenerator } from "../shared/id-generator";
import { createPostgresIdentityRepository } from "../contexts/identity/adapters/postgres/postgres-identity-repository";
import { GetKycAttestation } from "../contexts/identity/application/get-kyc-attestation";
import { IssueKycAttestation } from "../contexts/identity/application/issue-kyc-attestation";
import { ListKycAttestations } from "../contexts/identity/application/list-kyc-attestations";
import { RevokeKycAttestation } from "../contexts/identity/application/revoke-kyc-attestation";

export function createIdentityContainer(databaseUrl: string) {
  const { client, attestations, issuers } = createPostgresIdentityRepository(
    databaseUrl,
  );

  return {
    issueKycAttestation: new IssueKycAttestation(
      attestations,
      issuers,
      new UuidGenerator(),
    ),
    revokeKycAttestation: new RevokeKycAttestation(attestations),
    getKycAttestation: new GetKycAttestation(attestations),
    listKycAttestations: new ListKycAttestations(attestations),
    close: () => client.end(),
  };
}
