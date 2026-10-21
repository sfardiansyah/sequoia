import { AdmitMember } from "../contexts/membership/application/admit-member";
import { CryptoIdGenerator } from "../contexts/membership/adapters/crypto-id-generator";
import { createPostgresMemberRepository } from "../contexts/membership/adapters/postgres/postgres-member-repository";

export function createMembershipContainer(databaseUrl: string) {
  const { client, repository } = createPostgresMemberRepository(databaseUrl);
  const admitMember = new AdmitMember(repository, new CryptoIdGenerator());

  return {
    admitMember,
    close: () => client.end(),
  };
}
