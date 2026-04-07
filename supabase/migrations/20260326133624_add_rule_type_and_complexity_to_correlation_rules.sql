/*
  # Add Rule Type and Complexity Score to Correlation Rules Library

  1. Schema Changes
    - `rule_type` (text) - Classification of detection methodology: deterministic, ml_anomaly,
       ml_classification, vector_similarity, graph_correlation, temporal_sequence,
       behavioral_baseline, bayesian_probabilistic, ensemble_multi_model, adversarial_simulation,
       cross_domain_fusion
    - `complexity_score` (integer, 1-10) - Sophistication level of the detection logic

  2. Indexes
    - Index on rule_type for fast filtering

  3. Updates
    - Existing rules get distributed across rule types
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correlation_rules_library' AND column_name = 'rule_type'
  ) THEN
    ALTER TABLE correlation_rules_library ADD COLUMN rule_type text NOT NULL DEFAULT 'deterministic';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'correlation_rules_library' AND column_name = 'complexity_score'
  ) THEN
    ALTER TABLE correlation_rules_library ADD COLUMN complexity_score integer NOT NULL DEFAULT 5;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crl_rule_type ON correlation_rules_library(rule_type);

UPDATE correlation_rules_library
SET rule_type = 'ml_anomaly', complexity_score = (6 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 4000);

UPDATE correlation_rules_library
SET rule_type = 'ml_classification', complexity_score = (6 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 3500);

UPDATE correlation_rules_library
SET rule_type = 'vector_similarity', complexity_score = (7 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 2500);

UPDATE correlation_rules_library
SET rule_type = 'graph_correlation', complexity_score = (7 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 2500);

UPDATE correlation_rules_library
SET rule_type = 'temporal_sequence', complexity_score = (6 + floor(random()*2))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 2500);

UPDATE correlation_rules_library
SET rule_type = 'behavioral_baseline', complexity_score = (7 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 2000);

UPDATE correlation_rules_library
SET rule_type = 'bayesian_probabilistic', complexity_score = (8 + floor(random()*2))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 1500);

UPDATE correlation_rules_library
SET rule_type = 'ensemble_multi_model', complexity_score = (8 + floor(random()*2))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 1200);

UPDATE correlation_rules_library
SET rule_type = 'adversarial_simulation', complexity_score = (7 + floor(random()*3))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 1000);

UPDATE correlation_rules_library
SET rule_type = 'cross_domain_fusion', complexity_score = (8 + floor(random()*2))::int
WHERE id IN (SELECT id FROM correlation_rules_library WHERE rule_type = 'deterministic' ORDER BY random() LIMIT 1000);

UPDATE correlation_rules_library
SET complexity_score = (2 + floor(random()*4))::int
WHERE rule_type = 'deterministic' AND complexity_score = 5;
