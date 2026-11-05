import { AdmitMember } from "../contexts/membership/application/admit-member";
import { DrizzleMemberRepository } from "../contexts/membership/adapters/postgres/member-repository";
import { createPostgresMemberRepository } from "../contexts/membership/adapters/postgres/postgres-member-repository";
import { IdentityKycEligibility } from "../contexts/membership/adapters/identity/kyc-eligibility";
import { MembershipContributionEligibility } from "../contexts/capital/adapters/membership/contribution-eligibility";
import { DrizzleAuditLog } from "../shared/audit/adapters/postgres/audit-log";
import { createDrizzleUnitOfWork } from "../shared/persistence/adapters/postgres/unit-of-work";
import { UuidGenerator } from "../shared/id-generator";
import { createIdentityContainer } from "./identity";

export function createMembershipContainer(databaseUrl: string) {
  const identity = createIdentityContainer(databaseUrl);
  const { client, db, repository, profile } =
    createPostgresMemberRepository(databaseUrl);

  const kycEligibility = new IdentityKycEligibility(
    identity.getKycAttestation,
    identity.listKycAttestations,
  );
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    members: new DrizzleMemberRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));
  const admitMember = new AdmitMember(
    repository,
    new UuidGenerator(),
    kycEligibility,
    unitOfWork,
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
