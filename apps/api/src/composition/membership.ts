import { AdmitMember } from "../contexts/membership/application/admit-member";
import { createPostgresMemberRepository } from "../contexts/membership/adapters/postgres/postgres-member-repository";
import { IdentityKycEligibility } from "../contexts/membership/adapters/identity/kyc-eligibility";
import { UuidGenerator } from "../shared/id-generator";
import { createIdentityContainer } from "./identity";

export function createMembershipContainer(databaseUrl: string) {
  const identity = createIdentityContainer(databaseUrl);
  const { client, repository, profile } =
    createPostgresMemberRepository(databaseUrl);

  const admitMember = new AdmitMember(
    repository,
    new UuidGenerator(),
    new IdentityKycEligibility(identity.getKycAttestation),
  );

  return {
    admitMember,
    memberProfile: profile,
    client,
    checkDatabase: async () => {
      await client`SELECT 1`;
    },
    close: async () => {
      await Promise.all([client.end(), identity.close()]);
    },
  };
}
