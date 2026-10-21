import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Member } from "../../domain/member";
import { DrizzleMemberRepository } from "./member-repository";
import * as schema from "./schema";

async function setup() {
  const client = new PGlite();
  const ddl = await readFile(
    new URL(
      "../../../../infrastructure/database/migrations/0001_members.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.exec(ddl);
  const db = drizzle(client, { schema });
  return { client, repo: new DrizzleMemberRepository(db) };
}

describe("DrizzleMemberRepository", () => {
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
