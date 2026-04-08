/*
  # Insert Negative Correlation Rules into Correlation Rules Library

  Migrates all 18 negative correlation rules into the main `correlation_rules_library`
  table with full Detection-as-Code (DaC) lifecycle fields including:
  - Version control (semver)
  - DaC lifecycle status (draft/testing/staging/production)
  - Review status and reviewer info
  - Test cases with pass/fail results
  - Deployment history
  - Changelog entries
  - Compliance framework mappings
  - Git refs and source format
  - MITRE ATT&CK tactics and techniques

  1. New Data
    - 18 negative correlation rules with rule_type = 'negative_correlation'
    - Categories: missing_prerequisite, impossible_coexistence, missing_consequence,
      temporal_impossibility, physics_violation
    - Full DaC metadata for each rule

  2. Important Notes
    - Rules are inserted with IF NOT EXISTS guards on rule_name
    - Each rule has realistic test cases, deployment history, and changelogs
    - Confidence scores preserved from original negative_correlation_rules table
*/

-- Helper: only insert if rule_name doesn't already exist
DO $$
BEGIN

-- NC-001: Ghost Command Execution
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-001: Ghost Command Execution') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-001: Ghost Command Execution',
  'Shell commands were executed on a server, but no SSH, RDP, console login, or jump-host session was established within the expected time window. The commands appear to originate from a phantom session that never authenticated. Detects the ABSENCE of a prerequisite login event.',
  'Negative Correlation', 'Missing Prerequisite', 'critical', 0.92,
  ARRAY['Execution', 'Persistence', 'Lateral Movement'],
  ARRAY['T1059', 'T1078', 'T1021'],
  ARRAY['process_events', 'session_events', 'sshd_logs', 'pam_audit', 'network_monitor'],
  '{"pseudo_code": "IF process_exec(host=H, user=U) EXISTS\n  AND session_login(host=H, user=U, time > now-24h) NOT EXISTS\nTHEN ALERT(severity=critical, entity=U@H)", "time_window": "24h", "threshold": 1, "group_by": "host_id, user_id", "conditions": [{"field": "process_events.host_id", "op": "exists"}, {"field": "session_events.login", "op": "not_exists", "window": "24h"}], "negative_constraint": {"observed": "process_execution", "expected_missing": "session_login", "relationship": "prerequisite"}}',
  true,
  ARRAY['negative-correlation', 'ghost-session', 'missing-prerequisite', 'high-confidence', 'lateral-movement'],
  'SOC Detection Engineering',
  847, 0.03, now() - interval '12 minutes', 'negative_correlation', 8.5,
  '2.3.1', 'production',
  '[{"version": "1.0.0", "date": "2025-08-15", "type": "created", "summary": "Initial negative correlation rule for ghost command detection"}, {"version": "1.1.0", "date": "2025-09-20", "type": "updated", "summary": "Extended time window from 12h to 24h, added jump-host session check"}, {"version": "2.0.0", "date": "2025-11-01", "type": "promoted", "summary": "Promoted to production after 3-month testing period. 847 true positives, 3% FP rate"}, {"version": "2.3.1", "date": "2026-03-10", "type": "updated", "summary": "Added container exec session exclusion to reduce false positives from k8s workloads"}]',
  '[{"name": "Detect bash exec without SSH on test-host-01", "status": "pass", "description": "Inject process event for bash on test-host-01 with no corresponding SSH login", "last_run": "2026-04-01T10:00:00Z"}, {"name": "No alert when SSH login exists", "status": "pass", "description": "Ensure no alert fires when SSH login exists within 24h window", "last_run": "2026-04-01T10:01:00Z"}, {"name": "Exclude cron jobs from detection", "status": "pass", "description": "Verify cron-spawned processes do not trigger the rule", "last_run": "2026-04-01T10:02:00Z"}]',
  '[{"environment": "production", "deployed_at": "2025-11-01T14:00:00Z", "deployed_by": "lzhang", "version": "2.0.0", "status": "success", "commit": "a3f8c21"}, {"environment": "production", "deployed_at": "2026-03-10T09:30:00Z", "deployed_by": "jmorales", "version": "2.3.1", "status": "success", "commit": "e7d4b92"}]',
  'approved', 'mwilliams', '2026-03-09T16:00:00Z', 'e7d4b92', 'sigma',
  '[{"framework": "NIST CSF", "control": "DE.CM-1"}, {"framework": "MITRE ATT&CK", "control": "T1059"}, {"framework": "SOC2", "control": "CC7.2"}]',
  'playbook-ghost-command-response',
  '2026-04-01T10:02:00Z', 'pass'
);
END IF;

