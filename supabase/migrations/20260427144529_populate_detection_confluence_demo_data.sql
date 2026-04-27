/*
  # Populate Detection Confluence demo data

  Seeds realistic verdicts, signals, and lineage so the Pipeline River and
  Sunburst views are immediately populated.

  1. Inserts
    - 6 demo verdicts spanning P1..P4 with diverse kill-chain stages
    - For each verdict: 4-7 contributing signals across multiple lenses
    - Lineage edges raw_event -> signal -> verdict
    - Sample arbiter runs with bayesian update traces

  2. Notes
    - Scores chosen to reflect realistic lens disagreement
    - Each verdict has at least one symbolic + one neural lens contribution
*/

DO $$
DECLARE
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid;
  s_id uuid;
BEGIN

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9001', 'Domain Controller LSASS dump after dormant admin login', 0.94, 'P1', 'open',
        ARRAY['rules','graph','slm','behavior'], ARRAY['evt-77001','evt-77002','evt-77003','evt-77004'],
        0.95, 0.92, 'credential_access', 'neuro_symbolic',
        '## Why this is P1\n- Rule **R-DC-LSASS** matched on host `dc01.corp`\n- Graph: 3-hop path admin->dc01->lsass dump matches T1003.001 subgraph\n- SLM: surprise score 0.91 on `lsass_dump` after 47-day dormant logon\n- UEBA: identity peer-deviation 4.7σ',
        '{"top_evidence":["lsass.exe procdump","dormant 47d","T1003.001"],"asset":"dc01.corp","identity":"svc_backup"}'::jsonb)
RETURNING id INTO v1;

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9002', 'PowerShell C2 beacon to newly registered domain', 0.87, 'P1', 'open',
        ARRAY['rules','vector','slm','formula'], ARRAY['evt-77010','evt-77011','evt-77012'],
        0.80, 0.65, 'command_and_control', 'probabilistic',
        '## Why this is P1\n- Vector: cosine 0.93 to known Cobalt Strike beacon family\n- SLM: 5-token chain matches encoded PowerShell -> WMI -> external POST\n- Rule **R-PS-NEWDOM** newly-registered domain (24h)\n- Formula: asset_criticality 0.80 × kill_chain C2 multiplier 1.4',
        '{"domain":"asdfqwer-cdn[.]xyz","registered":"24h ago","family":"CobaltStrike-like"}'::jsonb)
RETURNING id INTO v2;

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9003', 'Negative correlation: scheduled backup did not run on 3 hosts', 0.78, 'P2', 'open',
        ARRAY['negative','graph','formula'], ARRAY['evt-77020','evt-77021','evt-77022'],
        0.75, 0.40, 'defense_evasion', 'strict',
        '## Negative correlation suppression\nExpected daily Veeam backup heartbeat at 02:00 UTC absent on 3 critical DB hosts. Graph shows shared scheduler. Formula priority elevated by asset_criticality.',
        '{"missing_hosts":["sql01","sql02","sql03"],"expected_at":"02:00 UTC"}'::jsonb)
RETURNING id INTO v3;

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9004', 'DNS exfiltration burst from finance subnet', 0.72, 'P2', 'open',
        ARRAY['slm','vector','behavior'], ARRAY['evt-77030','evt-77031','evt-77032','evt-77033'],
        0.70, 0.55, 'exfiltration', 'probabilistic',
        '## Burst pattern detected\n- SLM: high-entropy subdomain sequence, surprise 0.84\n- Vector: nearest neighbor to DNSCat2 family (0.81)\n- UEBA: workstation usually <50 DNS/hr, observed 4,200/hr',
        '{"avg_query_length":62,"entropy":4.2,"family":"DNSCat2-like"}'::jsonb)
RETURNING id INTO v4;

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9005', 'Lateral movement: pass-the-hash chain across 4 hosts', 0.81, 'P1', 'open',
        ARRAY['rules','graph','slm','behavior','formula'], ARRAY['evt-77040','evt-77041','evt-77042','evt-77043','evt-77044'],
        0.85, 0.78, 'lateral_movement', 'neuro_symbolic',
        '## Multi-lens consensus\nFive lenses agree. Graph traversal shows 4-host PtH chain over 11 minutes. SLM next-event probability for `T1550.002` was 0.79.',
        '{"hosts":["wks-31","wks-44","srv-19","dc01"],"duration_min":11}'::jsonb)
RETURNING id INTO v5;

