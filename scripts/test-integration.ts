const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "TEST_DATABASE_URL is required, e.g. postgres://sequoia:sequoia@localhost:5432/sequoia_test",
  );
  process.exit(1);
}

const test = Bun.spawn(
  [
    "bun",
    "test",
    "--timeout",
    "30000",
    "apps/api/src/contexts/auth/adapters/postgres-nonce-store.integration.test.ts",
    "apps/api/src/contexts/membership/adapters/postgres/postgres-repository.integration.test.ts",
  ],
  {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, RUN_INTEGRATION_TESTS: "1" },
  },
);

process.exit(await test.exited);

export {};
