-- Squashed pre-deployment migration. From the first deployed environment onward,
-- migrations are append-only: add new files instead of editing this one.
CREATE TABLE IF NOT EXISTS kyc_issuers (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CHECK (id = upper(id) AND length(trim(id)) > 0)
);

INSERT INTO kyc_issuers (id, name, active) VALUES
  ('MANUAL', 'Manual', true),
  ('INTERNAL', 'Internal', true);

CREATE TABLE IF NOT EXISTS kyc_attestations (
  id text PRIMARY KEY,
  subject_pkh text NOT NULL,
  issuer_id text NOT NULL REFERENCES kyc_issuers (id),
  evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
  issued_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
  revoked_at bigint,
  revoke_reason text,
  CHECK (expires_at > issued_at),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)),
  UNIQUE (id, subject_pkh)
);

CREATE UNIQUE INDEX IF NOT EXISTS kyc_attestations_one_active
  ON kyc_attestations (subject_pkh) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS kyc_attestations_by_subject
  ON kyc_attestations (subject_pkh, issued_at DESC);

-- Pre-deployment squash: a DB migrated from the deleted 0001_members.sql would
-- keep kyc_commitment otherwise, because CREATE TABLE IF NOT EXISTS is a no-op.
DROP TABLE IF EXISTS members;

CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  owner_pkh text NOT NULL UNIQUE,
  kyc_attestation_id text NOT NULL,
  member_class text NOT NULL CHECK (member_class IN ('STANDARD', 'FOUNDER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'EXITED')),
  joined_at bigint NOT NULL,
  FOREIGN KEY (kyc_attestation_id, owner_pkh)
    REFERENCES kyc_attestations (id, subject_pkh)
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce text PRIMARY KEY,
  address text NOT NULL,
  expires_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_nonces_expires_at_idx
  ON auth_nonces (expires_at);
