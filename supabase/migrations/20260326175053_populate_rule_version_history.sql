/*
  # Populate Rule Version History Records
  
  Inserts version history snapshots for the first 200 rules
  to demonstrate the version tracking capability.
*/

INSERT INTO correlation_rule_versions 
  (rule_id, version, rule_name, rule_description, rule_logic, severity, category, enabled, change_summary, changed_by, change_type, created_at)
SELECT
  id, '1.0.0', rule_name, rule_description, rule_logic, severity, category, enabled,
  'Initial rule creation - Detection as Code onboarding',
  'admin', 'created', now() - interval '180 days'
FROM correlation_rules_library
ORDER BY created_at
LIMIT 200;

INSERT INTO correlation_rule_versions 
  (rule_id, version, rule_name, rule_description, rule_logic, severity, category, enabled, change_summary, changed_by, change_type, promoted_from, promoted_to, created_at)
SELECT
  id, version, rule_name, rule_description, rule_logic, severity, category, enabled,
  'Promoted to ' || dac_status || ' after validation and peer review',
  reviewed_by, 'promoted', 'staging', dac_status, now() - interval '60 days'
FROM correlation_rules_library
WHERE dac_status = 'production'
ORDER BY created_at
LIMIT 200;
