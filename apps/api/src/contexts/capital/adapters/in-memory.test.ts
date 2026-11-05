import { describeBankAttestationRepository } from "./bank-attestation-repository-contract";
import { describeContributionRepository } from "./contribution-repository-contract";
import { describeContributionYearRepository } from "./contribution-year-repository-contract";
import {
  InMemoryBankAttestationRepository,
  InMemoryContributionRepository,
  InMemoryContributionYearRepository,
} from "./in-memory";

describeBankAttestationRepository("InMemoryBankAttestationRepository", async () => ({
  repository: new InMemoryBankAttestationRepository(),
  close: async () => {},
}));

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
