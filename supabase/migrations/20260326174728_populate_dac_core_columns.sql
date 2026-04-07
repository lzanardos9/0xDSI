/*
  # Populate DaC Core Columns
  
  Updates correlation_rules_library with version, dac_status, 
  review_status, source_format, test_result, and other DaC fields.
*/

UPDATE correlation_rules_library SET
  version = CASE
    WHEN severity = 'critical' AND enabled THEN '2.1.0'
    WHEN severity = 'high' AND enabled THEN '1.3.0'
    WHEN severity = 'medium' AND enabled THEN '1.1.0'
    WHEN severity = 'low' AND enabled THEN '1.0.0'
    WHEN NOT enabled THEN '0.9.0'
    ELSE '1.0.0'
  END,
  dac_status = CASE
    WHEN enabled AND severity IN ('critical','high') THEN 'production'
    WHEN enabled AND severity = 'medium' THEN 'production'
    WHEN enabled AND severity = 'low' THEN 'production'
    WHEN NOT enabled AND severity = 'critical' THEN 'testing'
    WHEN NOT enabled AND severity = 'high' THEN 'staging'
    WHEN NOT enabled AND severity = 'medium' THEN 'draft'
    ELSE 'deprecated'
  END,
  review_status = CASE
    WHEN enabled THEN 'approved'
    WHEN NOT enabled AND severity = 'critical' THEN 'pending_review'
    ELSE 'pending_review'
  END,
  reviewed_by = CASE
    WHEN severity = 'critical' THEN 'sarah.chen'
    WHEN severity = 'high' THEN 'marcus.rivera'
    WHEN severity = 'medium' THEN 'elena.volkov'
    ELSE 'james.okafor'
  END,
  reviewed_at = now() - interval '30 days',
  source_format = CASE
    WHEN rule_type = 'deterministic' THEN 'sigma'
    WHEN rule_type IN ('temporal_sequence','behavioral_baseline') THEN 'elastic_kql'
    WHEN rule_type = 'graph_correlation' THEN 'splunk_spl'
    ELSE 'custom'
  END,
  test_result = CASE
    WHEN enabled THEN 'pass'
    WHEN NOT enabled AND severity = 'critical' THEN 'fail'
    ELSE 'untested'
  END,
  last_tested_at = CASE WHEN enabled THEN now() - interval '7 days' ELSE NULL END,
  response_playbook = 'playbooks/triage/alert-validation.md',
  git_ref = substring(md5(id::text) from 1 for 12);
