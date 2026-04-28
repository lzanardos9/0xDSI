/*
  # Enrich Detection Confluence with ML Models, Agents, Bytecode Weaver,
  # Glasswing, Negative Correlation, and Multi-Engine Attack Chains

  1. New Tables
    - `confluence_ml_invocations` - which ML model fired for which signal
    - `confluence_agent_actions` - which agent did what for which verdict
    - `confluence_attack_chains` - multi-step complex attack narratives that chain verdicts together

  2. New Lenses
    - ml-ensemble (38+ ML model fusion lens)
    - agent-orchestration (Atlas/Sage/Nova/Vanguard/Commander)
    - glasswing (vulnerability + exploitability lens)
    - bytecode (Bytecode Weaver static + dynamic disassembly)

  3. Seeded Data
    - 8 complex multi-engine attack verdicts that combine all engines
    - 80+ signals across all 11 lenses for those verdicts
    - 50+ ML model invocations referencing the real ML models from mlModelData
    - 60+ agent actions referencing canonical agents
    - 8 attack chains each with 3-6 verdict steps

  4. Security
    - All new tables enable RLS
    - SELECT policy for authenticated; INSERT for system role
*/

-- 1. New Tables ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS confluence_ml_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES confluence_signals(id) ON DELETE CASCADE,
  verdict_id uuid REFERENCES confluence_verdicts(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  model_name text NOT NULL,
  model_category text NOT NULL DEFAULT 'unknown',
  model_family text NOT NULL DEFAULT '',
  model_version text NOT NULL DEFAULT '1.0.0',
  inference_score numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT '',
  feature_attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding_id text NOT NULL DEFAULT '',
  baseline_deviation numeric NOT NULL DEFAULT 0,
  drift_psi numeric NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  hardware text NOT NULL DEFAULT 'gpu',
  invoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmi_verdict ON confluence_ml_invocations(verdict_id);
CREATE INDEX IF NOT EXISTS idx_cmi_model ON confluence_ml_invocations(model_id);
CREATE INDEX IF NOT EXISTS idx_cmi_invoked ON confluence_ml_invocations(invoked_at DESC);

CREATE TABLE IF NOT EXISTS confluence_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id uuid REFERENCES confluence_verdicts(id) ON DELETE CASCADE,
  agent_slug text NOT NULL,
  agent_name text NOT NULL,
  agent_role text NOT NULL DEFAULT 'analyst',
  agent_color text NOT NULL DEFAULT '#22d3ee',
  phase integer NOT NULL DEFAULT 0,
  action_type text NOT NULL,
  action_summary text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning text NOT NULL DEFAULT '',
  confidence numeric NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT '',
  duration_ms integer NOT NULL DEFAULT 0,
  llm_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caa_verdict ON confluence_agent_actions(verdict_id);
CREATE INDEX IF NOT EXISTS idx_caa_agent ON confluence_agent_actions(agent_slug);
CREATE INDEX IF NOT EXISTS idx_caa_phase ON confluence_agent_actions(phase);

CREATE TABLE IF NOT EXISTS confluence_attack_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_code text UNIQUE NOT NULL,
  campaign_name text NOT NULL,
  threat_actor text NOT NULL DEFAULT 'unknown',
  motivation text NOT NULL DEFAULT '',
  sophistication text NOT NULL DEFAULT 'high',
  narrative text NOT NULL DEFAULT '',
  kill_chain_stages text[] NOT NULL DEFAULT ARRAY[]::text[],
  mitre_techniques text[] NOT NULL DEFAULT ARRAY[]::text[],
  verdict_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ml_models_used text[] NOT NULL DEFAULT ARRAY[]::text[],
  agents_orchestrated text[] NOT NULL DEFAULT ARRAY[]::text[],
  glasswing_vulns text[] NOT NULL DEFAULT ARRAY[]::text[],
  negative_correlation_rules text[] NOT NULL DEFAULT ARRAY[]::text[],
  bytecode_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_signals integer NOT NULL DEFAULT 0,
  fused_score numeric NOT NULL DEFAULT 0,
  blast_radius integer NOT NULL DEFAULT 0,
  containment_status text NOT NULL DEFAULT 'investigating',
  detected_at timestamptz NOT NULL DEFAULT now(),
  contained_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cac_score ON confluence_attack_chains(fused_score DESC);

ALTER TABLE confluence_ml_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_attack_chains ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='cmi_select_auth') THEN
    CREATE POLICY "cmi_select_auth" ON confluence_ml_invocations FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='caa_select_auth') THEN
    CREATE POLICY "caa_select_auth" ON confluence_agent_actions FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='cac_select_auth') THEN
    CREATE POLICY "cac_select_auth" ON confluence_attack_chains FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 2. New Lenses ---------------------------------------------------------------
