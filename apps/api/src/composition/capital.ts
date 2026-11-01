import { ConfigureContributionYear } from "../contexts/capital/application/configure-contribution-year";
import { RecordAnnualContribution } from "../contexts/capital/application/record-annual-contribution";
import { createPostgresContributionRepository } from "../contexts/capital/adapters/postgres/postgres-contribution-repository";
import { UuidGenerator } from "../shared/id-generator";
import { createMembershipContainer } from "./membership";

export function createCapitalContainer(databaseUrl: string) {
  const membership = createMembershipContainer(databaseUrl);
  const { client, repository, years } =
    createPostgresContributionRepository(databaseUrl);

  return {
    configureContributionYear: new ConfigureContributionYear(years),
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
