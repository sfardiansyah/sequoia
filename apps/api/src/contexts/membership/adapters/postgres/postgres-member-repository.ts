import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DrizzleMemberRepository } from "./member-repository";
import * as schema from "./schema";

export function createPostgresMemberRepository(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });

  return {
    client,
    repository: new DrizzleMemberRepository(db),
  };
}