INSERT INTO confluence_lenses (id, display_name, category, description, default_weight, color_hex, icon_name, reasoning_type, enabled)
VALUES
  ('ml-ensemble',  'ML Model Ensemble',     'ml',         'Fusion of 38+ ML models: Isolation Forest, GBT, LSTM, autoencoders, sentence transformers, GNN attack path predictor, Bayesian risk ensemble.', 0.18, '#a3e635', 'Brain',     'neural',  true),
  ('agents',       'Agentic SOC',           'orchestration','Live action of Atlas/Sage/Nova/Vanguard/Commander + BMAD agents performing triage, enrichment, investigation and response.', 0.16, '#34d399', 'Workflow',  'hybrid',  true),
  ('glasswing',    'Glasswing Vulnerabilities','vulnerability','Glasswing scanner findings + exploit chain feasibility scoring.',  0.12, '#fb923c', 'ShieldAlert','symbolic',true),
  ('bytecode',     'Bytecode Weaver',       'binary',     'Static disassembly + dynamic taint analysis of binary, JVM bytecode, .NET CIL, WASM and JS bundle artifacts.', 0.14, '#c084fc', 'Layers',    'symbolic',true),
  ('threat-intel', 'Threat Intel Fusion',   'intel',      'STIX/TAXII feeds, IOC matching, dark-web chatter and adversary infrastructure tracking.', 0.10, '#60a5fa', 'Globe',     'symbolic',true)
ON CONFLICT (id) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  color_hex     = EXCLUDED.color_hex,
  default_weight= EXCLUDED.default_weight,
  reasoning_type= EXCLUDED.reasoning_type,
  enabled       = true;

INSERT INTO confluence_lens_weights (tenant_id, lens_id, weight, active, rationale, updated_by)
SELECT 'default', id, default_weight, true, 'seeded with default weight', 'system'
FROM confluence_lenses
WHERE id IN ('ml-ensemble','agents','glasswing','bytecode','threat-intel')
  AND NOT EXISTS (SELECT 1 FROM confluence_lens_weights w WHERE w.tenant_id='default' AND w.lens_id=confluence_lenses.id);

-- 3. Seed Complex Multi-Engine Attacks ----------------------------------------
DO $$
DECLARE
  v_hollow_driver uuid := gen_random_uuid();
  v_nightingale   uuid := gen_random_uuid();
  v_phantom       uuid := gen_random_uuid();
  v_quantum       uuid := gen_random_uuid();
  v_bytecode_echo uuid := gen_random_uuid();
  v_hollow_man    uuid := gen_random_uuid();
  v_specter_loop  uuid := gen_random_uuid();
  v_fractured     uuid := gen_random_uuid();
BEGIN

INSERT INTO confluence_verdicts (id, incident_key, title, fused_score, priority, status, contributing_lenses, contributing_event_ids, asset_criticality, identity_blast_radius, kill_chain_stage, arbiter_mode, explanation_md, evidence_summary)
VALUES
(v_hollow_driver, 'INC-HOLLOW-DRIVER-001', 'Operation Hollow Driver - Kernel Implant via Signed Driver Abuse',
 0.97, 'P1', 'investigating',
 ARRAY['rules','negative','graph','slm','vector','behavior','ml-ensemble','agents','glasswing','bytecode','threat-intel'],
 ARRAY['evt-hd-101','evt-hd-102','evt-hd-103','evt-hd-104','evt-hd-105','evt-hd-106'],
 0.96, 0.88, 'installation', 'consensus_arbiter',
 E'## Multi-engine consensus on a kernel implant\nGlasswing flagged CVE-2024-21338 in vulnerable signed driver `appsvc.sys`. Bytecode Weaver disassembled the loaded driver image and identified ROP gadget chains and an inline-hook on `NtCreateFile`. Negative correlation rule **NC-007 (missing kernel-mode load notify)** fired. SLM, vector hunt and GNN attack-path predictor concur. Atlas triaged within 1.4s; Vanguard isolated host.',
 jsonb_build_object(
   'glasswing_vulns', jsonb_build_array(
     jsonb_build_object('vuln_id','GW-CVE-2024-21338','severity','critical','cvss',8.8,'component','appsvc.sys','exploitability','high'),
     jsonb_build_object('vuln_id','GW-CWE-269','severity','high','cvss',7.5,'component','privilege escalation primitive')
   ),
   'bytecode_analysis', jsonb_build_object(
     'entropy', 7.82,
     'rop_gadgets', 14,
     'inline_hooks', jsonb_build_array('NtCreateFile','NtOpenProcess'),
     'imphash','f34d5f2d4577ed6d9ceec516c1f5a692',
     'signed_but_revoked', true,
     'weaver_verdict','MALICIOUS_HIGH'
   ),
   'negative_correlation', jsonb_build_array(
     jsonb_build_object('rule','NC-007','desc','driver loaded without prior PsSetLoadImageNotifyRoutine','gap_seconds',0)
   ),
   'ml_models_invoked', 9,
   'agent_actions', 7
 )),

