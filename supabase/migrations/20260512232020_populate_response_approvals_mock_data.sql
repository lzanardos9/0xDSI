/*
  # Populate Response Approvals with rationale-rich mock data

  1. Inserts pending and historical approval requests into `response_action_approvals`
  2. Each row captures the WHY: trigger evidence, MITRE technique, blast-radius,
     reversibility, risk score, and the autonomous agent that requested the action
  3. Mix of pending (await operator decision), approved, executed, and rejected so
     the panel shows full lifecycle when filtered

  Notes:
  - requested_by/approved_by left NULL since these are demo records not tied to a user
  - scope_summary JSONB carries the rationale shown in the drilldown
*/

INSERT INTO response_action_approvals
  (action_id, action_type, target_entity, scope_summary, status, requested_at, ttl_minutes)
VALUES
  (
    'act-2026-05-12-0001',
    'isolate_host',
    'fin-trader-ws-08.acmeco.local',
    jsonb_build_object(
      'why', 'Endpoint executed mimikatz.exe within 4 minutes of a Cl0p MoveIT IOC match. Lateral movement risk to PCI segment is critical.',
      'trigger', jsonb_build_object(
        'rule_id', 'CR-EDR-MIMIKATZ-LSASS',
        'alert_id', 'ALT-2026-05-12-22817',
        'case_id', 'CASE-AC2023-MASTER',
        'confidence', 94
      ),
      'mitre', jsonb_build_array('T1003.001', 'T1078'),
      'blast_radius', jsonb_build_object(
        'segment', 'PCI-DMZ-3',
        'connected_assets', 12,
        'business_apps', jsonb_build_array('treasury-portal', 'swift-gateway')
      ),
      'risk_score', 92,
      'reversibility', 'reversible_via_nac_unisolate',
      'requested_by_agent', 'AutoContain-Agent-v3',
      'recommended_action', 'isolate via CrowdStrike RTR + NAC quarantine VLAN',
      'evidence_links', jsonb_build_array('event:evt-9912001', 'sigma:proc_creation_win_lsass_dump'),
      'estimated_latency_ms', 180
    ),
    'pending',
    now() - interval '3 minutes',
    30
  ),
  (
    'act-2026-05-12-0002',
    'disable_user',
    'k.malek@acmeco.local',
    jsonb_build_object(
      'why', 'Impossible-travel: Sao Paulo at 09:14 then Bucharest at 09:41. Followed by 412 Sharepoint downloads of HR PII in 6 minutes.',
      'trigger', jsonb_build_object(
        'rule_id', 'UEBA-IMPOSSIBLE-TRAVEL+EXFIL',
        'alert_id', 'ALT-2026-05-12-22841',
        'case_id', 'CASE-INSIDER-EXFIL-44',
        'confidence', 97
      ),
      'mitre', jsonb_build_array('T1078.004', 'T1530'),
      'blast_radius', jsonb_build_object(
        'identity_type', 'employee',
        'role', 'Senior HR Analyst',
        'group_memberships', jsonb_build_array('hr-pii-readers', 'workday-admins'),
        'mfa_enrolled', true
      ),
      'risk_score', 88,
      'reversibility', 'fully_reversible_via_okta_reactivate',
      'requested_by_agent', 'IdentityRisk-Agent-v2',
      'recommended_action', 'Okta deactivate + revoke all sessions + force step-up on cohort',
      'evidence_links', jsonb_build_array('ueba:imp-travel-991', 'sharepoint:audit-2204881'),
      'estimated_latency_ms', 95
    ),
    'pending',
    now() - interval '8 minutes',
    20
  ),
  (
    'act-2026-05-12-0003',
    'block_ip',
    '45.141.215.88',
    jsonb_build_object(
      'why', 'Confirmed Cl0p exfil sink. 6 IOCs cross-validate via Mandiant, MISP, and CISA AA23-158A. Already saw 2.1GB egress from edge node.',
      'trigger', jsonb_build_object(
        'rule_id', 'TI-CONFIRMED-C2-MULTISOURCE',
        'alert_id', 'ALT-2026-05-12-22802',
        'case_id', 'CASE-AC2023-MASTER',
        'confidence', 99
      ),
      'mitre', jsonb_build_array('T1041', 'T1071.001'),
      'blast_radius', jsonb_build_object(
        'edge_devices', jsonb_build_array('cloudflare-edge', 'palo-fw-01', 'palo-fw-02'),
        'taxii_peers_to_notify', 6,
        'collateral_risk', 'none - dedicated criminal infrastructure'
      ),
      'risk_score', 96,
      'reversibility', 'reversible_via_waf_rule_disable',
      'requested_by_agent', 'ThreatIntel-Broadcast-Agent',
      'recommended_action', 'Cloudflare edge block + WAF rule + STIX/TAXII broadcast',
      'evidence_links', jsonb_build_array('mandiant:CL0P-2023-Q2', 'misp:event-44192', 'cisa:AA23-158A'),
      'estimated_latency_ms', 432
    ),
    'pending',
    now() - interval '1 minute',
    15
  ),
  (
    'act-2026-05-12-0004',
    'rotate_credentials',
    'svc-databricks-etl@acmeco.local',
    jsonb_build_object(
      'why', 'Service principal token observed in pastebin dump scrape. Same token still active and used by 4 production jobs in the last hour.',
      'trigger', jsonb_build_object(
        'rule_id', 'TI-CREDLEAK-PASTEBIN',
        'alert_id', 'ALT-2026-05-12-22790',
        'case_id', 'CASE-CRED-LEAK-12',
        'confidence', 91
      ),
      'mitre', jsonb_build_array('T1552.001', 'T1078.004'),
      'blast_radius', jsonb_build_object(
        'principal_type', 'service_account',
        'consumers', 4,
        'downtime_estimate_minutes', 2,
        'requires_orchestrator_restart', true
      ),
      'risk_score', 78,
      'reversibility', 'irreversible_rotation - old token void',
      'requested_by_agent', 'SecretSpray-Agent',
      'recommended_action', 'Rotate via Vault + push new secret to Databricks job configs',
      'evidence_links', jsonb_build_array('darkweb:scrape-2026-05-12-091', 'vault:secret-svc-databricks-etl'),
      'estimated_latency_ms', 340
    ),
    'pending',
    now() - interval '14 minutes',
    45
  ),
  (
    'act-2026-05-12-0005',
    'isolate_host',
    'jumpbox-ops-03.acmeco.local',
    jsonb_build_object(
      'why', 'PsExec to 4 domain controllers within 90 seconds. Privileged jumpbox compromise - blast radius is the entire AD forest.',
      'trigger', jsonb_build_object(
        'rule_id', 'CR-LATERAL-PSEXEC-DC',
        'alert_id', 'ALT-2026-05-12-22650',
        'case_id', 'CASE-AC2023-MASTER',
        'confidence', 99
      ),
      'mitre', jsonb_build_array('T1021.002', 'T1570'),
      'blast_radius', jsonb_build_object(
        'segment', 'TIER-0-PAW',
        'connected_assets', 187,
        'criticality', 'tier_0_admin_workstation'
      ),
      'risk_score', 99,
      'reversibility', 'reversible_via_nac_unisolate',
      'requested_by_agent', 'AutoContain-Agent-v3',
      'evidence_links', jsonb_build_array('edr:cs-detection-44912', 'sysmon:eid-1-psexec'),
      'estimated_latency_ms', 120
    ),
    'approved',
    now() - interval '34 minutes',
    30
  ),
  (
    'act-2026-05-12-0006',
    'block_ip',
    '198.51.100.77',
    jsonb_build_object(
      'why', 'Brute-force SSH against perimeter bastion - 14,000 attempts in 5 minutes from single IP.',
      'trigger', jsonb_build_object(
        'rule_id', 'NET-BRUTE-SSH-RATELIMIT',
        'alert_id', 'ALT-2026-05-12-22501',
        'case_id', 'CASE-PERIMETER-99',
        'confidence', 89
      ),
      'mitre', jsonb_build_array('T1110.001'),
      'blast_radius', jsonb_build_object('edge_devices', jsonb_build_array('palo-fw-01'), 'collateral_risk', 'low'),
      'risk_score', 71,
      'reversibility', 'reversible_via_acl_remove',
      'requested_by_agent', 'PerimeterDefense-Agent',
      'estimated_latency_ms', 88
    ),
    'executed',
    now() - interval '2 hours',
    15
  ),
  (
    'act-2026-05-12-0007',
    'isolate_host',
    'dev-sandbox-04.acmeco.local',
    jsonb_build_object(
      'why', 'Heuristic match on suspicious LOLBin chain - low confidence; analyst flagged as known red-team simulation.',
      'trigger', jsonb_build_object(
        'rule_id', 'CR-LOLBIN-CHAIN-HEURISTIC',
        'alert_id', 'ALT-2026-05-12-22411',
        'case_id', 'CASE-DEV-NOISE-7',
        'confidence', 54
      ),
      'mitre', jsonb_build_array('T1059.001'),
      'blast_radius', jsonb_build_object('segment', 'DEV-SBX', 'connected_assets', 0),
      'risk_score', 28,
      'reversibility', 'reversible_via_nac_unisolate',
      'requested_by_agent', 'AutoContain-Agent-v3',
      'estimated_latency_ms', 200
    ),
    'rejected',
    now() - interval '46 minutes',
    30
  )
