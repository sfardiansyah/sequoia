import { describeKycAttestationRepository } from "./kyc-attestation-repository-contract";
import { InMemoryKycAttestationRepository } from "./in-memory";

describeKycAttestationRepository(
  "InMemoryKycAttestationRepository",
  async () => ({
    repository: new InMemoryKycAttestationRepository(),
    close: async () => {},
  }),
);