-- NC-002: Silent Privilege Escalation
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-002: Silent Privilege Escalation') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-002: Silent Privilege Escalation',
  'A user account was granted elevated privileges (admin, root, domain admin) but no corresponding change request, approval workflow, or PAM checkout event exists. Privileges materialized without any authorization trail.',
  'Negative Correlation', 'Missing Prerequisite', 'critical', 0.95,
  ARRAY['Privilege Escalation', 'Persistence'],
  ARRAY['T1078.002', 'T1098', 'T1548'],
  ARRAY['ad_audit_logs', 'change_requests', 'pam_sessions', 'itsm_tickets'],
  '{"pseudo_code": "IF privilege_grant(user=U, privilege=P) EXISTS\n  AND (change_request(user=U, approved=true)\n    OR pam_checkout(user=U)) NOT EXISTS\nTHEN ALERT(severity=critical)", "time_window": "48h", "threshold": 1, "group_by": "user_id", "conditions": [{"field": "privilege_grants.privilege_level", "op": "in", "values": ["admin", "root", "domain_admin"]}, {"field": "change_requests.status", "op": "not_exists"}], "negative_constraint": {"observed": "privilege_elevation", "expected_missing": "authorization_approval", "relationship": "prerequisite"}}',
  true,
  ARRAY['negative-correlation', 'privilege-escalation', 'missing-prerequisite', 'zero-trust'],
  'SOC Detection Engineering',
  234, 0.02, now() - interval '3 hours', 'negative_correlation', 9.0,
  '3.1.0', 'production',
  '[{"version": "1.0.0", "date": "2025-07-01", "type": "created", "summary": "Initial rule for detecting unauthorized privilege grants"}, {"version": "2.0.0", "date": "2025-09-15", "type": "promoted", "summary": "Production deployment after SOC validation"}, {"version": "3.1.0", "date": "2026-02-20", "type": "updated", "summary": "Added PAM checkout correlation and emergency break-glass exclusion"}]',
  '[{"name": "Detect Domain Admin grant without approval", "status": "pass", "description": "Grant Domain Admin role without change request", "last_run": "2026-03-28T14:00:00Z"}, {"name": "No alert for approved elevation", "status": "pass", "description": "Verify approved change requests suppress alert", "last_run": "2026-03-28T14:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-02-20T11:00:00Z", "deployed_by": "agarcia", "version": "3.1.0", "status": "success", "commit": "b91c4e7"}]',
  'approved', 'dpark', '2026-02-19T15:30:00Z', 'b91c4e7', 'sigma',
  '[{"framework": "NIST CSF", "control": "PR.AC-4"}, {"framework": "PCI-DSS", "control": "7.1"}]',
  'playbook-unauthorized-privilege-escalation',
  '2026-03-28T14:01:00Z', 'pass'
);
END IF;

-- NC-003: Orphan Process Chain
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-003: Orphan Process Chain') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-003: Orphan Process Chain',
  'A process tree was detected where the root process has no traceable parent chain leading to a legitimate session manager (sshd, login, winlogon). The process appeared without a valid spawn ancestry.',
  'Negative Correlation', 'Missing Prerequisite', 'high', 0.88,
  ARRAY['Execution', 'Defense Evasion'],
  ARRAY['T1055', 'T1106', 'T1014'],
  ARRAY['process_events', 'endpoint_agent', 'session_manager_logs'],
  '{"pseudo_code": "IF process(pid=P, ppid=PP) EXISTS\n  AND process(pid=PP) NOT EXISTS\n  AND P.ppid NOT IN (0, 1, 2)\nTHEN ALERT", "time_window": "1m", "threshold": 1, "group_by": "host_id, pid", "negative_constraint": {"observed": "process_execution", "expected_missing": "parent_process_ancestry", "relationship": "prerequisite"}}',
  true,
  ARRAY['negative-correlation', 'orphan-process', 'rootkit', 'process-injection'],
  'SOC Detection Engineering',
  1205, 0.05, now() - interval '45 minutes', 'negative_correlation', 7.5,
  '2.1.0', 'production',
  '[{"version": "1.0.0", "date": "2025-06-10", "type": "created", "summary": "Initial orphan process detection rule"}, {"version": "2.1.0", "date": "2026-01-15", "type": "updated", "summary": "Added container PID namespace isolation exclusion"}]',
  '[{"name": "Detect broken parent chain", "status": "pass", "description": "Process with ppid pointing to dead process", "last_run": "2026-03-25T08:00:00Z"}, {"name": "Exclude kernel threads", "status": "pass", "description": "Ensure kernel threads (ppid=0,1,2) do not trigger", "last_run": "2026-03-25T08:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-01-15T10:00:00Z", "deployed_by": "slee", "version": "2.1.0", "status": "success", "commit": "c4f2a81"}]',
  'approved', 'kpatel', '2026-01-14T17:00:00Z', 'c4f2a81', 'sigma',
  '[{"framework": "NIST CSF", "control": "DE.CM-4"}]',
  'playbook-orphan-process-investigation',
  '2026-03-25T08:01:00Z', 'pass'
);
END IF;

-- NC-004: Shadow Database Query
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-004: Shadow Database Query') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-004: Shadow Database Query',
  'Database queries executed against production tables without preceding application-layer authentication. Queries bypass the application authentication stack entirely, suggesting direct database access with stolen credentials.',
  'Negative Correlation', 'Missing Prerequisite', 'critical', 0.90,
  ARRAY['Collection', 'Initial Access'],
  ARRAY['T1078', 'T1190', 'T1213'],
  ARRAY['db_query_log', 'app_auth_events', 'oauth_token_log'],
  '{"pseudo_code": "IF db_query(db=D, user=U, src_ip=IP) EXISTS\n  AND app_auth(service=S, src_ip=IP, time > now-1h) NOT EXISTS\nTHEN ALERT", "time_window": "1h", "threshold": 1, "group_by": "source_ip, database", "negative_constraint": {"observed": "database_query", "expected_missing": "application_authentication", "relationship": "prerequisite"}}',
  true,
  ARRAY['negative-correlation', 'shadow-query', 'database-security', 'data-exfiltration'],
  'SOC Detection Engineering',
  156, 0.04, now() - interval '2 hours', 'negative_correlation', 8.0,
  '1.4.0', 'production',
  '[{"version": "1.0.0", "date": "2025-10-01", "type": "created", "summary": "Initial shadow database query detection"}, {"version": "1.4.0", "date": "2026-03-01", "type": "updated", "summary": "Added DBA tool exclusion whitelist"}]',
  '[{"name": "Detect query from non-app IP", "status": "pass", "description": "Query from developer VLAN with no app auth", "last_run": "2026-04-02T09:00:00Z"}, {"name": "Allow monitoring agents", "status": "pass", "description": "Monitoring agent queries should not trigger", "last_run": "2026-04-02T09:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-03-01T12:00:00Z", "deployed_by": "rthompson", "version": "1.4.0", "status": "success", "commit": "d8e3f15"}]',
  'approved', 'mwilliams', '2026-02-28T14:00:00Z', 'd8e3f15', 'sigma',
  '[{"framework": "PCI-DSS", "control": "10.2"}, {"framework": "SOC2", "control": "CC6.1"}]',
  'playbook-shadow-database-access',
  '2026-04-02T09:01:00Z', 'pass'
);
END IF;

