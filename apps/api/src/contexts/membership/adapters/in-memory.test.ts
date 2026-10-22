import { describeMemberRepository } from "./member-repository-contract";
import { InMemoryMemberRepository } from "./in-memory";

describeMemberRepository("InMemoryMemberRepository", async () => ({
  repository: new InMemoryMemberRepository(),
  close: async () => {},
}));