(v_nightingale, 'INC-NIGHTINGALE-002', 'Project Nightingale - LLM Prompt Injection + Browser Extension Exfil',
 0.94, 'P1', 'contained',
 ARRAY['slm','vector','behavior','ml-ensemble','agents','bytecode','threat-intel','negative'],
 ARRAY['evt-ng-201','evt-ng-202','evt-ng-203','evt-ng-204','evt-ng-205'],
 0.91, 0.84, 'exfiltration', 'llm_arbiter',
 E'## Prompt injection chained with malicious browser extension\nDeBERTa prompt-injection detector flagged 11 high-severity prompts. Vector hunt found 0.93 cosine similarity to known LLM-jailbreak campaign. Bytecode Weaver analyzed extension JS bundle: detected obfuscated XHR exfil to attacker-controlled host. Behavioral baseline showed 12σ deviation. Nova ran an autonomous investigation chain.',
 jsonb_build_object(
   'bytecode_analysis', jsonb_build_object(
     'language','javascript','obfuscation','obfuscator.io',
     'iocs', jsonb_build_array('hxxps://api.exfilhub[.]xyz/ingest'),
     'taint_flow','document.cookie -> XHR.send',
     'weaver_verdict','MALICIOUS_HIGH'
   ),
   'ml_models_invoked', 8,
   'agent_actions', 6,
   'pii_redacted', 1842,
   'tokens_blocked', 286400
 )),

(v_phantom, 'INC-PHANTOM-PIVOT-003', 'Phantom Pivot Cascade - Insider Selling Cloud Credentials',
 0.92, 'P1', 'investigating',
 ARRAY['behavior','rules','graph','negative','ml-ensemble','agents','threat-intel','formula'],
 ARRAY['evt-pp-301','evt-pp-302','evt-pp-303','evt-pp-304'],
 0.94, 0.92, 'lateral_movement', 'graph_arbiter',
 E'## Insider posting AWS keys on darknet market\nIdentity graph correlates user `m.delgado@corp` to dark-web seller persona via stylometry (87% match). Negative correlation **NC-014** fired: privileged AWS access without MFA challenge. GNN attack-path predicted lateral pivot to RDS prod. Pattern Discovery insider-threat model assigned 0.94 risk.',
 jsonb_build_object(
   'identity_graph_edges', 41,
   'dark_web_listings', 3,
   'negative_correlation', jsonb_build_array(
     jsonb_build_object('rule','NC-014','desc','MFA challenge missing for privileged session','gap_seconds',0)
   ),
   'ml_models_invoked', 7,
   'agent_actions', 8
 )),

(v_quantum, 'INC-QUANTUM-LEAP-004', 'Quantum Presence - Physics Violation, Same Identity Two Continents',
 0.96, 'P1', 'contained',
 ARRAY['negative','behavior','rules','ml-ensemble','agents','threat-intel','graph'],
 ARRAY['evt-ql-401','evt-ql-402','evt-ql-403'],
 0.83, 0.95, 'credential_access', 'consensus_arbiter',
 E'## Impossible coexistence detected\nUser `kchen@corp` authenticated from Frankfurt and Tokyo within 4m 12s. **NC-002 (teleportation)** + **NC-006 (impossible co-presence)** fired. Speed-of-flight check: 14,800 km/h required. Vanguard auto-revoked sessions; Atlas opened P1 case in 800ms.',
 jsonb_build_object(
   'physics_violation', jsonb_build_object('required_speed_kmh',14800,'distance_km',9100,'time_minutes',4.2),
   'negative_correlation', jsonb_build_array(
     jsonb_build_object('rule','NC-002','desc','geo-teleportation impossible'),
     jsonb_build_object('rule','NC-006','desc','impossible coexistence: badge swipe in HQ + remote auth from JP')
   ),
   'ml_models_invoked', 5,
   'agent_actions', 4
 )),