-- NC-005: Invisible Account Creation
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-005: Invisible Account Creation') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-005: Invisible Account Creation',
  'A new user account appeared in Active Directory or IAM without any provisioning workflow, HR onboarding event, or admin action log. The account materialized as if created by a ghost.',
  'Negative Correlation', 'Missing Prerequisite', 'critical', 0.96,
  ARRAY['Persistence', 'Privilege Escalation'],
  ARRAY['T1136.001', 'T1136.002', 'T1098'],
  ARRAY['account_creation_events', 'hr_events', 'admin_audit_log', 'iac_pipeline_logs'],
  '{"pseudo_code": "IF account_create(user=U) EXISTS\n  AND (hr_onboard(user=U) OR provision_workflow(user=U)\n    OR admin_action(target=U)) NOT EXISTS\nTHEN ALERT", "time_window": "7d", "threshold": 1, "group_by": "account_name", "negative_constraint": {"observed": "account_creation", "expected_missing": "provisioning_workflow", "relationship": "prerequisite"}}',
  true,
  ARRAY['negative-correlation', 'ghost-account', 'iam-security', 'insider-threat'],
  'SOC Detection Engineering',
  42, 0.01, now() - interval '6 hours', 'negative_correlation', 9.5,
  '2.0.0', 'production',
  '[{"version": "1.0.0", "date": "2025-09-01", "type": "created", "summary": "Initial ghost account detection rule"}, {"version": "2.0.0", "date": "2026-01-10", "type": "promoted", "summary": "Promoted to production with IaC pipeline exclusion"}]',
  '[{"name": "Detect account with no HR event", "status": "pass", "description": "Create account with no matching HR onboarding", "last_run": "2026-03-30T11:00:00Z"}, {"name": "Exclude IaC service accounts", "status": "pass", "description": "Terraform-created service accounts should not trigger", "last_run": "2026-03-30T11:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-01-10T08:00:00Z", "deployed_by": "lzhang", "version": "2.0.0", "status": "success", "commit": "f1a2b3c"}]',
  'approved', 'agarcia', '2026-01-09T16:00:00Z', 'f1a2b3c', 'sigma',
  '[{"framework": "NIST CSF", "control": "PR.AC-1"}, {"framework": "ISO 27001", "control": "A.9.2.1"}]',
  'playbook-ghost-account-response',
  '2026-03-30T11:01:00Z', 'pass'
);
END IF;

-- NC-006: Quantum Presence Paradox
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-006: Quantum Presence Paradox') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-006: Quantum Presence Paradox',
  'A user has an active VPN session from an external IP while simultaneously badging into a secure facility. These events are mutually exclusive unless the user can exist in two places at once. Indicates credential compromise.',
  'Negative Correlation', 'Impossible Coexistence', 'critical', 0.97,
  ARRAY['Initial Access', 'Credential Access'],
  ARRAY['T1078', 'T1133', 'T1078.004'],
  ARRAY['vpn_sessions', 'badge_swipes', 'corporate_ip_ranges', 'geolocation_db'],
  '{"pseudo_code": "IF vpn_session(user=U, status=active, src_ip=EXTERNAL) EXISTS\n  AND badge_swipe(user=U, location=L) EXISTS\n  AND vpn_session.last_activity > badge_swipe.time - 10min\nTHEN ALERT(impossibility=coexistence)", "time_window": "10m", "threshold": 1, "group_by": "user_id", "negative_constraint": {"observed": "vpn_session AND badge_swipe", "expected_missing": "mutual_exclusion_violated", "relationship": "impossible_coexistence"}}',
  true,
  ARRAY['negative-correlation', 'impossible-coexistence', 'credential-theft', 'physical-logical-correlation'],
  'SOC Detection Engineering',
  89, 0.02, now() - interval '28 minutes', 'negative_correlation', 9.0,
  '2.2.0', 'production',
  '[{"version": "1.0.0", "date": "2025-07-15", "type": "created", "summary": "Initial VPN+badge coexistence detection"}, {"version": "2.0.0", "date": "2025-10-01", "type": "promoted", "summary": "Production deployment with TOR exit node enrichment"}, {"version": "2.2.0", "date": "2026-02-15", "type": "updated", "summary": "Added VPN keepalive tolerance window to reduce FPs"}]',
  '[{"name": "Alert on VPN+badge overlap", "status": "pass", "description": "Active VPN from Amsterdam while badge in SF", "last_run": "2026-04-03T07:00:00Z"}, {"name": "No alert after VPN disconnect", "status": "pass", "description": "VPN disconnected before badge swipe", "last_run": "2026-04-03T07:01:00Z"}, {"name": "Handle VPN keepalive grace period", "status": "pass", "description": "VPN keepalive within 2min of disconnect should not trigger", "last_run": "2026-04-03T07:02:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-02-15T14:00:00Z", "deployed_by": "dpark", "version": "2.2.0", "status": "success", "commit": "a7b8c9d"}]',
  'approved', 'slee', '2026-02-14T11:00:00Z', 'a7b8c9d', 'custom',
  '[{"framework": "NIST CSF", "control": "DE.AE-2"}, {"framework": "MITRE ATT&CK", "control": "T1078"}]',
  'playbook-quantum-presence-response',
  '2026-04-03T07:02:00Z', 'pass'
);
END IF;

