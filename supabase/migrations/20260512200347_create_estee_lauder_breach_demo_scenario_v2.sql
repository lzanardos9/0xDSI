/*
  # Estee Lauder 2023 Breach Simulation — Demo Scenario (v2)
  Retry with valid response_actions.action_type values.
*/
DO $$
DECLARE
  v_master_id uuid := gen_random_uuid();
  v_clop_id uuid := gen_random_uuid();
  v_alphv_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_t_minus_21 timestamptz := now() - interval '21 days';
  v_t_minus_21h timestamptz := now() - interval '21 hours';
  v_t_minus_18h timestamptz := now() - interval '18 hours';
  v_t_minus_9m timestamptz := now() - interval '9 minutes';
BEGIN
  IF EXISTS (SELECT 1 FROM public.cases WHERE case_number = 'CASE-EL2023-MASTER') THEN
    RETURN;
  END IF;

  INSERT INTO public.cases (
    id, case_number, title, description, status, priority, severity, category,
    assigned_to, created_by, risk_score, confidence, financial_impact_usd,
    affected_assets, affected_identities, tlp, kill_chain_phase,
    acknowledged_at, contained_at, ai_summary, originating_alert_id
  ) VALUES (
    v_master_id, 'CASE-EL2023-MASTER',
    'Converged Double-Extortion Intrusion — Cl0p + BlackCat (ALPHV)',
    'Two distinct threat actors converged on the MOVEit edge asset. Cl0p staged ~18GB via CVE-2023-34362 over 21 dormant days; BlackCat (ALPHV) exfiltrated 730MB across 14 chunks using stolen SSO credentials with impossible-travel signals. Contained in <9 minutes. Estimated prevented loss: 129.3GB.',
    'contained', 'critical', 'critical', 'ransomware',
    'soc-lead@estee.local', 'cet-engine',
    97, 0.94, 42800000,
    ARRAY['moveit-edge-01.estee.local','sso-idp.estee.local','jumpbox-ops-03.estee.local'],
    ARRAY['m.harris@estee.local','svc-moveit@estee.local'],
    'red', 'actions-on-objectives',
    v_now - interval '6 minutes', v_now - interval '1 minute',
    'CET engine correlated a 21-day dormant Cl0p staging trend with active BlackCat SSO abuse via shared exfil infrastructure. Four independent signals converged at confidence 0.94, triggering autonomous containment before second exfil chunk completed.',
    'ALERT-EL2023-CONVERGE'
  );

  INSERT INTO public.cases (
    id, case_number, title, description, status, priority, severity, category,
    assigned_to, created_by, risk_score, confidence, parent_case_id,
    affected_assets, tlp, kill_chain_phase, created_at, ai_summary
  ) VALUES (
    v_clop_id, 'CASE-EL2023-CLOP',
    'Cl0p — MOVEit CVE-2023-34362 Dormant Staging',
    'Cl0p operators exploited MOVEit Transfer zero-day 21 days before active exfil. Honeytoken within decoy share tripped on enumeration. CET engine held hypothesis dormant until reinforcement.',
    'contained', 'high', 'high', 'data_exfiltration',
    'hunt-team@estee.local', 'glasswing-scanner',
    78, 0.88, v_master_id,
    ARRAY['moveit-edge-01.estee.local'],
    'red', 'delivery',
    v_t_minus_21, 'Dormant hypothesis reinforced by honeytoken trip and staging-dir writes. Confidence climbed 0.18 -> 0.71 over 72 hours, then merged into master case on BlackCat signal arrival.'
  );

  INSERT INTO public.cases (
    id, case_number, title, description, status, priority, severity, category,
    assigned_to, created_by, risk_score, confidence, parent_case_id,
    affected_assets, affected_identities, tlp, kill_chain_phase, created_at, ai_summary
  ) VALUES (
    v_alphv_id, 'CASE-EL2023-ALPHV',
    'BlackCat (ALPHV) — Stolen SSO + Low-and-Slow Exfil',
    'ALPHV operators authenticated via stolen SSO credentials sold on dark web 3 days prior. Impossible travel Newark->Sofia in 11 minutes. 14 chunks of 50MB encrypted outbound before containment.',
    'contained', 'critical', 'critical', 'data_exfiltration',
    'ir-lead@estee.local', 'detection-confluence',
    95, 0.94, v_master_id,
    ARRAY['sso-idp.estee.local','jumpbox-ops-03.estee.local'],
    ARRAY['m.harris@estee.local'],
    'red', 'actions-on-objectives',
    v_t_minus_21h, 'Four-signal confluence (geo deterministic + UEBA anomaly + vector TTP match + graph centrality) scored 0.94. Auto-contain triggered after chunk 14 of planned 2,600.'
  );

  INSERT INTO public.case_links (source_case_id, target_case_id, link_type, reason, created_by) VALUES
    (v_master_id, v_clop_id, 'parent', 'Shared victim + overlapping exfil infrastructure', 'cet-engine'),
    (v_master_id, v_alphv_id, 'parent', 'Graph bridge: shared C2 ASN with Cl0p staging', 'cet-engine');

  INSERT INTO public.events (event_type, severity, source, source_ip, dest_ip, dest_port, protocol, username, hostname, description, raw_log, mitre_tactic, mitre_technique, case_id, event_timestamp, iocs, tags) VALUES
    ('web_exploit', 'high', 'waf', '89.248.167.131', '10.42.8.21', 443, 'HTTPS', NULL, 'moveit-edge-01.estee.local',
     'Cl0p human2.aspx exploit attempt against MOVEit Transfer',
     'POST /human2.aspx HTTP/1.1 SQLi payload CVE-2023-34362 len=4821',
     'initial-access', 'T1190', v_clop_id, v_t_minus_21,
     '["CVE-2023-34362","89.248.167.131"]'::jsonb, '["cl0p","moveit","zero-day"]'::jsonb),
    ('file_staging', 'medium', 'edr', '10.42.8.21', NULL, NULL, NULL, 'SYSTEM', 'moveit-edge-01.estee.local',
     'Cl0p LEMURLOOT webshell dropped and staging directory created',
     'process=w3wp.exe child=cmd.exe /c mkdir C:\\Windows\\Temp\\._stg',
     'persistence', 'T1505.003', v_clop_id, v_t_minus_21 + interval '42 minutes',
     '["LEMURLOOT"]'::jsonb, '["webshell","cl0p"]'::jsonb),
    ('honeytoken_trip', 'high', 'honeypot', '89.248.167.131', '10.42.8.21', 445, 'SMB', NULL, 'moveit-edge-01.estee.local',
     'Decoy file Q4_Merger_Sensitive.xlsx accessed from Cl0p staging IP',
     'honeytoken_id=HT-MOVEIT-001 accessed via SMB enumeration',
     'discovery', 'T1083', v_clop_id, v_t_minus_21 + interval '2 days',
     '["HT-MOVEIT-001"]'::jsonb, '["honeytoken","tripped"]'::jsonb),
    ('auth_success', 'medium', 'okta_sso', '70.32.22.14', NULL, NULL, 'HTTPS', 'm.harris', 'sso-idp.estee.local',
     'SSO auth success from Newark, NJ (known device fingerprint)',
     'okta_event=user.authentication.auth geo=US-NJ',
     'initial-access', 'T1078', v_alphv_id, v_t_minus_21h - interval '40 minutes',
     '["m.harris@estee.local"]'::jsonb, '["sso","baseline"]'::jsonb),
    ('impossible_travel', 'critical', 'ueba', '185.220.101.47', NULL, NULL, 'HTTPS', 'm.harris', 'sso-idp.estee.local',
     'SSO auth from Sofia, BG 11 minutes after Newark login — geo impossible',
     'okta_event=user.authentication.auth geo=BG-SO delta=11m distance=7400km',
     'initial-access', 'T1078.004', v_alphv_id, v_t_minus_21h - interval '29 minutes',
     '["185.220.101.47"]'::jsonb, '["impossible-travel","alphv"]'::jsonb),
    ('lateral_movement', 'high', 'edr', '10.42.8.21', '10.42.9.51', 5985, 'WinRM', 'm.harris', 'jumpbox-ops-03.estee.local',
     'PowerShell remoting from compromised account to ops jumpbox',
     'Invoke-Command -ComputerName jumpbox-ops-03 -ScriptBlock {...}',
     'lateral-movement', 'T1021.006', v_alphv_id, v_t_minus_18h,
     '["jumpbox-ops-03.estee.local"]'::jsonb, '["lateral","winrm"]'::jsonb),
    ('archive_created', 'high', 'edr', '10.42.9.51', NULL, NULL, NULL, 'm.harris', 'jumpbox-ops-03.estee.local',
     '7zip archive creation with password — consistent with staging for exfil',
     'process=7z.exe a -p***** C:\\Users\\Public\\hr_q3.7z C:\\data\\hr\\*',
     'collection', 'T1560.001', v_alphv_id, v_t_minus_18h + interval '14 minutes',
     '["hr_q3.7z"]'::jsonb, '["archive","collection"]'::jsonb),
    ('dns_tunnel_chunk', 'medium', 'dpi', '10.42.9.51', '45.141.215.88', 443, 'HTTPS', 'm.harris', 'jumpbox-ops-03.estee.local',
     'Low-and-slow chunk #1 — 50MB entropy-high to unknown ASN',
     'flow bytes=52428800 entropy=7.98 dst_asn=AS202425',
     'exfiltration', 'T1048.003', v_alphv_id, v_t_minus_18h + interval '1 hour',
     '["45.141.215.88","AS202425"]'::jsonb, '["exfil","chunk-1","low-slow"]'::jsonb),
    ('dns_tunnel_chunk', 'medium', 'dpi', '10.42.9.51', '45.141.215.88', 443, 'HTTPS', 'm.harris', 'jumpbox-ops-03.estee.local',
     'Low-and-slow chunk #7 — pattern accumulation', NULL,
     'exfiltration', 'T1048.003', v_alphv_id, v_t_minus_9m - interval '3 hours',
     '["45.141.215.88"]'::jsonb, '["exfil","chunk-7"]'::jsonb),
    ('dns_tunnel_chunk', 'high', 'dpi', '10.42.9.51', '45.141.215.88', 443, 'HTTPS', 'm.harris', 'jumpbox-ops-03.estee.local',
     'Low-and-slow chunk #14 — CET threshold crossed',
     'cumulative_bytes=734003200 chunks=14',
     'exfiltration', 'T1048.003', v_alphv_id, v_t_minus_9m,
     '["45.141.215.88","AS202425"]'::jsonb, '["exfil","chunk-14","threshold-crossed"]'::jsonb),
    ('autonomous_response', 'critical', 'response-orchestrator', NULL, NULL, NULL, NULL, 'system', 'orchestrator-01',
     'Auto-contain triggered: network isolation + SSO revoke + IOC push',
     'playbook=EL2023-contain actions=3 latency_ms=432',
     'impact', 'T1531', v_master_id, v_t_minus_9m + interval '32 seconds',
     '["45.141.215.88","89.248.167.131"]'::jsonb, '["response","contained"]'::jsonb);

  INSERT INTO public.alerts (alert_id, title, description, severity, alert_type, source, source_ip, user_id, hostname, mitre_tactic, mitre_technique, confidence_score, case_id, rule_name) VALUES
    ('ALERT-EL2023-CVE', 'MOVEit Transfer CVE-2023-34362 exploit payload detected',
     'WAF matched Cl0p human2.aspx SQLi signature. Asset MOVEit edge, internet-exposed.',
     'critical', 'exploit', 'waf', '89.248.167.131', NULL, 'moveit-edge-01.estee.local',
     'initial-access', 'T1190', 92, v_clop_id, 'Cl0p-MOVEit-SQLi'),
    ('ALERT-EL2023-HTK', 'Honeytoken trip — decoy file accessed from external staging IP',
     'HT-MOVEIT-001 (Q4_Merger_Sensitive.xlsx) enumerated by 89.248.167.131.',
     'high', 'honeytoken', 'honeypot', '89.248.167.131', NULL, 'moveit-edge-01.estee.local',
     'discovery', 'T1083', 98, v_clop_id, 'Honeytoken-Any-Access'),
    ('ALERT-EL2023-GEO', 'Impossible travel on privileged SSO account m.harris',
     'Newark->Sofia in 11 minutes (7,400 km). Device fingerprint mismatch.',
     'critical', 'ueba', 'okta_sso', '185.220.101.47', 'm.harris', 'sso-idp.estee.local',
     'initial-access', 'T1078.004', 96, v_alphv_id, 'UEBA-Impossible-Travel'),
    ('ALERT-EL2023-CONVERGE', 'Detection Confluence — 4 independent signals on single narrative',
     'Deterministic geo + UEBA + vector TTP match + graph centrality converge at 0.94 confidence.',
     'critical', 'confluence', 'detection-confluence', NULL, 'm.harris', NULL,
     'command-and-control', 'T1071.001', 94, v_master_id, 'CET-Converged-Narrative');

  INSERT INTO public.honeytokens (name, token_type, token_value_masked, placement_location, status, trigger_count, last_triggered_at, triggered_by_ip, triggered_by_user, alert_severity, breadcrumb_trail) VALUES
    ('HT-MOVEIT-001', 'file', 'Q4_Merger_Sensitive.xlsx', '\\\\moveit-edge-01\\shares\\finance\\decoys', 'triggered', 1,
     v_t_minus_21 + interval '2 days', '89.248.167.131', 'anonymous', 'high',
     '[{"step":"smb_enumerate","at":"T-19d","actor":"89.248.167.131"},{"step":"file_read","at":"T-19d+3s","bytes":48291},{"step":"canary_fire","at":"T-19d+4s","pushed_to":"case_ioc"}]'::jsonb);

  INSERT INTO public.case_iocs (case_id, ioc_type, ioc_value, tlp, confidence, feed_source, is_blocked, notes) VALUES
    (v_master_id, 'cve', 'CVE-2023-34362', 'red', 0.99, 'NVD+CISA-KEV', true, 'MOVEit SQLi - initial foothold'),
    (v_master_id, 'ip', '89.248.167.131', 'red', 0.95, 'cl0p-ttp-bundle', true, 'Cl0p staging host'),
    (v_master_id, 'ip', '185.220.101.47', 'red', 0.92, 'ALPHV-infra', true, 'Tor exit used for SSO abuse'),
    (v_master_id, 'ip', '45.141.215.88', 'red', 0.97, 'Spamhaus-DROP', true, 'Exfil sink, AS202425'),
    (v_master_id, 'domain', 'cdn-logs.statsync[.]io', 'amber', 0.88, 'dns-anomaly', true, 'C2 beacon domain'),
    (v_master_id, 'hash', 'e8b1f2a3c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', 'red', 0.9, 'LEMURLOOT-webshell', true, 'Cl0p webshell hash');

  INSERT INTO public.case_evidence (case_id, evidence_type, title, description, source_system, collected_by, sha256, size_bytes, confidence, custody_chain, is_sealed, payload) VALUES
    (v_master_id, 'log', 'WAF payload capture — CVE-2023-34362',
     'Raw WAF log showing Cl0p SQLi signature hit on /human2.aspx',
     'cloudflare-waf', 'etl-ingest', 'e8b1f2a3c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', 4821, 0.99,
     '[{"actor":"waf","action":"captured","at":"T-21d"},{"actor":"etl","action":"hashed","at":"T-21d+2s"},{"actor":"case-mgr","action":"sealed","at":"T-0"}]'::jsonb,
     true, '{"method":"POST","uri":"/human2.aspx"}'::jsonb),
    (v_master_id, 'pcap', 'Low-and-slow exfil flow capture',
     '14 chunks, 50MB each, entropy 7.98, dst AS202425', 'dpi-appliance', 'auto-sensor',
     'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', 734003200, 0.97,
     '[{"actor":"dpi","action":"captured","at":"T-18h"},{"actor":"forensics","action":"verified","at":"T-5m"}]'::jsonb,
     true, '{"chunks":14,"total_bytes":734003200,"dst":"45.141.215.88"}'::jsonb),
    (v_master_id, 'log', 'Okta SSO impossible-travel event',
     'Geo delta Newark -> Sofia in 11 minutes, device fingerprint mismatch',
     'okta', 'etl-ingest', 'b2c3d4e5f6a7890123456789012345678901bcdef2345678901bcdefabcdef12', 2841, 0.96,
     '[{"actor":"okta","action":"emitted","at":"T-21h30m"},{"actor":"ueba","action":"scored","at":"T-21h29m"}]'::jsonb,
     true, '{"user":"m.harris","from_ip":"70.32.22.14","to_ip":"185.220.101.47","delta_minutes":11}'::jsonb),
    (v_master_id, 'file', 'LEMURLOOT webshell artifact',
     'Cl0p human2.aspx modified webshell retrieved from MOVEit host',
     'edr-crowdstrike', 'ir-team', 'e8b1f2a3c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0', 85432, 0.95,
     '[{"actor":"edr","action":"quarantined","at":"T-21d+42m"},{"actor":"ir","action":"extracted","at":"T-4m"}]'::jsonb,
     true, '{"filename":"human2.aspx"}'::jsonb),
    (v_master_id, 'log', 'Honeytoken trigger record',
     'HT-MOVEIT-001 decoy file access from known Cl0p IP',
     'honeypot-ctrl', 'auto-sensor', 'c3d4e5f6a7b8901234567890123456789012cdef3456789012cdef3456789012', 1024, 0.98,
     '[{"actor":"honeypot","action":"fired","at":"T-19d"},{"actor":"case-mgr","action":"linked","at":"T-0"}]'::jsonb,
     true, '{"token_id":"HT-MOVEIT-001","triggered_by":"89.248.167.131"}'::jsonb);

  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary, first_observed) VALUES
    (v_master_id, 'T1190', 'Exploit Public-Facing Application', 'initial-access', 0.99, 'MOVEit CVE-2023-34362', v_t_minus_21),
    (v_master_id, 'T1505.003', 'Web Shell', 'persistence', 0.95, 'LEMURLOOT dropped via human2.aspx', v_t_minus_21 + interval '42 minutes'),
    (v_master_id, 'T1078.004', 'Valid Accounts: Cloud', 'initial-access', 0.96, 'Stolen SSO from dark-web vendor', v_t_minus_21h - interval '29 minutes'),
    (v_master_id, 'T1021.006', 'Remote Services: WinRM', 'lateral-movement', 0.90, 'Lateral to jumpbox', v_t_minus_18h),
    (v_master_id, 'T1560.001', 'Archive via Utility', 'collection', 0.92, '7zip with password', v_t_minus_18h + interval '14 minutes'),
    (v_master_id, 'T1048.003', 'Exfiltration Over Unencrypted Non-C2 Protocol', 'exfiltration', 0.97, '14 of 2600 chunks blocked', v_t_minus_18h + interval '1 hour');

  INSERT INTO public.case_timeline (case_id, event_type, description, actor, metadata) VALUES
    (v_master_id, 'initial-foothold', 'Cl0p exploits MOVEit zero-day CVE-2023-34362', 'attacker:cl0p',
     jsonb_build_object('phase','delivery','asset','moveit-edge-01')),
    (v_master_id, 'dormant-hypothesis-opened', 'CET engine opens dormant attack trend (confidence 0.18)', 'cet-engine',
     jsonb_build_object('confidence',0.18)),
    (v_master_id, 'honeytoken-trip', 'HT-MOVEIT-001 tripped — confidence climbs to 0.71', 'honeypot',
     jsonb_build_object('confidence',0.71)),
    (v_master_id, 'new-actor-detected', 'BlackCat SSO abuse detected — impossible travel signal', 'ueba',
     jsonb_build_object('user','m.harris')),
    (v_master_id, 'narrative-merge', 'Detection Confluence merges Cl0p + BlackCat via shared exfil infra', 'detection-confluence',
     jsonb_build_object('confidence',0.94,'signals',4)),
    (v_master_id, 'autonomous-containment', 'Playbook EL2023-contain executed — 9 minute MTTR', 'response-orchestrator',
     jsonb_build_object('latency_ms',432,'actions',3)),
    (v_master_id, 'post-incident-memory', 'Attack narrative embedded in vector memory for future hunts', 'vector-memory',
     jsonb_build_object('embedding_dim',1536,'artifacts',47));

  INSERT INTO public.user_behavior_events (event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details) VALUES
    ('sso_auth','logical', v_t_minus_21h - interval '40 minutes', 'Newark, NJ, US', 'MacBook Pro - known', '70.32.22.14', 'login', 'okta-sso', 'success', 2.1,
     jsonb_build_object('user','m.harris','baseline',true)),
    ('sso_auth','logical', v_t_minus_21h - interval '29 minutes', 'Sofia, BG', 'Unknown - Tor exit', '185.220.101.47', 'login', 'okta-sso', 'success', 97.4,
     jsonb_build_object('user','m.harris','impossible_travel',true,'delta_min',11,'distance_km',7400)),
    ('typing_biometric','logical', v_t_minus_21h - interval '28 minutes', 'Sofia, BG', 'Unknown', '185.220.101.47', 'keystroke_pattern', 'session', 'success', 88.2,
     jsonb_build_object('deviation_sigma',2.7,'user','m.harris'));

  INSERT INTO public.response_actions (action_type, target_entity, action_details, action_status, result_message, rollback_possible) VALUES
    ('custom', 'moveit-edge-01.estee.local',
     jsonb_build_object('subtype','isolate_host','vlan','quarantine','case','CASE-EL2023-MASTER'), 'completed',
     'Host network-isolated via NAC API in 187ms', true),
    ('disable_account', 'm.harris@estee.local',
     jsonb_build_object('idp','okta','revoke_all_sessions',true,'case','CASE-EL2023-MASTER'), 'completed',
     'SSO sessions revoked; step-up auth required for cohort', true),
    ('block_ip', '45.141.215.88',
     jsonb_build_object('edge','cloudflare','pushed_to_taxii',true,'case','CASE-EL2023-MASTER'), 'completed',
     'Exfil sink blocked at edge; IOC broadcast to TAXII peers', true);
END $$;