(v_bytecode_echo, 'INC-BYTECODE-ECHO-005', 'Bytecode Echo - Supply Chain Trojan in npm `helper-img`',
 0.95, 'P1', 'investigating',
 ARRAY['bytecode','vector','slm','ml-ensemble','agents','glasswing','threat-intel','rules'],
 ARRAY['evt-be-501','evt-be-502','evt-be-503','evt-be-504','evt-be-505'],
 0.97, 0.79, 'initial_access', 'consensus_arbiter',
 E'## Supply chain compromise via popular npm package\nBytecode Weaver decompiled `helper-img@4.2.7` postinstall script and discovered staged loader, AES-encrypted blob, and DGA-based C2. Glasswing chained to CVE-2024-3094-style backdoor pattern. Vector hunt found 0.91 similarity to XZ Utils backdoor TTPs. Drift detector flagged a 4.6σ ML-feature drift.',
 jsonb_build_object(
   'bytecode_analysis', jsonb_build_object(
     'package','helper-img@4.2.7',
     'sha256','8a7b9c12d4e5f67890abcdef1234567890abcdef',
     'entropy', 7.91,
     'dga_seeds', jsonb_build_array('a1b2c3d4','e5f6g7h8'),
     'aes_key_derivation','PBKDF2(SHA-256, salt=node_modules_path)',
     'iocs', jsonb_build_array('hxxps://cdn-helper[.]xyz','45.142.[REDACTED]'),
     'weaver_verdict','MALICIOUS_CRITICAL',
     'similar_to','XZ Utils CVE-2024-3094'
   ),
   'glasswing_vulns', jsonb_build_array(
     jsonb_build_object('vuln_id','GW-NPM-2026-009','severity','critical','cvss',9.8)
   ),
   'ml_models_invoked', 11,
   'agent_actions', 9
 )),

(v_hollow_man, 'INC-HOLLOW-MAN-006', 'The Hollow Man - Deepfake Voice CISO Wire Transfer Authorization',
 0.93, 'P1', 'contained',
 ARRAY['ml-ensemble','behavior','vector','agents','negative','threat-intel','formula'],
 ARRAY['evt-hm-601','evt-hm-602','evt-hm-603'],
 0.99, 0.86, 'social_engineering', 'consensus_arbiter',
 E'## Deepfake CISO impersonation attempt\nAudio embedding model flagged 0.18 cosine to enrolled voiceprint (threshold 0.42). Behavioral model identified prosodic anomalies (12 markers). Negative correlation **NC-011 (auth context absent)** fired - call initiated from never-seen number. Sage enrichment confirmed phone routed via known pig-butchering infrastructure.',
 jsonb_build_object(
   'voiceprint_cosine', 0.18,
   'prosodic_anomalies', 12,
   'transfer_amount_usd', 4200000,
   'blocked', true,
   'ml_models_invoked', 6,
   'agent_actions', 5
 )),

(v_specter_loop, 'INC-SPECTER-LOOP-007', 'Specter Loop - Adversarial ML Attack Targeting Detection Model',
 0.91, 'P1', 'investigating',
 ARRAY['ml-ensemble','agents','bytecode','vector','negative','rules','behavior'],
 ARRAY['evt-sl-701','evt-sl-702','evt-sl-703','evt-sl-704'],
 0.93, 0.74, 'defense_evasion', 'meta_arbiter',
 E'## Adversarial perturbation of input features\nModel Poisoning Guard ensemble flagged spectral signature anomaly (SVD eigenvalue spike 4.2x baseline). Bytecode Weaver disassembled malicious payload and found feature-squeezing evasion logic targeting our isolation forest. Defense ensemble auto-isolated affected detector. BMAD personas (Mary, Winston) generated patch.',
 jsonb_build_object(
   'svd_spike', 4.2,
   'targeted_model','isolation_forest_v3.2',
   'evasion_method','feature_squeezing_perturbation',
   'bytecode_analysis', jsonb_build_object(
     'entropy', 7.74,
     'evasion_payload_size_bytes', 28640,
     'weaver_verdict','MALICIOUS_HIGH'
   ),
   'ml_models_invoked', 12,
   'agent_actions', 10
 )),

(v_fractured, 'INC-FRACTURED-MIRROR-008', 'Fractured Mirror - Domain Admin Identity Theft via NTDS Dump',
 0.96, 'P1', 'investigating',
 ARRAY['rules','graph','negative','ml-ensemble','agents','glasswing','bytecode','behavior'],
 ARRAY['evt-fm-801','evt-fm-802','evt-fm-803','evt-fm-804','evt-fm-805'],
 0.99, 0.99, 'credential_access', 'consensus_arbiter',
 E'## NTDS.dit extracted from domain controller\nGlasswing flagged unpatched ZeroLogon variant (CVE-2024-NEW). Bytecode Weaver classified dropped tool as ntdsutil custom variant with packed sections. Negative correlation **NC-005 (privilege use without preceding badge swipe)** + **NC-009 (silent privilege escalation)** fired. GNN attack-path predicted full forest takeover within 12 hops.',
 jsonb_build_object(
   'glasswing_vulns', jsonb_build_array(
     jsonb_build_object('vuln_id','GW-CVE-2024-ZL2','severity','critical','cvss',10.0,'component','netlogon')
   ),
   'forest_takeover_predicted_hops', 12,
   'bytecode_analysis', jsonb_build_object(
     'tool','custom_ntdsutil',
     'packed','UPX+custom',
     'imphash','d3adb33fd3adb33fd3adb33fd3adb33f',
     'weaver_verdict','MALICIOUS_CRITICAL'
   ),
   'ml_models_invoked', 9,
   'agent_actions', 11
 ));

