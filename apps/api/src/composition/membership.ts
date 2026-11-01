import { AdmitMember } from "../contexts/membership/application/admit-member";
import { createPostgresMemberRepository } from "../contexts/membership/adapters/postgres/postgres-member-repository";
import { IdentityKycEligibility } from "../contexts/membership/adapters/identity/kyc-eligibility";
import { MembershipContributionEligibility } from "../contexts/capital/adapters/membership/contribution-eligibility";
import { UuidGenerator } from "../shared/id-generator";
import { createIdentityContainer } from "./identity";

export function createMembershipContainer(databaseUrl: string) {
  const identity = createIdentityContainer(databaseUrl);
  const { client, repository, profile } =
    createPostgresMemberRepository(databaseUrl);

  const kycEligibility = new IdentityKycEligibility(
    identity.getKycAttestation,
    identity.listKycAttestations,
  );
  const admitMember = new AdmitMember(
    repository,
    new UuidGenerator(),
    kycEligibility,
  );

  return {
    admitMember,
    memberProfile: profile,
    contributionEligibility: new MembershipContributionEligibility(
      repository,
      kycEligibility,
    ),
    client,
    checkDatabase: async () => {
      await client`SELECT 1`;
    },
    close: async () => {
      await Promise.all([client.end(), identity.close()]);
    },
  };
}
