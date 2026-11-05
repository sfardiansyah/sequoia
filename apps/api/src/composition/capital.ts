import { ConfigureContributionYear } from "../contexts/capital/application/configure-contribution-year";
import { RecordAnnualContribution } from "../contexts/capital/application/record-annual-contribution";
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
    audit: new DrizzleAuditLog(tx),
  }));

  return {
    configureContributionYear: new ConfigureContributionYear(unitOfWork),
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