-- NC-007: Dual-Session Bilocation
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-007: Dual-Session Bilocation') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-007: Dual-Session Bilocation',
  'The same user account is authenticated in two interactive sessions on hosts in different physically isolated (air-gapped) network segments. No bridging exists between these segments.',
  'Negative Correlation', 'Impossible Coexistence', 'critical', 0.98,
  ARRAY['Lateral Movement', 'Credential Access'],
  ARRAY['T1078', 'T1021', 'T1550'],
  ARRAY['active_sessions', 'network_segmentation_db', 'airgap_inventory'],
  '{"pseudo_code": "IF session(user=U, host=H1, segment=S1, type=interactive) EXISTS\n  AND session(user=U, host=H2, segment=S2, type=interactive) EXISTS\n  AND S1 != S2 AND segments_are_airgapped(S1, S2)\nTHEN ALERT(impossibility=bilocation)", "time_window": "2m", "threshold": 1, "group_by": "user_id", "negative_constraint": {"observed": "dual_interactive_sessions", "expected_missing": "physical_bridging", "relationship": "impossible_coexistence"}}',
  true,
  ARRAY['negative-correlation', 'impossible-coexistence', 'airgap-violation', 'ics-security'],
  'SOC Detection Engineering',
  12, 0.01, now() - interval '4 hours', 'negative_correlation', 9.5,
  '1.2.0', 'production',
  '[{"version": "1.0.0", "date": "2025-11-01", "type": "created", "summary": "Initial airgap bilocation detection"}, {"version": "1.2.0", "date": "2026-03-05", "type": "updated", "summary": "Added maintenance window bridge exclusion"}]',
  '[{"name": "Detect dual airgap sessions", "status": "pass", "description": "Same user on OT and IT segments simultaneously", "last_run": "2026-04-01T06:00:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-03-05T09:00:00Z", "deployed_by": "jchen", "version": "1.2.0", "status": "success", "commit": "b2c3d4e"}]',
  'approved', 'mwilliams', '2026-03-04T16:00:00Z', 'b2c3d4e', 'custom',
  '[{"framework": "NIST CSF", "control": "PR.AC-5"}, {"framework": "IEC 62443", "control": "SR 5.1"}]',
  'playbook-airgap-violation-response',
  '2026-04-01T06:00:00Z', 'pass'
);
END IF;

-- NC-008: Dead User Walking
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-008: Dead User Walking') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-008: Dead User Walking',
  'An account is generating active authentication events while the account status in IAM shows disabled, locked, or terminated. A dead account is walking the network.',
  'Negative Correlation', 'Impossible Coexistence', 'critical', 0.99,
  ARRAY['Persistence', 'Defense Evasion'],
  ARRAY['T1078.001', 'T1078.002', 'T1098'],
  ARRAY['auth_events', 'user_accounts', 'iam_system', 'kerberos_tgt_log'],
  '{"pseudo_code": "IF auth_success(user=U) EXISTS\n  AND account_status(user=U, status IN (disabled, locked, terminated)) EXISTS\nTHEN ALERT(impossibility=dead_account_active)", "time_window": "instant", "threshold": 1, "group_by": "user_id", "negative_constraint": {"observed": "authentication_success", "expected_missing": "account_should_be_inactive", "relationship": "impossible_coexistence"}}',
  true,
  ARRAY['negative-correlation', 'impossible-coexistence', 'zombie-account', 'golden-ticket'],
  'SOC Detection Engineering',
  67, 0.01, now() - interval '1 hour', 'negative_correlation', 7.0,
  '3.0.0', 'production',
  '[{"version": "1.0.0", "date": "2025-06-01", "type": "created", "summary": "Initial dead user detection"}, {"version": "2.0.0", "date": "2025-08-15", "type": "updated", "summary": "Added Kerberos TGT analysis for golden ticket detection"}, {"version": "3.0.0", "date": "2026-01-20", "type": "promoted", "summary": "Major overhaul with AD replication lag tolerance"}]',
  '[{"name": "Alert on disabled account auth", "status": "pass", "description": "Terminated user authenticating successfully", "last_run": "2026-04-04T12:00:00Z"}, {"name": "Handle replication lag", "status": "pass", "description": "No alert during 5-min AD replication window", "last_run": "2026-04-04T12:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-01-20T08:00:00Z", "deployed_by": "agarcia", "version": "3.0.0", "status": "success", "commit": "c3d4e5f"}]',
  'approved', 'rthompson', '2026-01-19T15:00:00Z', 'c3d4e5f', 'sigma',
  '[{"framework": "NIST CSF", "control": "PR.AC-1"}, {"framework": "ISO 27001", "control": "A.9.2.6"}]',
  'playbook-zombie-account-containment',
  '2026-04-04T12:01:00Z', 'pass'
);
END IF;

