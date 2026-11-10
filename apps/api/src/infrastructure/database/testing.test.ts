import { describe, expect, test } from "bun:test";
import { assertTestDatabase } from "./testing";

describe("assertTestDatabase", () => {
  test("accepts a database ending in _test", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@localhost:5432/sequoia_test",
        undefined,
      ),
    ).not.toThrow();
  });

  test("accepts a case-insensitive suffix and a query string", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@localhost:5432/SEQ_test?sslmode=require",
        undefined,
      ),
    ).not.toThrow();
  });

  test("rejects a database that is not a test database", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@localhost:5432/sequoia",
        undefined,
      ),
    ).toThrow(/_test/);
  });

  test("rejects the database DATABASE_URL names, even with the suffix", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@localhost:5432/sequoia_test",
        "postgres://sequoia:sequoia@localhost:5432/sequoia_test",
      ),
    ).toThrow(/must not name the same database/);
  });

  test("treats a missing port as 5432", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@localhost/sequoia_test",
        "postgres://sequoia:sequoia@localhost:5432/sequoia_test",
      ),
    ).toThrow(/must not name the same database/);
  });

  test("allows the same database name on a different host", () => {
    expect(() =>
      assertTestDatabase(
        "postgres://sequoia:sequoia@test-db:5432/sequoia_test",
        "postgres://sequoia:sequoia@localhost:5432/sequoia_test",
      ),
    ).not.toThrow();
  });

  test("rejects an invalid URL without echoing credentials", () => {
    expect(() => assertTestDatabase("not a url", undefined)).toThrow(
      /must be a valid PostgreSQL URL/,
    );
    expect(() =>
      assertTestDatabase("postgres://user:secret@localhost/", undefined),
    ).toThrow(/must name a database/);
  });
});