-- Save IDs for downstream FK seeding via temp table
CREATE TEMP TABLE _v(id uuid, code text);
INSERT INTO _v VALUES
  (v_hollow_driver,'HD'),(v_nightingale,'NG'),(v_phantom,'PP'),(v_quantum,'QL'),
  (v_bytecode_echo,'BE'),(v_hollow_man,'HM'),(v_specter_loop,'SL'),(v_fractured,'FM');

-- 4. Signals across all 11 lenses for each verdict
INSERT INTO confluence_signals (event_id, lens_id, score, confidence, verdict_label, evidence, latency_ms, model_version, emitted_at)
SELECT
  'evt-' || lower(_v.code) || '-' || lens_idx::text,
  lens_id,
  0.70 + (random() * 0.28),
  0.78 + (random() * 0.20),
  CASE WHEN random() > 0.15 THEN 'malicious' ELSE 'suspicious' END,
  jsonb_build_object('chain', _v.code, 'lens', lens_id, 'auto', true),
  20 + (random() * 280)::int,
  'v3.' || (1 + (random() * 3)::int),
  now() - (random() * interval '6 hours')
FROM _v
CROSS JOIN LATERAL (
  SELECT lens_id, lens_idx
  FROM unnest(ARRAY['rules','negative','graph','slm','vector','behavior','formula','ml-ensemble','agents','glasswing','bytecode','threat-intel'])
       WITH ORDINALITY AS t(lens_id, lens_idx)
) lens;

-- 5. ML Model Invocations -----------------------------------------------------
INSERT INTO confluence_ml_invocations (verdict_id, model_id, model_name, model_category, model_family, model_version, inference_score, confidence, decision, feature_attribution, baseline_deviation, drift_psi, latency_ms, hardware)
SELECT v.id, m.model_id, m.model_name, m.category, m.family, '3.2.1',
       0.78 + random()*0.20, 0.85 + random()*0.13, 'malicious',
       jsonb_build_object('top_features', m.features),
       3.0 + random()*8, 0.05 + random()*0.30, 25 + (random()*300)::int, 'a100-gpu'
FROM _v v
CROSS JOIN (VALUES
  ('iso-forest','Isolation Forest','behavioral','tree-ensemble', ARRAY['session_entropy','login_geo_jump','privileged_call_rate']),
  ('autoencoder','Behavioral Autoencoder','behavioral','deep-net',ARRAY['recon_loss','latent_drift']),
  ('gbt-malware','GBT Malware Classifier','malware','xgboost',  ARRAY['pe_entropy','section_count','imphash_rarity']),
  ('lstm-behavior','LSTM Behavioral Analyzer','malware','rnn',  ARRAY['syscall_seq','io_pattern']),
  ('rf-static','Random Forest Static','malware','ensemble',     ARRAY['header_anomaly','signed_revoked']),
  ('sentence-tx','Sentence Transformer','vector','transformer', ARRAY['embedding_cosine']),
  ('faiss-ann','FAISS ANN Index','vector','ann',                ARRAY['neighbor_distance']),
  ('dbscan-vec','DBSCAN Vector Cluster','vector','clustering',  ARRAY['cluster_density']),
  ('gnn-attackpath','GNN Attack Path Predictor','threat-modeling','graph-net', ARRAY['hop_probability','blast_radius']),
  ('bayes-risk','Bayesian Risk Ensemble','threat-modeling','bayesian', ARRAY['posterior_risk']),
  ('drift-psi','Drift Detector PSI','model-guard','statistical', ARRAY['psi','ks_stat']),
  ('spectral-sig','Spectral Signature Analyzer','model-guard','svd', ARRAY['eigenvalue_ratio']),
  ('adv-input','Adversarial Input Detector','model-guard','feature-squeeze', ARRAY['feature_squeeze_delta']),
  ('integrity-hash','Integrity Hash Validator','model-guard','crypto', ARRAY['sha256_match']),
  ('uba-anomaly','UEBA Anomaly','behavioral','isolation-forest+lof', ARRAY['session_anomaly','peer_deviation']),
  ('uba-multifactor','Multi-Factor Risk Scorer','behavioral','xgboost', ARRAY['risk_factors']),
  ('uba-physical','Physical-Logical Correlator','behavioral','rule+ml', ARRAY['badge_vs_auth_gap']),
  ('insider-pred','Insider Threat Predictor','behavioral','xgboost', ARRAY['cert_dataset_match']),
  ('stride-clf','STRIDE Auto-Classifier','threat-modeling','bert-multi', ARRAY['stride_categories']),
  ('mitre-mapper','MITRE ATT&CK Mapper','threat-modeling','embedding-sim', ARRAY['technique_similarity']),
  ('prompt-inject','Prompt Injection Detector','llm-risk','deberta-fine', ARRAY['jailbreak_score']),
  ('data-leak','Data Leakage Scorer','llm-risk','bert-multi-task', ARRAY['pii_density','exfil_pattern']),
  ('psych-profile','Psychological Profile Model','llm-risk','transformer', ARRAY['linguistic_markers']),
  ('nlp-risk','NLP Risk Classifier','llm-risk','deberta', ARRAY['risk_label_dist']),
  ('baseline-ema','Behavioral Baseline EMA','llm-risk','statistical', ARRAY['ema_deviation']),
  ('rule-conf','Rule Confidence Scorer','correlation','logistic-reg', ARRAY['rule_precision']),
  ('adaptive-thr','Adaptive Threshold Engine','correlation','p2-quantile', ARRAY['threshold_drift']),
  ('fp-optimizer','False Positive Optimizer','correlation','gbt', ARRAY['fp_likelihood']),
  ('vector-eng','Vector Embedding Engine','micro-pattern','contrastive', ARRAY['micro_embed']),
  ('confidence-cal','Confidence Calibrator','micro-pattern','platt', ARRAY['calibrated_score']),
  ('reasoning-bandit','Reasoning Weight Optimizer','micro-pattern','thompson-bandit', ARRAY['arm_reward']),
  ('semantic-q','Semantic Query Engine','vector','transformer', ARRAY['query_match']),
  ('cosine-sim','Cosine Similarity Ranker','vector','linear-alg', ARRAY['top_k_sim']),
  ('kmeans-cluster','K-Means Cluster','pattern','clustering', ARRAY['centroid_distance']),
  ('dbscan-pat','DBSCAN Pattern','pattern','clustering', ARRAY['noise_label']),
  ('ai-correlation','AI Correlation Agent','correlation','llm+rules', ARRAY['rule_synthesis']),
  ('ensemble-vote','Malware Ensemble Voting','malware','soft-voting', ARRAY['vote_distribution']),
  ('audio-embed','Audio Voiceprint Model','llm-risk','wav2vec2', ARRAY['voice_cosine','prosodic_markers'])
) m(model_id, model_name, category, family, features)
WHERE random() < 0.55;

