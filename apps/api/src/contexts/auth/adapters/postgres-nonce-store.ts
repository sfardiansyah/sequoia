import type { Sql } from "postgres";
import type { NonceStore } from "../types";

export class PostgresNonceStore implements NonceStore {
  constructor(private readonly sql: Sql) {}

  async create(input: {
    nonce: string;
    address: string;
    expiresAt: number;
  }): Promise<void> {
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