-- NC-009: Encryption Without Keys
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-009: Encryption Without Keys') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-009: Encryption Without Keys',
  'Encrypted data blobs written to storage without any KMS API call. Data was encrypted without observable key management activity, suggesting hardcoded or smuggled encryption keys.',
  'Negative Correlation', 'Impossible Coexistence', 'high', 0.85,
  ARRAY['Impact', 'Exfiltration'],
  ARRAY['T1486', 'T1027', 'T1560'],
  ARRAY['storage_events', 'kms_audit_log', 'entropy_analysis'],
  '{"pseudo_code": "IF encrypted_write(service=S, entropy > 7.8) EXISTS\n  AND kms_api_call(service=S) NOT EXISTS\nTHEN ALERT", "time_window": "1h", "threshold": 1, "group_by": "service_identity", "negative_constraint": {"observed": "encrypted_data_write", "expected_missing": "kms_key_operation", "relationship": "impossible_coexistence"}}',
  true,
  ARRAY['negative-correlation', 'impossible-coexistence', 'ransomware', 'crypto-abuse'],
  'SOC Detection Engineering',
  31, 0.06, now() - interval '5 hours', 'negative_correlation', 8.5,
  '1.1.0', 'staging',
  '[{"version": "1.0.0", "date": "2026-01-01", "type": "created", "summary": "Initial encryption-without-KMS detection"}, {"version": "1.1.0", "date": "2026-03-15", "type": "updated", "summary": "Added HSM exclusion and entropy threshold tuning"}]',
  '[{"name": "Detect encrypted write without KMS", "status": "pass", "description": "High-entropy file upload with no KMS calls", "last_run": "2026-04-01T14:00:00Z"}, {"name": "Allow HSM-based encryption", "status": "fail", "description": "HSM encryption should not trigger - currently does", "last_run": "2026-04-01T14:01:00Z"}]',
  '[{"environment": "staging", "deployed_at": "2026-03-15T10:00:00Z", "deployed_by": "slee", "version": "1.1.0", "status": "success", "commit": "d4e5f6a"}]',
  'changes_requested', 'kpatel', '2026-03-20T09:00:00Z', 'd4e5f6a', 'sigma',
  '[{"framework": "NIST CSF", "control": "PR.DS-1"}]',
  'playbook-unauthorized-encryption',
  '2026-04-01T14:01:00Z', 'fail'
);
END IF;

-- NC-010: Phantom File Transfer
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-010: Phantom File Transfer') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-010: Phantom File Transfer',
  'Application logs show a large file transfer completed (100MB+), but network monitoring recorded no corresponding flow. Data exfiltrated through an unmonitored channel or the application log was forged.',
  'Negative Correlation', 'Missing Consequence', 'critical', 0.93,
  ARRAY['Exfiltration', 'Command and Control'],
  ARRAY['T1048', 'T1041', 'T1071'],
  ARRAY['file_transfer_logs', 'netflow_records', 'firewall_logs', 'proxy_logs'],
  '{"pseudo_code": "IF file_transfer(app=A, size > 100MB, status=complete) EXISTS\n  AND netflow(src=A.src, dst=A.dst, bytes > 80MB) NOT EXISTS\nTHEN ALERT(consequence_missing=true)", "time_window": "5m", "threshold": 1, "group_by": "source_ip, dest_ip", "negative_constraint": {"observed": "file_transfer_complete", "expected_missing": "network_flow_record", "relationship": "missing_consequence"}}',
  true,
  ARRAY['negative-correlation', 'missing-consequence', 'data-exfiltration', 'log-forgery'],
  'SOC Detection Engineering',
  78, 0.04, now() - interval '90 minutes', 'negative_correlation', 8.5,
  '2.1.0', 'production',
  '[{"version": "1.0.0", "date": "2025-08-01", "type": "created", "summary": "Initial phantom transfer detection"}, {"version": "2.1.0", "date": "2026-02-10", "type": "updated", "summary": "Added compression ratio tolerance for netflow byte comparison"}]',
  '[{"name": "Detect transfer without netflow", "status": "pass", "description": "500MB transfer with no matching network flow", "last_run": "2026-04-02T16:00:00Z"}, {"name": "Allow localhost transfers", "status": "pass", "description": "Loopback transfers should not trigger", "last_run": "2026-04-02T16:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-02-10T11:00:00Z", "deployed_by": "mwilliams", "version": "2.1.0", "status": "success", "commit": "e5f6a7b"}]',
  'approved', 'jchen', '2026-02-09T14:00:00Z', 'e5f6a7b', 'sigma',
  '[{"framework": "NIST CSF", "control": "DE.CM-1"}, {"framework": "PCI-DSS", "control": "10.5"}]',
  'playbook-phantom-transfer-response',
  '2026-04-02T16:01:00Z', 'pass'
);
END IF;

-- NC-011: Silent Deployment
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-011: Silent Deployment') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-011: Silent Deployment',
  'CI/CD pipeline reports successful production deployment, but no container restart, service reload, or binary change detected on target. The deployment claimed to succeed without changing anything.',
  'Negative Correlation', 'Missing Consequence', 'high', 0.87,
  ARRAY['Execution', 'Supply Chain'],
  ARRAY['T1195.002', 'T1059', 'T1072'],
  ARRAY['deployment_events', 'k8s_events', 'containerd_logs', 'infrastructure_events'],
  '{"pseudo_code": "IF deploy_event(pipeline=P, status=success, target=production) EXISTS\n  AND (container_restart OR service_reload OR file_change) NOT EXISTS\nTHEN ALERT", "time_window": "15m", "threshold": 1, "group_by": "pipeline_id, target_host", "negative_constraint": {"observed": "deployment_success", "expected_missing": "infrastructure_change", "relationship": "missing_consequence"}}',
  true,
  ARRAY['negative-correlation', 'missing-consequence', 'supply-chain', 'cicd-security'],
  'SOC Detection Engineering',
  45, 0.08, now() - interval '7 hours', 'negative_correlation', 7.5,
  '1.3.0', 'testing',
  '[{"version": "1.0.0", "date": "2026-01-15", "type": "created", "summary": "Initial silent deployment detection"}, {"version": "1.3.0", "date": "2026-03-20", "type": "updated", "summary": "Added blue-green deployment exclusion"}]',
  '[{"name": "Detect deployment without restart", "status": "pass", "description": "Pipeline succeeds but no k8s pod restart", "last_run": "2026-04-03T08:00:00Z"}, {"name": "Handle blue-green deploy", "status": "fail", "description": "Blue-green switch should not trigger - needs traffic switch detection", "last_run": "2026-04-03T08:01:00Z"}]',
  '[{"environment": "testing", "deployed_at": "2026-03-20T10:00:00Z", "deployed_by": "kpatel", "version": "1.3.0", "status": "success", "commit": "f6a7b8c"}]',
  'pending_review', 'lzhang', null, 'f6a7b8c', 'custom',
  '[{"framework": "NIST CSF", "control": "DE.CM-8"}]',
  null,
  '2026-04-03T08:01:00Z', 'fail'
);
END IF;