-- 6. Agent Actions ------------------------------------------------------------
INSERT INTO confluence_agent_actions (verdict_id, agent_slug, agent_name, agent_role, agent_color, phase, action_type, action_summary, inputs, outputs, reasoning, confidence, decision, duration_ms, llm_tokens, cost_usd, status, occurred_at)
SELECT v.id, a.slug, a.name, a.role, a.color, a.phase,
       a.action_type, a.summary || ' for ' || v.code,
       jsonb_build_object('verdict_code', v.code),
       jsonb_build_object('result', a.outcome),
       a.reasoning,
       0.85 + random()*0.13,
       a.outcome,
       (200 + random()*4800)::int,
       (random()*8000)::int,
       round((random()*0.40)::numeric, 4),
       'completed',
       now() - (random() * interval '6 hours')
FROM _v v
CROSS JOIN (VALUES
  ('orchestrator','Commander','orchestrator','#06b6d4',1,'orchestrate','Pipeline orchestration & lens fusion','Fused 11 lens signals using consensus arbiter','approved'),
  ('atlas-triage','Atlas','triage','#f59e0b',2,'classify','Triage classification + priority assignment','Multi-class XGBoost on signal vector','escalated'),
  ('sage-enrichment','Sage','enrichment','#14b8a6',3,'enrich','IOC + identity + asset enrichment','VirusTotal + Shodan + AD lookups merged','enriched'),
  ('nova-investigation','Nova','investigation','#3b82f6',4,'investigate','Autonomous investigation chain','LLM hypothesis loop with tool-use','findings_complete'),
  ('vanguard-response','Vanguard','response','#ef4444',5,'respond','Containment action - host isolated','Cross-tool playbook executed (EDR+IAM+Net)','contained'),
  ('ai-correlation','AI Correlation','correlation','#a78bfa',2,'correlate','Cross-engine correlation','Hybrid rule + LLM synthesis','correlated'),
  ('negative-correlation','NegCorrelation','correlation','#ef4444',2,'detect_absence','Missing-event detection','Constraint logic over event window','triggered'),
  ('pattern-discovery','Pattern Disc','discovery','#22d3ee',6,'mine','Micro-pattern mining','Isolation forest + DBSCAN on event clusters','patterns_found'),
  ('malware-sandbox','Sandbox','malware','#fb923c',3,'detonate','Detonation in cuckoo sandbox','Behavior + static feature fusion','malicious'),
  ('bmad-mary','Mary','build_time','#a855f7',7,'plan','BMAD analyst - threat narrative drafted','Story + acceptance criteria','plan_ready'),
  ('bmad-winston','Winston','build_time','#a855f7',7,'design','BMAD architect - mitigation design','Architecture decision record','design_ready')
) a(slug, name, role, color, phase, action_type, summary, reasoning, outcome)
WHERE random() < 0.85;

