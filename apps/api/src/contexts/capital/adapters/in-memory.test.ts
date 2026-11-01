import { describeContributionRepository } from "./contribution-repository-contract";
import { describeContributionYearRepository } from "./contribution-year-repository-contract";
import {
  InMemoryContributionRepository,
  InMemoryContributionYearRepository,
} from "./in-memory";

describeContributionRepository("InMemoryContributionRepository", async () => ({
  repository: new InMemoryContributionRepository(),
  close: async () => {},
}));

describeContributionYearRepository(
  "InMemoryContributionYearRepository",
  async () => ({
    repository: new InMemoryContributionYearRepository(),
    close: async () => {},
  }),
);