-- NC-012: Backup Black Hole
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-012: Backup Black Hole') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-012: Backup Black Hole',
  'Backup job reports success with expected data volume, but storage subsystem recorded no I/O spike and no new objects appeared. Data supposedly backed up vanished into a black hole.',
  'Negative Correlation', 'Missing Consequence', 'high', 0.84,
  ARRAY['Impact', 'Inhibit Response Function'],
  ARRAY['T1490', 'T1485', 'T1561'],
  ARRAY['backup_events', 'storage_metrics', 'file_system_events'],
  '{"pseudo_code": "IF backup_complete(job=J, status=success, size > 0) EXISTS\n  AND (storage_io_spike OR new_objects) NOT EXISTS\nTHEN ALERT(consequence_missing=true)", "time_window": "10m", "threshold": 1, "group_by": "backup_job_id", "negative_constraint": {"observed": "backup_success", "expected_missing": "storage_activity", "relationship": "missing_consequence"}}',
  true,
  ARRAY['negative-correlation', 'missing-consequence', 'backup-integrity', 'disaster-recovery'],
  'SOC Detection Engineering',
  23, 0.05, now() - interval '12 hours', 'negative_correlation', 7.0,
  '1.0.0', 'staging',
  '[{"version": "1.0.0", "date": "2026-02-01", "type": "created", "summary": "Initial backup black hole detection rule"}]',
  '[{"name": "Detect backup without I/O", "status": "pass", "description": "Backup reports success but no IOPS increase", "last_run": "2026-03-28T20:00:00Z"}]',
  '[{"environment": "staging", "deployed_at": "2026-02-01T09:00:00Z", "deployed_by": "dpark", "version": "1.0.0", "status": "success", "commit": "a7b8c9d"}]',
  'pending_review', null, null, 'a7b8c9d', 'custom',
  '[{"framework": "NIST CSF", "control": "PR.IP-4"}]',
  null,
  '2026-03-28T20:00:00Z', 'pass'
);
END IF;

-- NC-013: Human Speed Violation
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-013: Human Speed Violation') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-013: Human Speed Violation',
  'A user performed code review, approval, and merge in a timeframe too short for human review. 500+ lines reviewed in under 30 seconds suggests automated rubber-stamping or credential abuse.',
  'Negative Correlation', 'Temporal Impossibility', 'high', 0.91,
  ARRAY['Supply Chain', 'Execution'],
  ARRAY['T1195.002', 'T1059', 'T1199'],
  ARRAY['code_review_events', 'merge_events', 'git_audit_log'],
  '{"pseudo_code": "IF code_review_approve(user=U, lines_changed > 500, time=T1) EXISTS\n  AND merge_event(user=U, time=T2) EXISTS\n  AND (T2 - T1) < 30s\nTHEN ALERT(temporal_impossibility=true)", "time_window": "30s", "threshold": 1, "group_by": "pull_request_id", "negative_constraint": {"observed": "review_and_merge", "expected_missing": "humanly_possible_review_time", "relationship": "temporal_impossibility"}}',
  true,
  ARRAY['negative-correlation', 'temporal-impossibility', 'supply-chain', 'code-review'],
  'SOC Detection Engineering',
  167, 0.07, now() - interval '2 hours', 'negative_correlation', 7.5,
  '2.0.0', 'production',
  '[{"version": "1.0.0", "date": "2025-10-15", "type": "created", "summary": "Initial human speed violation detection"}, {"version": "2.0.0", "date": "2026-01-30", "type": "promoted", "summary": "Promoted with dependency-bump exclusion"}]',
  '[{"name": "Detect speed violation", "status": "pass", "description": "2847 lines reviewed in 7 seconds", "last_run": "2026-04-02T11:00:00Z"}, {"name": "Allow bot accounts", "status": "pass", "description": "Known bot accounts should not trigger", "last_run": "2026-04-02T11:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-01-30T13:00:00Z", "deployed_by": "jmorales", "version": "2.0.0", "status": "success", "commit": "b8c9d0e"}]',
  'approved', 'agarcia', '2026-01-29T16:00:00Z', 'b8c9d0e', 'sigma',
  '[{"framework": "NIST CSF", "control": "PR.IP-2"}]',
  'playbook-rubber-stamp-review',
  '2026-04-02T11:01:00Z', 'pass'
);
END IF;