-- 7. Lineage edges for new verdicts (sample some signals into lineage) --------
INSERT INTO confluence_lineage (verdict_id, signal_id, source_event_id, edge_type, weight, rationale)
SELECT v.id, s.id, s.event_id,
       CASE WHEN s.score >= 0.85 THEN 'corroborates' ELSE 'supports' END,
       round(s.score::numeric, 2),
       'auto-linked from confluence engine for ' || v.code
FROM _v v
JOIN confluence_signals s ON s.event_id LIKE 'evt-' || lower(v.code) || '-%';

-- 8. Arbiter runs --------------------------------------------------------------
INSERT INTO confluence_arbiter_runs (verdict_id, arbiter_mode, inputs, outputs, bayesian_updates, duration_ms)
SELECT v.id, 'consensus_arbiter',
       jsonb_build_object('lens_count',11,'event_count',6),
       jsonb_build_object('fused',0.93,'priority','P1'),
       jsonb_build_object('prior',0.21,'posterior',0.93,'updates',7),
       (180 + random()*820)::int
FROM _v v;

-- 9. Attack chains -------------------------------------------------------------
INSERT INTO confluence_attack_chains (chain_code, campaign_name, threat_actor, motivation, sophistication, narrative, kill_chain_stages, mitre_techniques, verdict_ids, ml_models_used, agents_orchestrated, glasswing_vulns, negative_correlation_rules, bytecode_artifacts, total_signals, fused_score, blast_radius, containment_status)
VALUES
  ('CHAIN-HOLLOW-DRIVER','Operation Hollow Driver','APT-Crimson Tide','espionage','nation-state',
   'Adversary leveraged a vulnerable signed driver to load a kernel implant; defended by 11-lens consensus.',
   ARRAY['recon','weaponization','delivery','exploitation','installation','c2'],
   ARRAY['T1543.003','T1068','T1014','T1055'],
   ARRAY[v_hollow_driver],
   ARRAY['iso-forest','lstm-behavior','gbt-malware','gnn-attackpath','spectral-sig','adv-input','rule-conf','semantic-q','reasoning-bandit'],
   ARRAY['orchestrator','atlas-triage','sage-enrichment','nova-investigation','vanguard-response','negative-correlation','malware-sandbox'],
   ARRAY['GW-CVE-2024-21338','GW-CWE-269'],
   ARRAY['NC-007'],
   jsonb_build_array(jsonb_build_object('artifact','appsvc.sys','sha256','f34d5f...','weaver_verdict','MALICIOUS_HIGH')),
   12, 0.97, 248, 'investigating'),

  ('CHAIN-NIGHTINGALE','Project Nightingale','FIN-Phoenix','financial','high',
   'Prompt injection at the LLM gateway combined with a malicious browser extension to exfiltrate data.',
   ARRAY['delivery','exploitation','c2','exfiltration'],
   ARRAY['T1566','T1110','T1041','T1567.002'],
   ARRAY[v_nightingale],
   ARRAY['prompt-inject','data-leak','psych-profile','sentence-tx','faiss-ann','dbscan-vec','baseline-ema','adv-input'],
   ARRAY['orchestrator','atlas-triage','nova-investigation','vanguard-response','sage-enrichment','ai-correlation'],
   ARRAY[]::text[],
   ARRAY['NC-011'],
   jsonb_build_array(jsonb_build_object('artifact','helper-extension.crx','iocs',jsonb_build_array('hxxps://api.exfilhub[.]xyz'))),
   11, 0.94, 156, 'contained'),

  ('CHAIN-PHANTOM-PIVOT','Phantom Pivot Cascade','Insider-Delta','financial','medium',
   'Trusted insider posted privileged AWS credentials on a darknet market; identity-graph stylometry tied selling persona to corporate identity.',
   ARRAY['credential_access','lateral_movement','exfiltration'],
   ARRAY['T1078','T1098','T1530','T1567'],
   ARRAY[v_phantom],
   ARRAY['uba-anomaly','uba-multifactor','insider-pred','gnn-attackpath','sentence-tx','rule-conf','adaptive-thr'],
   ARRAY['orchestrator','atlas-triage','sage-enrichment','nova-investigation','vanguard-response','pattern-discovery','ai-correlation'],
   ARRAY[]::text[],
   ARRAY['NC-014'],
   '[]'::jsonb,
   10, 0.92, 188, 'investigating'),

  ('CHAIN-QUANTUM-LEAP','Quantum Presence','Unknown','credential_theft','high',
   'Same identity authenticated from two continents within minutes - physics violation triggered triple negative-correlation rules.',
   ARRAY['credential_access','defense_evasion'],
   ARRAY['T1078','T1110.001'],
   ARRAY[v_quantum],
   ARRAY['uba-anomaly','uba-physical','iso-forest','rule-conf','adaptive-thr'],
   ARRAY['orchestrator','atlas-triage','vanguard-response','negative-correlation'],
   ARRAY[]::text[],
   ARRAY['NC-002','NC-006'],
   '[]'::jsonb,
   8, 0.96, 64, 'contained'),

  ('CHAIN-BYTECODE-ECHO','Bytecode Echo','APT-XZ-Shadow','supply-chain','nation-state',
   'Backdoor smuggled into a popular npm package mirroring the XZ Utils playbook; Bytecode Weaver identified the staged loader and DGA.',
   ARRAY['initial_access','persistence','c2'],
   ARRAY['T1195.002','T1547.001','T1071'],
   ARRAY[v_bytecode_echo],
   ARRAY['gbt-malware','lstm-behavior','rf-static','sentence-tx','faiss-ann','drift-psi','spectral-sig','integrity-hash','ensemble-vote','rule-conf','reasoning-bandit'],
   ARRAY['orchestrator','atlas-triage','sage-enrichment','nova-investigation','vanguard-response','malware-sandbox','ai-correlation','pattern-discovery','bmad-winston'],
   ARRAY['GW-NPM-2026-009'],
   ARRAY[]::text[],
   jsonb_build_array(jsonb_build_object('artifact','helper-img@4.2.7','sha256','8a7b9c12...','weaver_verdict','MALICIOUS_CRITICAL')),
   13, 0.95, 410, 'investigating'),

  ('CHAIN-HOLLOW-MAN','The Hollow Man','FIN-Echo','financial','high',
   'Deepfake voice of CISO requested an emergency wire transfer; voiceprint cosine 0.18 + prosodic anomaly + missing call-context fired containment.',
   ARRAY['social_engineering','exfiltration'],
   ARRAY['T1656','T1657'],
   ARRAY[v_hollow_man],
   ARRAY['audio-embed','psych-profile','baseline-ema','sentence-tx','rule-conf','uba-anomaly'],
   ARRAY['orchestrator','atlas-triage','sage-enrichment','nova-investigation','vanguard-response'],
   ARRAY[]::text[],
   ARRAY['NC-011'],
   '[]'::jsonb,
   9, 0.93, 92, 'contained'),

  ('CHAIN-SPECTER-LOOP','Specter Loop','Adversary-Athena','defense-evasion','expert',
   'Adversarial perturbation crafted to evade our isolation forest detector; Model Poisoning Guard ensemble + Bytecode Weaver + BMAD agents responded.',
   ARRAY['defense_evasion','collection'],
   ARRAY['T1027','T1562'],
   ARRAY[v_specter_loop],
   ARRAY['drift-psi','spectral-sig','adv-input','integrity-hash','iso-forest','autoencoder','gbt-malware','sentence-tx','dbscan-vec','rule-conf','adaptive-thr','fp-optimizer'],
   ARRAY['orchestrator','atlas-triage','nova-investigation','vanguard-response','pattern-discovery','bmad-mary','bmad-winston','ai-correlation','negative-correlation','sage-enrichment'],
   ARRAY[]::text[],
   ARRAY[]::text[],
   jsonb_build_array(jsonb_build_object('artifact','adv-payload.bin','entropy',7.74,'weaver_verdict','MALICIOUS_HIGH')),
   12, 0.91, 142, 'investigating'),

  ('CHAIN-FRACTURED-MIRROR','Fractured Mirror','APT-Crimson Tide','espionage','nation-state',
   'NTDS.dit dumped from a domain controller using a custom variant tool; full forest takeover predicted within 12 graph hops.',
   ARRAY['credential_access','privilege_escalation','lateral_movement'],
   ARRAY['T1003.003','T1078.002','T1021'],
   ARRAY[v_fractured],
   ARRAY['gnn-attackpath','bayes-risk','rf-static','gbt-malware','rule-conf','uba-anomaly','uba-physical','insider-pred','semantic-q'],
   ARRAY['orchestrator','atlas-triage','sage-enrichment','nova-investigation','vanguard-response','ai-correlation','pattern-discovery','negative-correlation','malware-sandbox','bmad-mary','bmad-winston'],
   ARRAY['GW-CVE-2024-ZL2'],
   ARRAY['NC-005','NC-009'],
   jsonb_build_array(jsonb_build_object('artifact','custom_ntdsutil','imphash','d3adb33f...','weaver_verdict','MALICIOUS_CRITICAL')),
   14, 0.96, 512, 'investigating');

DROP TABLE _v;
END $$;
