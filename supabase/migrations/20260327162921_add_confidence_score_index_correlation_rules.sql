/*
  # Add performance indexes to correlation_rules_library

  1. Changes
    - Add index on `confidence_score` for ORDER BY queries
    - Add composite index on `(confidence_score DESC, id)` for paginated sorting
  2. Notes
    - Resolves statement timeout (57014) on queries ordering by confidence_score
    - Table has ~50,000 rows; without index, full table scan causes timeout
*/

CREATE INDEX IF NOT EXISTS idx_crl_confidence_score
  ON correlation_rules_library (confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_crl_confidence_id
  ON correlation_rules_library (confidence_score DESC, id);
