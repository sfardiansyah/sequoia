import { ConfigureContributionYear } from "../contexts/capital/application/configure-contribution-year";
import { CreateBankAttestation } from "../contexts/capital/application/create-bank-attestation";
import { RecordAnnualContribution } from "../contexts/capital/application/record-annual-contribution";
import { DrizzleBankAttestationRepository } from "../contexts/capital/adapters/postgres/bank-attestation-repository";
import { DrizzleContributionYearRepository } from "../contexts/capital/adapters/postgres/contribution-year-repository";
import { createPostgresContributionRepository } from "../contexts/capital/adapters/postgres/postgres-contribution-repository";
import { DrizzleAuditLog } from "../shared/audit/adapters/postgres/audit-log";
import { createDrizzleUnitOfWork } from "../shared/persistence/adapters/postgres/unit-of-work";
import { UuidGenerator } from "../shared/id-generator";
import { createMembershipContainer } from "./membership";

export function createCapitalContainer(databaseUrl: string) {
  const membership = createMembershipContainer(databaseUrl);
  const { client, db, repository, years } =
    createPostgresContributionRepository(databaseUrl);
  const unitOfWork = createDrizzleUnitOfWork(db, (tx) => ({
    years: new DrizzleContributionYearRepository(tx),
    attestations: new DrizzleBankAttestationRepository(tx),
    audit: new DrizzleAuditLog(tx),
  }));

  return {
    configureContributionYear: new ConfigureContributionYear(unitOfWork),
    createBankAttestation: new CreateBankAttestation(
      membership.memberRepository,
      new UuidGenerator(),
      unitOfWork,
    ),
    recordContribution: new RecordAnnualContribution(
      repository,
      years,
      membership.contributionEligibility,
      new UuidGenerator(),
    ),
    close: async () => {
      await Promise.all([client.end(), membership.close()]);
    },
  };
}
