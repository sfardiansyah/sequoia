-- Plan §3.2: the standard Capital Participation share is capped at 50%.
-- Keep the literal in step with STANDARD_CAPITAL_PARTICIPATION_MAX_BPS in
-- packages/shared/src/domain/capital-parameters.ts.
ALTER TABLE contribution_years
  ADD CONSTRAINT contribution_years_cap_within_governance_max
  CHECK (standard_capital_participation_max_bps <= 5000);