-- NC-014: Teleportation Anomaly
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-014: Teleportation Anomaly') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-014: Teleportation Anomaly',
  'A user authenticated from two geolocations that are physically impossible to travel between in the elapsed time. Login from Tokyo, then 12 minutes later from London. One session is compromised.',
  'Negative Correlation', 'Temporal Impossibility', 'critical', 0.96,
  ARRAY['Initial Access', 'Credential Access'],
  ARRAY['T1078', 'T1078.004', 'T1550.001'],
  ARRAY['auth_events', 'geolocation_db', 'ip_reputation_feeds'],
  '{"pseudo_code": "IF auth(user=U, geo=G1, time=T1) EXISTS\n  AND auth(user=U, geo=G2, time=T2) EXISTS\n  AND distance(G1,G2) / (T2-T1) > 1000 km/h\nTHEN ALERT(impossibility=teleportation)", "time_window": "dynamic", "threshold": 1, "group_by": "user_id", "negative_constraint": {"observed": "dual_geo_auth", "expected_missing": "physically_possible_travel", "relationship": "temporal_impossibility"}}',
  true,
  ARRAY['negative-correlation', 'temporal-impossibility', 'impossible-travel', 'credential-theft'],
  'SOC Detection Engineering',
  234, 0.03, now() - interval '18 minutes', 'negative_correlation', 8.0,
  '3.2.0', 'production',
  '[{"version": "1.0.0", "date": "2025-05-01", "type": "created", "summary": "Initial impossible travel detection"}, {"version": "2.0.0", "date": "2025-08-01", "type": "promoted", "summary": "Production with VPN exit node enrichment"}, {"version": "3.2.0", "date": "2026-03-01", "type": "updated", "summary": "Added mobile carrier IP geolocation tolerance"}]',
  '[{"name": "Alert on impossible travel", "status": "pass", "description": "Tokyo to London in 12 minutes", "last_run": "2026-04-04T06:00:00Z"}, {"name": "Handle VPN exit nodes", "status": "pass", "description": "Known VPN exit node pairs should adjust confidence", "last_run": "2026-04-04T06:01:00Z"}, {"name": "Mobile carrier tolerance", "status": "pass", "description": "Mobile IPs with known geo inaccuracy get reduced confidence", "last_run": "2026-04-04T06:02:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-03-01T08:00:00Z", "deployed_by": "lzhang", "version": "3.2.0", "status": "success", "commit": "c9d0e1f"}]',
  'approved', 'dpark', '2026-02-28T15:00:00Z', 'c9d0e1f', 'sigma',
  '[{"framework": "NIST CSF", "control": "DE.AE-2"}, {"framework": "MITRE ATT&CK", "control": "T1078.004"}]',
  'playbook-impossible-travel-response',
  '2026-04-04T06:02:00Z', 'pass'
);
END IF;

-- NC-015: Retroactive Timestamp Manipulation
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-015: Retroactive Timestamp Manipulation') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-015: Retroactive Timestamp Manipulation',
  'Events arrived with timestamps that precede the creation timestamp of the log source. The server didn''t exist when the events claim to have occurred. Someone is backdating logs.',
  'Negative Correlation', 'Temporal Impossibility', 'high', 0.89,
  ARRAY['Defense Evasion'],
  ARRAY['T1070.006', 'T1070', 'T1036'],
  ARRAY['security_events', 'host_inventory', 'ntp_sync_logs'],
  '{"pseudo_code": "IF event(source=H, timestamp=T) EXISTS\n  AND host_creation(host=H, created_at=C) EXISTS\n  AND T < C\nTHEN ALERT(temporal_impossibility=true)", "time_window": "instant", "threshold": 1, "group_by": "source_host", "negative_constraint": {"observed": "event_timestamp", "expected_missing": "host_existence_at_event_time", "relationship": "temporal_impossibility"}}',
  true,
  ARRAY['negative-correlation', 'temporal-impossibility', 'log-tampering', 'anti-forensics'],
  'SOC Detection Engineering',
  56, 0.05, now() - interval '36 hours', 'negative_correlation', 6.5,
  '1.1.0', 'production',
  '[{"version": "1.0.0", "date": "2025-12-01", "type": "created", "summary": "Initial retroactive timestamp detection"}, {"version": "1.1.0", "date": "2026-02-15", "type": "updated", "summary": "Added VM clone timestamp inheritance exclusion"}]',
  '[{"name": "Detect backdated events", "status": "pass", "description": "Event timestamp before host first boot", "last_run": "2026-03-25T15:00:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-02-15T10:00:00Z", "deployed_by": "slee", "version": "1.1.0", "status": "success", "commit": "d0e1f2a"}]',
  'approved', 'kpatel', '2026-02-14T14:00:00Z', 'd0e1f2a', 'sigma',
  '[{"framework": "NIST CSF", "control": "DE.CM-3"}]',
  'playbook-log-tampering-investigation',
  '2026-03-25T15:00:00Z', 'pass'
);
END IF;

-- NC-016: Midnight Badge Paradox
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-016: Midnight Badge Paradox') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-016: Midnight Badge Paradox',
  'Employee badged into secure floor at 3 AM, but no parking garage entry, lobby door sensor, elevator call, or camera footage shows anyone entering the building. Badge used on secure floor without physical building entry.',
  'Negative Correlation', 'Physics Violation', 'critical', 0.94,
  ARRAY['Physical Security', 'Initial Access'],
  ARRAY['T1200', 'T1078.001', 'T1556'],
  ARRAY['badge_swipes', 'parking_events', 'door_sensors', 'elevator_system', 'cctv_analysis'],
  '{"pseudo_code": "IF badge_swipe(user=U, floor=secure, time=OFF_HOURS) EXISTS\n  AND (parking_entry OR lobby_sensor OR elevator_call) NOT EXISTS\nTHEN ALERT(physics_violation=true)", "time_window": "30m", "threshold": 1, "group_by": "badge_id", "negative_constraint": {"observed": "badge_on_secure_floor", "expected_missing": "building_entry_evidence", "relationship": "physics_violation"}}',
  true,
  ARRAY['negative-correlation', 'physics-violation', 'physical-security', 'badge-cloning'],
  'SOC Detection Engineering',
  18, 0.02, now() - interval '14 hours', 'negative_correlation', 9.0,
  '1.5.0', 'production',
  '[{"version": "1.0.0", "date": "2025-11-15", "type": "created", "summary": "Initial midnight badge paradox detection"}, {"version": "1.5.0", "date": "2026-03-01", "type": "updated", "summary": "Added CCTV AI vision model correlation for empty corridor verification"}]',
  '[{"name": "Badge without building entry", "status": "pass", "description": "Badge on floor 5 at 3AM with no building entry", "last_run": "2026-04-01T03:00:00Z"}, {"name": "Allow overnight workers", "status": "pass", "description": "Known overnight shift workers should not trigger", "last_run": "2026-04-01T03:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-03-01T07:00:00Z", "deployed_by": "rthompson", "version": "1.5.0", "status": "success", "commit": "e1f2a3b"}]',
  'approved', 'mwilliams', '2026-02-28T16:00:00Z', 'e1f2a3b', 'custom',
  '[{"framework": "NIST CSF", "control": "DE.CM-2"}, {"framework": "ISO 27001", "control": "A.11.1.2"}]',
  'playbook-physical-badge-anomaly',
  '2026-04-01T03:01:00Z', 'pass'
);
END IF;

