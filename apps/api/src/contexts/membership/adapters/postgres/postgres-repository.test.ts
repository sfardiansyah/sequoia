import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Member } from "../../domain/member";
import { PgliteMemberRepository } from "./member-repository";
import * as schema from "./schema";

const ddl = `
  CREATE TABLE members (
    id text PRIMARY KEY,
    owner_pkh text NOT NULL UNIQUE,
    kyc_commitment text NOT NULL,
    member_class text NOT NULL CHECK (member_class IN ('STANDARD', 'FOUNDER')),
    status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXITED')),
    joined_at bigint NOT NULL
  )
`;

async function setup() {
  const client = new PGlite();
  await client.exec(ddl);
  const db = drizzle(client, { schema });
  return { client, repo: new PgliteMemberRepository(db) };
}

describe("PgliteMemberRepository", () => {
  test("saves and finds a member", async () => {
    const { client, repo } = await setup();

    try {
      const result = Member.admit({
        id: "member-1",
        ownerPkh: "addr_test1-member",
        kycCommitment: "kyc-1",
        memberClass: "STANDARD",
        joinedAt: 1_700_000_000_000,
      });
      if (!result.ok) throw new Error(result.error);

      expect(await repo.findByOwnerPkh("addr_test1-member")).toBeNull();
      await repo.save(result.value);

      const found = await repo.findByOwnerPkh("addr_test1-member");
      expect(String(found?.id)).toBe("member-1");
      expect(found?.status).toBe("ACTIVE");
      expect(found?.joinedAt).toBe(1_700_000_000_000);
    } finally {
      await client.close();
    }
  });
});
