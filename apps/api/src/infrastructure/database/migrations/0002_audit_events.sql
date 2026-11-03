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