-- NC-017: USB Data Telekinesis
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-017: USB Data Telekinesis') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-017: USB Data Telekinesis',
  'DLP detected sensitive data written to USB device, but endpoint agent reports no USB device insertion. Data moved to storage that was never physically connected. Suggests DLP bypass or virtual drive masquerading.',
  'Negative Correlation', 'Physics Violation', 'critical', 0.91,
  ARRAY['Exfiltration', 'Collection'],
  ARRAY['T1052', 'T1091', 'T1025'],
  ARRAY['dlp_alerts', 'endpoint_events', 'windows_event_log', 'device_inventory'],
  '{"pseudo_code": "IF dlp_alert(host=H, destination=USB, data_class=sensitive) EXISTS\n  AND usb_insert(host=H) NOT EXISTS\nTHEN ALERT(physics_violation=true)", "time_window": "2h", "threshold": 1, "group_by": "host_id", "negative_constraint": {"observed": "dlp_usb_write_alert", "expected_missing": "usb_device_insertion", "relationship": "physics_violation"}}',
  true,
  ARRAY['negative-correlation', 'physics-violation', 'dlp-bypass', 'data-theft'],
  'SOC Detection Engineering',
  7, 0.03, now() - interval '48 hours', 'negative_correlation', 8.0,
  '1.0.0', 'testing',
  '[{"version": "1.0.0", "date": "2026-03-01", "type": "created", "summary": "Initial USB telekinesis detection rule"}]',
  '[{"name": "Detect write without USB insert", "status": "pass", "description": "DLP alert on removable drive with no USB event", "last_run": "2026-03-30T10:00:00Z"}, {"name": "Exclude virtual USB for VMs", "status": "fail", "description": "VM passthrough USB needs exclusion - not yet implemented", "last_run": "2026-03-30T10:01:00Z"}]',
  '[{"environment": "testing", "deployed_at": "2026-03-01T12:00:00Z", "deployed_by": "jchen", "version": "1.0.0", "status": "success", "commit": "f2a3b4c"}]',
  'pending_review', null, null, 'f2a3b4c', 'custom',
  '[{"framework": "NIST CSF", "control": "PR.DS-5"}, {"framework": "PCI-DSS", "control": "9.6"}]',
  null,
  '2026-03-30T10:01:00Z', 'fail'
);
END IF;

-- NC-018: Invisible Network Hop
IF NOT EXISTS (SELECT 1 FROM correlation_rules_library WHERE rule_name = 'NC-018: Invisible Network Hop') THEN
INSERT INTO correlation_rules_library (
  rule_name, rule_description, category, subcategory, severity, confidence_score,
  mitre_tactics, mitre_techniques, data_sources, rule_logic, enabled, tags, author,
  trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score,
  version, dac_status, changelog, test_cases, deployment_history, review_status,
  reviewed_by, reviewed_at, git_ref, source_format, compliance_frameworks,
  response_playbook, last_tested_at, test_result
) VALUES (
  'NC-018: Invisible Network Hop',
  'Lateral movement detected between hosts on different subnets, but no router, switch, or firewall in the network path logged any traffic. Packets traversed infrastructure without leaving a trace.',
  'Negative Correlation', 'Physics Violation', 'critical', 0.97,
  ARRAY['Lateral Movement', 'Command and Control'],
  ARRAY['T1021', 'T1071', 'T1572'],
  ARRAY['lateral_movement_events', 'firewall_logs', 'switch_flow_logs', 'network_topology_db'],
  '{"pseudo_code": "IF lateral_movement(src=H1, dst=H2, subnets_differ=true) EXISTS\n  AND (fw_log(src_subnet, dst_subnet) OR switch_flow(src_mac, dst_mac)) NOT EXISTS\nTHEN ALERT(physics_violation=true)", "time_window": "2m", "threshold": 1, "group_by": "src_ip, dst_ip", "negative_constraint": {"observed": "lateral_movement", "expected_missing": "infrastructure_flow_logs", "relationship": "physics_violation"}}',
  true,
  ARRAY['negative-correlation', 'physics-violation', 'ghost-traffic', 'infrastructure-compromise'],
  'SOC Detection Engineering',
  34, 0.02, now() - interval '3 hours', 'negative_correlation', 9.5,
  '2.0.0', 'production',
  '[{"version": "1.0.0", "date": "2025-12-15", "type": "created", "summary": "Initial invisible network hop detection"}, {"version": "2.0.0", "date": "2026-02-28", "type": "promoted", "summary": "Production with network topology validation engine"}]',
  '[{"name": "Detect cross-subnet without FW log", "status": "pass", "description": "SMB from dev to finance subnet with no firewall entry", "last_run": "2026-04-03T09:00:00Z"}, {"name": "Allow L2 adjacent hosts", "status": "pass", "description": "Same-subnet communication should not trigger", "last_run": "2026-04-03T09:01:00Z"}]',
  '[{"environment": "production", "deployed_at": "2026-02-28T14:00:00Z", "deployed_by": "agarcia", "version": "2.0.0", "status": "success", "commit": "a3b4c5d"}]',
  'approved', 'slee', '2026-02-27T11:00:00Z', 'a3b4c5d', 'custom',
  '[{"framework": "NIST CSF", "control": "DE.CM-1"}, {"framework": "MITRE ATT&CK", "control": "T1021"}]',
  'playbook-invisible-hop-response',
  '2026-04-03T09:01:00Z', 'pass'
);
END IF;

END $$;
