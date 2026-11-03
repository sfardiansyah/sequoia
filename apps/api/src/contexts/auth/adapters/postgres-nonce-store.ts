import type { Sql } from "postgres";
import type { NonceStore } from "../types";

export class PostgresNonceStore implements NonceStore {
  constructor(private readonly sql: Sql) {}

  async create(input: {
    nonce: string;
    address: string;
    expiresAt: number;
    now: number;
  }): Promise<void> {
    // Unused nonces expire but are never consumed, so purge them on the write
    // path; the table then stays bounded by rate times lifetime.
    await this.sql`
      DELETE FROM auth_nonces WHERE expires_at < ${input.now}
    `;

    await this.sql`
      INSERT INTO auth_nonces (nonce, address, expires_at)
      VALUES (${input.nonce}, ${input.address}, ${input.expiresAt})
    `;
  }

  async consume(input: {
    nonce: string;
    address: string;
    now: number;
  }): Promise<boolean> {
    const rows = await this.sql`
      DELETE FROM auth_nonces
      WHERE nonce = ${input.nonce}
        AND address = ${input.address}
        AND expires_at >= ${input.now}
      RETURNING nonce
    `;

    return rows.length > 0;
  }
}
