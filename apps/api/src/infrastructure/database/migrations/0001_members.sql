CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  owner_pkh text NOT NULL UNIQUE,
  kyc_commitment text NOT NULL,
  member_class text NOT NULL CHECK (member_class IN ('STANDARD', 'FOUNDER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXITED')),
  joined_at bigint NOT NULL
);