ON CONFLICT (action_id) DO NOTHING;

UPDATE response_action_approvals
SET approved_at = now() - interval '33 minutes',
    executed_at = now() - interval '32 minutes',
    execution_result = jsonb_build_object(
      'platform', 'CrowdStrike RTR',
      'latency_ms', 117,
      'success', true,
      'sessions_terminated', 3,
      'flows_torn_down', 4,
      'mimikatz_killed', true
    )
WHERE action_id = 'act-2026-05-12-0005' AND executed_at IS NULL;

UPDATE response_action_approvals
SET approved_at = now() - interval '119 minutes',
    executed_at = now() - interval '118 minutes',
    execution_result = jsonb_build_object(
      'platform', 'Palo Alto PAN-OS',
      'latency_ms', 88,
      'success', true,
      'rule_id', 'BLOCK-198.51.100.77-2026-05-12'
    )
WHERE action_id = 'act-2026-05-12-0006' AND executed_at IS NULL;

UPDATE response_action_approvals
SET approved_at = now() - interval '45 minutes',
    rejection_reason = 'Confirmed false positive: scheduled red-team exercise RT-2026-Q2-W18 in dev sandbox. No action needed.'
WHERE action_id = 'act-2026-05-12-0007' AND rejection_reason IS NULL OR rejection_reason = '';
