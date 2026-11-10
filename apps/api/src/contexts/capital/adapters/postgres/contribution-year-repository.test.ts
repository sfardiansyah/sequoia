import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/pglite";
import {
  closePgliteTestDatabase,
  openPgliteTestDatabase,
} from "../../../../infrastructure/database/testing";
import { describeContributionYearRepository } from "../contribution-year-repository-contract";
import { DrizzleContributionYearRepository } from "./contribution-year-repository";
import * as schema from "./schema";

async function setup() {
  const client = await openPgliteTestDatabase();

  const db = drizzle(client, { schema });

  return {
    repository: new DrizzleContributionYearRepository(db),
    close: closePgliteTestDatabase,
  };
}

describeContributionYearRepository(
  "DrizzleContributionYearRepository",
  setup,
);

describe("contribution_years constraints", () => {
  test("rejects a cap above the governance ceiling", async () => {
    const client = await openPgliteTestDatabase();

    try {
      await client.exec(`
        INSERT INTO contribution_years
          (year, approval_ref, annual_amount, member_capital_bps,
           capital_participation_bps, standard_capital_participation_max_bps,
           created_at)
        VALUES (2026, 'BOARD-2026-001', 1000000, 7000, 3000, 5000, 0)
      `);

      await expect(
        client.exec(`
          INSERT INTO contribution_years
            (year, approval_ref, annual_amount, member_capital_bps,
             capital_participation_bps, standard_capital_participation_max_bps,
             created_at)
          VALUES (2027, 'BOARD-2027-001', 1000000, 4000, 6000, 6000, 0)
        `),
      ).rejects.toThrow(/contribution_years_cap_within_governance_max/);
    } finally {
      await closePgliteTestDatabase();
    }
  });

  test("rejects a blank approval reference", async () => {
    const client = await openPgliteTestDatabase();

    try {
      await expect(
        client.exec(`
          INSERT INTO contribution_years
            (year, approval_ref, annual_amount, member_capital_bps,
             capital_participation_bps, standard_capital_participation_max_bps,
             created_at)
          VALUES (2026, '   ', 1000000, 7000, 3000, 5000, 0)
        `),
      ).rejects.toThrow(/contribution_years_approval_ref_check/);
    } finally {
      await closePgliteTestDatabase();
    }
  });
});
