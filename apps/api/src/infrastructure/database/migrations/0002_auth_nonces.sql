CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce text PRIMARY KEY,
  address text NOT NULL,
  expires_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_nonces_expires_at_idx
  ON auth_nonces (expires_at);
