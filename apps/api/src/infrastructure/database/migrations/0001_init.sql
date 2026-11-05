-- Squashed pre-deployment migration: the whole schema in one file, because no
-- environment has been deployed yet. From the first deployed environment
-- onward, migrations are append-only: add new files instead of editing this one.

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
  revoke_reason_code text
    CHECK (revoke_reason_code IN ('SANCTIONS', 'PEP', 'DOCUMENT_MISMATCH', 'OTHER')),
  retain_until bigint,
  CHECK (expires_at > issued_at),
  CHECK (retain_until IS NULL OR retain_until > issued_at),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL AND revoke_reason_code IS NOT NULL)),
  UNIQUE (id, subject_pkh)
);

CREATE UNIQUE INDEX IF NOT EXISTS kyc_attestations_one_active
  ON kyc_attestations (subject_pkh) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS kyc_attestations_by_subject
  ON kyc_attestations (subject_pkh, issued_at DESC);

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

CREATE TABLE IF NOT EXISTS contribution_years (
  year integer PRIMARY KEY,
  annual_amount bigint NOT NULL,
  member_capital_bps integer NOT NULL,
  capital_participation_bps integer NOT NULL,
  standard_capital_participation_max_bps integer NOT NULL,
  created_at bigint NOT NULL,
  CHECK (year > 0),
  CHECK (annual_amount > 0),
  CHECK (member_capital_bps BETWEEN 0 AND 10000),
  CHECK (capital_participation_bps BETWEEN 0 AND 10000),
  CHECK (standard_capital_participation_max_bps BETWEEN 0 AND 10000),
  CHECK (member_capital_bps + capital_participation_bps = 10000),
  CHECK (capital_participation_bps <= standard_capital_participation_max_bps),
  -- Plan §3.2: the standard Capital Participation share is capped at 50%. Keep
  -- the literal in step with STANDARD_CAPITAL_PARTICIPATION_MAX_BPS in
  -- packages/shared/src/domain/capital-parameters.ts.
  CONSTRAINT contribution_years_cap_within_governance_max
    CHECK (standard_capital_participation_max_bps <= 5000),
  CHECK (created_at >= 0)
);

CREATE TABLE IF NOT EXISTS contributions (
  id text PRIMARY KEY,
  member_id text NOT NULL REFERENCES members (id),
  contribution_year integer NOT NULL REFERENCES contribution_years (year),
  annual_amount bigint NOT NULL,
  member_capital_bps integer NOT NULL,
  capital_participation_bps integer NOT NULL,
  member_capital bigint NOT NULL,
  capital_participation bigint NOT NULL,
  recorded_at bigint NOT NULL,
  UNIQUE (member_id, contribution_year),
  CHECK (annual_amount > 0),
  CHECK (member_capital_bps BETWEEN 0 AND 10000),
  CHECK (capital_participation_bps BETWEEN 0 AND 10000),
  CHECK (member_capital_bps + capital_participation_bps = 10000),
  CHECK (member_capital >= 0),
  CHECK (capital_participation >= 0),
  CHECK (member_capital + capital_participation = annual_amount),
  CHECK (recorded_at >= 0)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  detail text,
  occurred_at bigint NOT NULL,
  CHECK (actor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  CHECK (length(trim(action)) > 0),
  CHECK (length(trim(entity_type)) > 0),
  CHECK (length(trim(entity_id)) > 0),
  CHECK (occurred_at >= 0)
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON audit_events (entity_type, entity_id, occurred_at DESC);

-- Append-only. TRUNCATE is deliberately not guarded: test harnesses reset the
-- table with it, and production clients have no TRUNCATE grant.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_mutate ON audit_events;

CREATE TRIGGER audit_events_no_mutate
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