INSERT INTO confluence_verdicts (incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES ('INC-9006', 'Anomalous okta MFA push spam from new geo', 0.55, 'P3', 'open',
        ARRAY['behavior','vector','formula'], ARRAY['evt-77050','evt-77051'],
        0.55, 0.45, 'initial_access', 'probabilistic',
        '## MFA fatigue pattern\n- 14 push prompts in 6 minutes\n- New geo (Lagos, NG) for identity normally in EU\n- Vector neighbor to known MFA-fatigue campaigns',
        '{"prompts":14,"window_min":6,"new_geo":"Lagos, NG"}'::jsonb)
RETURNING id INTO v6;

-- Signals for v1 (LSASS dump)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77001','rules',    0.95, 0.99, 'malicious', '{"rule":"R-DC-LSASS","mitre":"T1003.001"}'::jsonb, 4,  'cep-v3'),
  ('evt-77002','graph',    0.88, 0.91, 'suspicious','{"path":"svc_backup->dc01->lsass.exe","hops":3}'::jsonb, 22, 'graph-v2'),
  ('evt-77003','slm',      0.91, 0.84, 'malicious', '{"surprise":0.91,"top_token":"action:lsass_dump"}'::jsonb, 38, 'dslm-0.2'),
  ('evt-77004','behavior', 0.83, 0.78, 'anomalous', '{"peer_dev_sigma":4.7,"dormant_days":47}'::jsonb, 12, 'ueba-v4');

INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v1, unnest(ARRAY['evt-77001','evt-77002','evt-77003','evt-77004']), 'contributes_to', 1.0, 'lens emission';

-- Signals for v2 (PowerShell C2)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77010','rules',   0.78, 0.95, 'suspicious','{"rule":"R-PS-NEWDOM"}'::jsonb, 5,  'cep-v3'),
  ('evt-77011','vector',  0.93, 0.88, 'malicious', '{"cosine":0.93,"family":"CobaltStrike-like"}'::jsonb, 18, 'vec-v5'),
  ('evt-77012','slm',     0.86, 0.82, 'malicious', '{"chain":"ps->wmi->post","surprise":0.86}'::jsonb, 35, 'dslm-0.2'),
  ('evt-77012','formula', 0.82, 0.99, 'high',      '{"asset_crit":0.80,"c2_mult":1.4}'::jsonb, 1,  'formula-v1');

-- Signals for v3 (negative)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77020','negative',0.92, 0.97, 'missing',   '{"expected":"veeam_heartbeat","missing_count":3}'::jsonb, 8, 'neg-v2'),
  ('evt-77021','graph',   0.65, 0.80, 'suspicious','{"shared_scheduler":true}'::jsonb, 14, 'graph-v2'),
  ('evt-77022','formula', 0.75, 0.99, 'high',      '{"asset_crit":0.75}'::jsonb, 1, 'formula-v1');

-- Signals for v4 (DNS exfil)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77030','slm',     0.84, 0.79, 'malicious', '{"entropy":4.2,"surprise":0.84}'::jsonb, 41, 'dslm-0.2'),
  ('evt-77031','vector',  0.81, 0.85, 'malicious', '{"family":"DNSCat2-like","cosine":0.81}'::jsonb, 19, 'vec-v5'),
  ('evt-77032','behavior',0.74, 0.81, 'anomalous', '{"baseline_qph":48,"observed_qph":4200}'::jsonb, 11, 'ueba-v4'),
  ('evt-77033','formula', 0.62, 0.99, 'medium',    '{"asset_crit":0.70}'::jsonb, 1, 'formula-v1');

-- Signals for v5 (lateral movement consensus)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77040','rules',   0.84, 0.94, 'suspicious','{"rule":"R-PTH-CHAIN"}'::jsonb, 6,  'cep-v3'),
  ('evt-77041','graph',   0.91, 0.89, 'malicious', '{"chain_len":4,"duration_min":11}'::jsonb, 27, 'graph-v2'),
  ('evt-77042','slm',     0.79, 0.78, 'suspicious','{"next_event":"T1550.002","p":0.79}'::jsonb, 36, 'dslm-0.2'),
  ('evt-77043','behavior',0.72, 0.80, 'anomalous', '{"peer_dev_sigma":3.1}'::jsonb, 12, 'ueba-v4'),
  ('evt-77044','formula', 0.81, 0.99, 'high',      '{"asset_crit":0.85,"lm_mult":1.3}'::jsonb, 1,  'formula-v1');

-- Signals for v6 (MFA fatigue)
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version) VALUES
  ('evt-77050','behavior',0.69, 0.74, 'anomalous', '{"prompts":14,"window_min":6}'::jsonb, 10, 'ueba-v4'),
  ('evt-77051','vector',  0.58, 0.71, 'suspicious','{"campaign_neighbor":0.58}'::jsonb, 17, 'vec-v5'),
  ('evt-77051','formula', 0.50, 0.99, 'medium',    '{"asset_crit":0.55}'::jsonb, 1, 'formula-v1');

-- Lineage for remaining verdicts
INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v2, unnest(ARRAY['evt-77010','evt-77011','evt-77012']), 'contributes_to', 1.0, 'lens emission';
INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v3, unnest(ARRAY['evt-77020','evt-77021','evt-77022']), 'contributes_to', 1.0, 'lens emission';
INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v4, unnest(ARRAY['evt-77030','evt-77031','evt-77032','evt-77033']), 'contributes_to', 1.0, 'lens emission';
INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v5, unnest(ARRAY['evt-77040','evt-77041','evt-77042','evt-77043','evt-77044']), 'contributes_to', 1.0, 'lens emission';
INSERT INTO confluence_lineage (verdict_id, source_event_id, edge_type, weight, rationale)
SELECT v6, unnest(ARRAY['evt-77050','evt-77051']), 'contributes_to', 1.0, 'lens emission';

-- Arbiter runs
INSERT INTO confluence_arbiter_runs (verdict_id, arbiter_mode, inputs, outputs, bayesian_updates, duration_ms) VALUES
  (v1, 'neuro_symbolic',
   '{"lens_scores":{"rules":0.95,"graph":0.88,"slm":0.91,"behavior":0.83}}'::jsonb,
   '{"fused":0.94,"priority":"P1"}'::jsonb,
   '[{"prior":0.5,"evidence":"rule_hit","posterior":0.85},{"prior":0.85,"evidence":"slm_surprise","posterior":0.94}]'::jsonb, 31),
  (v5, 'neuro_symbolic',
   '{"lens_scores":{"rules":0.84,"graph":0.91,"slm":0.79,"behavior":0.72,"formula":0.81}}'::jsonb,
   '{"fused":0.81,"priority":"P1","consensus":5}'::jsonb,
   '[{"prior":0.5,"evidence":"graph_chain","posterior":0.78},{"prior":0.78,"evidence":"5_lens_consensus","posterior":0.81}]'::jsonb, 44);

END $$;
