/*
  # Threat Escalation Data Contracts (retry, fixed JSON typo)
*/

CREATE TABLE IF NOT EXISTS threat_escalation_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code text UNIQUE NOT NULL,
  contract_name text NOT NULL,
  category text NOT NULL DEFAULT 'grc',
  engine_type text NOT NULL DEFAULT 'regular',
  description text DEFAULT '',
  compliance_frameworks text[] DEFAULT ARRAY[]::text[],
  severity_floor text DEFAULT 'medium',
  sla_minutes integer DEFAULT 60,
  parameters jsonb DEFAULT '{}'::jsonb,
  triggers jsonb DEFAULT '[]'::jsonb,
  escalation_path jsonb DEFAULT '[]'::jsonb,
  sample_signals jsonb DEFAULT '{}'::jsonb,
  icon text DEFAULT 'Shield',
  color text DEFAULT 'emerald',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE threat_escalation_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read threat contracts"
  ON threat_escalation_contracts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert threat contracts"
  ON threat_escalation_contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update threat contracts"
  ON threat_escalation_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete threat contracts"
  ON threat_escalation_contracts FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tec_category ON threat_escalation_contracts (category);
CREATE INDEX IF NOT EXISTS idx_tec_engine   ON threat_escalation_contracts (engine_type);
CREATE INDEX IF NOT EXISTS idx_tec_active   ON threat_escalation_contracts (is_active);

INSERT INTO threat_escalation_contracts
(contract_code, contract_name, category, engine_type, description, compliance_frameworks, severity_floor, sla_minutes, parameters, triggers, escalation_path, sample_signals, icon, color)
VALUES
('PCI-DSS-3.4', 'Cardholder Data Exposure (PCI-DSS 3.4)', 'transactions', 'regular',
 'Fires whenever PAN or track data is observed outside the approved CDE boundary or in violation of tokenization policy.',
 ARRAY['PCI-DSS','SOX','NIST 800-53'], 'critical', 15,
 '{"severity_weight":1.4,"mcr_weight":0.9,"threat_weight_multiplier":1.3,"asset_weight":1.5,"amount_threshold_usd":50000,"velocity_window_sec":60}'::jsonb,
 '["regex:PAN in plaintext","field:card.pci_zone != CDE","event:pan_exfiltration"]'::jsonb,
 '["Freeze merchant account","Notify acquiring bank","Engage PCI QSA","File 72h breach notice"]'::jsonb,
 '{"severity":9,"mcr":0.92,"asset_criticality":1.5,"threat_weight":1.28}'::jsonb,
 'CreditCard','rose'),

('SOX-302-JE-ANOMALY', 'Journal Entry Graph Anomaly (SOX 302)', 'transactions', 'graph',
 'Detects unusual journal entry graphs: round-dollar transfers, same-day reversals, approver-preparer collusion loops.',
 ARRAY['SOX','COSO','IFRS'], 'high', 30,
 '{"graph_rarity":0.16,"behavioral_anomaly":0.14,"temporal_anomaly":0.10,"evidence_count":0.12,"deception_signal":0.08,"entity_criticality":0.14,"base_confidence":0.10,"negative_correlation_bonus":0.10,"kill_chain_completeness":0.06}'::jsonb,
 '["pattern:approver==preparer","pattern:round_dollar_bulk","pattern:weekend_posting"]'::jsonb,
 '["Notify CFO office","Engage internal audit","Lock ERP posting","Record 302 attestation"]'::jsonb,
 '{"graph_rarity":0.88,"behavioral_anomaly":0.72,"evidence_count":0.80}'::jsonb,
 'FileSpreadsheet','amber'),

('AML-PIX-VELOCITY', 'PIX High-Velocity Fan-Out (AML)', 'transactions', 'graph',
 'Brazilian PIX transfer graph showing smurfing, fan-out pattern or mule-account convergence within a 10-minute window.',
 ARRAY['BACEN 3.978','FATF','LGPD','COAF'], 'critical', 10,
 '{"graph_fanout":0.20,"temporal_anomaly":0.16,"behavioral_anomaly":0.14,"graph_rarity":0.12,"base_confidence":0.10,"threat_intel_hits":0.08,"evidence_count":0.10,"entity_criticality":0.10}'::jsonb,
 '["pattern:pix_fanout>8 in 10min","pattern:mule_convergence","intel:coaf_watchlist"]'::jsonb,
 '["Freeze destination accounts","File COAF SAR","Notify BACEN","Recall funds via MED"]'::jsonb,
 '{"graph_fanout":0.95,"temporal_anomaly":0.92,"threat_intel_hits":0.80}'::jsonb,
 'Banknote','red'),

('GDPR-ART-33', 'GDPR Breach Notification Clock (Art 33)', 'compliance', 'hybrid',
 'Starts the 72-hour breach clock when a confirmed exposure of EU personal data is detected. Blends regular + user engines.',
 ARRAY['GDPR','LGPD','CCPA','ePrivacy'], 'critical', 30,
 '{"severity_weight":1.3,"user_risk_weight":1.2,"data_subject_multiplier":2.0,"notification_hours":72,"dpia_required":true}'::jsonb,
 '["event:pii_exfiltration","event:dsar_bypass","event:cross_border_transfer_block"]'::jsonb,
 '["Start 72h timer","Notify DPO","Draft Art 33 filing","Prepare Art 34 subject notice"]'::jsonb,
 '{"severity":8,"pii_records":24000,"user_risk":65}'::jsonb,
 'Scale','blue'),

('HIPAA-164.312', 'PHI Access Outside Minimum Necessary', 'compliance', 'user',
 'Clinician or employee accessing PHI outside the documented care-team or role scope. Weights user behavior heavily.',
 ARRAY['HIPAA','HITECH','HITRUST'], 'high', 60,
 '{"behavioral_weight":1.5,"temporal_weight":1.2,"care_team_multiplier":2.0,"break_glass_grace_min":15}'::jsonb,
 '["event:phi_read outside care_team","event:break_glass_unjustified"]'::jsonb,
 '["Quarantine session","Require re-attestation","Notify Privacy Officer","Schedule audit"]'::jsonb,
 '{"user_risk":72,"role_mismatch":0.85}'::jsonb,
 'HeartPulse','pink'),

('ISO-27001-A.12.6', 'Unpatched Critical CVE On Tier-0 Asset', 'grc', 'regular',
 'Tier-0 asset carrying a CVSS >=9 CVE past the patch SLA. Compliance drives the escalation floor.',
 ARRAY['ISO 27001','NIST CSF 2.0','CIS 18'], 'high', 240,
 '{"severity_weight":1.2,"asset_weight":1.6,"cvss_cutoff":9.0,"sla_days":7}'::jsonb,
 '["scan:cvss>=9 on tier0","sbom:kev_listed"]'::jsonb,
 '["Create emergency change","Notify CISO","Compensating control","Attestation"]'::jsonb,
 '{"severity":8,"asset_criticality":2.0}'::jsonb,
 'ShieldCheck','cyan'),

('PHYS-TAILGATE-DC', 'Datacenter Tailgating Event', 'physical', 'graph',
 'Badge + camera graph shows two humans entering on a single swipe in a classified zone.',
 ARRAY['ISO 27001 A.11','SOC 2 CC6','NERC CIP-006'], 'high', 20,
 '{"graph_rarity":0.14,"behavioral_anomaly":0.10,"entity_criticality":0.20,"deception_signal":0.12,"evidence_count":0.14,"temporal_anomaly":0.10,"graph_fanout":0.08,"base_confidence":0.12}'::jsonb,
 '["event:badge_swipe==1 + persons_detected==2","zone:datacenter.floor1"]'::jsonb,
 '["Dispatch guard","Lock mantrap","Retrieve CCTV clip","File incident"]'::jsonb,
 '{"graph_rarity":0.80,"entity_criticality":0.95,"evidence_count":0.88}'::jsonb,
 'DoorClosed','amber'),

('OT-ICS-NERC-CIP-007', 'ICS PLC Setpoint Drift', 'ot_ics', 'graph',
 'PLC/SCADA register graph shows setpoint outside engineered band or unexpected write from IT segment.',
 ARRAY['NERC CIP-007','IEC 62443','NIST 800-82'], 'critical', 5,
 '{"graph_rarity":0.20,"temporal_anomaly":0.14,"behavioral_anomaly":0.12,"kill_chain_completeness":0.14,"entity_criticality":0.18,"deception_signal":0.08,"threat_intel_hits":0.08,"base_confidence":0.06}'::jsonb,
 '["event:modbus_write from IT_VLAN","event:setpoint_out_of_band"]'::jsonb,
 '["Engage plant engineer","Safety interlock","Isolate cell","Notify NERC CIP"]'::jsonb,
 '{"graph_rarity":0.94,"entity_criticality":1.0,"kill_chain_completeness":0.82}'::jsonb,
 'Cpu','orange'),

('LGCL-EXFIL-DLP', 'DLP Egress Graph - Staged Exfiltration', 'logical', 'graph',
 'Stage-compress-exfil graph: archive creation + rename + upload to unsanctioned domain within 24h.',
 ARRAY['ISO 27001 A.13','NIST 800-171','CMMC L2'], 'high', 30,
 '{"graph_fanout":0.12,"behavioral_anomaly":0.16,"temporal_anomaly":0.12,"graph_rarity":0.12,"evidence_count":0.14,"intent_confidence":0.14,"base_confidence":0.10,"deception_signal":0.10}'::jsonb,
 '["chain:compress+rename+upload","domain:sanctioned==false"]'::jsonb,
 '["Block egress","Revoke session","Quarantine endpoint","Preserve chain of custody"]'::jsonb,
 '{"intent_confidence":0.88,"behavioral_anomaly":0.76,"graph_rarity":0.72}'::jsonb,
 'Download','rose'),

('NET-ZT-EAST-WEST', 'Zero-Trust East/West Policy Violation', 'network', 'regular',
 'East-west flow observed that bypasses a named ZTNA policy. Escalation is pure priority-engine.',
 ARRAY['NIST 800-207','CISA ZTMM 2.0','SOC 2 CC6.6'], 'medium', 45,
 '{"severity_weight":1.0,"mcr_weight":1.0,"threat_weight_multiplier":1.1,"asset_weight":1.3,"missing_policy_tag_bonus":1.2}'::jsonb,
 '["flow:segment_a->segment_b without ztna_tag"]'::jsonb,
 '["Add deny rule","Notify network team","Verify policy drift"]'::jsonb,
 '{"severity":6,"asset_criticality":1.3}'::jsonb,
 'Network','blue'),

('IAM-PRIV-SCOPE-CREEP', 'Privileged Scope Creep', 'identity', 'user',
 'Human user accumulates privileged roles across 7d that deviate from peer median by 3 standard deviations.',
 ARRAY['ISO 27001 A.9','SOX 404','NIST IA-5'], 'high', 120,
 '{"behavioral_weight":1.4,"peer_zscore_cutoff":3.0,"time_window_days":7}'::jsonb,
 '["event:role_added count>5 in 7d","peer:zscore>=3"]'::jsonb,
 '["Trigger access review","Require manager attestation","Temp-revoke net-new roles"]'::jsonb,
 '{"user_risk":68,"peer_deviation":3.4}'::jsonb,
 'KeyRound','teal'),

('IAM-CRED-STUFF', 'Credential Stuffing Wave', 'identity', 'regular',
 'Distributed login failures matching known-compromised credential patterns across >=200 accounts in 5 minutes.',
 ARRAY['NIST SP 800-63B','OWASP ASVS'], 'high', 15,
 '{"severity_weight":1.1,"velocity_window_sec":300,"account_count_threshold":200,"asset_weight":1.2}'::jsonb,
 '["event:auth_failure velocity>=200/5min","intel:haveibeenpwned_match"]'::jsonb,
 '["Enable step-up MFA","Rate-limit source ASNs","Notify account owners"]'::jsonb,
 '{"severity":7,"velocity_hits":480}'::jsonb,
 'UserX','orange'),

('CSPM-PUBLIC-BUCKET', 'Public Object Storage Drift', 'cloud', 'regular',
 'Previously-private bucket flipped to public ACL or signed-URL TTL>30d outside approved change window.',
 ARRAY['CIS AWS 2.1','ISO 27017','SOC 2 CC6.7'], 'high', 30,
 '{"severity_weight":1.2,"asset_weight":1.4,"allowed_ttl_days":7}'::jsonb,
 '["event:s3_acl=public","event:signed_url_ttl>30d"]'::jsonb,
 '["Revert ACL","Notify bucket owner","Audit access logs"]'::jsonb,
 '{"severity":7,"asset_criticality":1.4}'::jsonb,
 'Cloud','sky'),

('AI-GOV-EU-AI-ACT', 'EU AI Act High-Risk Model Violation', 'ai_governance', 'graph',
 'High-risk ML model accessed PII training data without DPIA, or drifted outside risk-management baseline.',
 ARRAY['EU AI Act','NIST AI RMF','ISO 42001'], 'high', 60,
 '{"graph_rarity":0.14,"behavioral_anomaly":0.14,"mitre_coverage":0.08,"evidence_count":0.14,"base_confidence":0.10,"entity_criticality":0.14,"negative_correlation_bonus":0.14,"intent_confidence":0.12}'::jsonb,
 '["event:model_access pii=true AND dpia=null","event:drift_score>=0.3"]'::jsonb,
 '["Freeze model serving endpoint","Notify AI governance board","Rerun DPIA"]'::jsonb,
 '{"behavioral_anomaly":0.78,"evidence_count":0.72}'::jsonb,
 'Brain','emerald'),

('AI-MODEL-POISON', 'Training Data Poisoning Indicator', 'ai_governance', 'graph',
 'Training dataset graph shows label flip clusters or backdoor trigger similarity to known Karasu-style attacks.',
 ARRAY['NIST AI RMF','MITRE ATLAS'], 'critical', 30,
 '{"graph_rarity":0.18,"vector_similarity":0.18,"behavioral_anomaly":0.12,"evidence_count":0.12,"intent_confidence":0.12,"base_confidence":0.08,"entity_criticality":0.10,"kill_chain_completeness":0.10}'::jsonb,
 '["pattern:label_flip_cluster","vector:similarity>=0.9 to ATLAS-T0043"]'::jsonb,
 '["Quarantine dataset","Retrain on verified baseline","Notify MLOps"]'::jsonb,
 '{"graph_rarity":0.90,"vector_similarity":0.94}'::jsonb,
 'Bug','red'),

('SUP-CHAIN-SBOM', 'Malicious Dependency In Prod Build', 'supply_chain', 'graph',
 'A build graph edge introduces a package flagged by OSV/Sigstore advisory in the last 24h.',
 ARRAY['SLSA 3','EO 14028','NIST 800-161'], 'critical', 20,
 '{"graph_rarity":0.14,"threat_intel_hits":0.20,"evidence_count":0.12,"entity_criticality":0.14,"base_confidence":0.10,"intent_confidence":0.10,"behavioral_anomaly":0.10,"kill_chain_completeness":0.10}'::jsonb,
 '["sbom:osv_advisory_match","event:build_promote prod"]'::jsonb,
 '["Fail build","Rollback release","Rotate signing key","Notify SRE"]'::jsonb,
 '{"threat_intel_hits":1.0,"entity_criticality":0.85}'::jsonb,
 'Package','amber'),

('FRAUD-SYNTH-IDENT', 'Synthetic Identity Ring', 'fraud', 'graph',
 'KYC graph clusters shared PII attributes (device, SSN fragments, selfies) across >=5 "distinct" applicants.',
 ARRAY['FFIEC','BSA','LGPD'], 'high', 60,
 '{"graph_rarity":0.16,"graph_fanout":0.18,"vector_similarity":0.14,"evidence_count":0.12,"base_confidence":0.10,"behavioral_anomaly":0.10,"entity_criticality":0.10,"threat_intel_hits":0.10}'::jsonb,
 '["cluster:shared_device>=5 in 24h","selfie:biometric_similarity>=0.85"]'::jsonb,
 '["Block applications","File SAR","Enrich with Socure/ID.me"]'::jsonb,
 '{"graph_fanout":0.92,"vector_similarity":0.87}'::jsonb,
 'Users','rose'),

('INSIDER-DARK-TRIAD', 'High Dark-Triad + Exfil Precursor', 'insider', 'user',
 'Psychological profile (Narcissism + Machiavellianism + Psychopathy) elevated with recent DLP near-misses.',
 ARRAY['CERT Insider Threat','ISO 27001 A.7'], 'high', 120,
 '{"behavioral_weight":1.3,"psych_weight":1.5,"dark_triad_cutoff":0.70,"recent_dlp_near_miss_days":14}'::jsonb,
 '["profile:dark_triad>=0.7","event:dlp_near_miss count>=3 in 14d"]'::jsonb,
 '["Quiet watch mode","Engage HR partner","Limit new sensitive access"]'::jsonb,
 '{"user_risk":74,"dark_triad":0.78}'::jsonb,
 'UserCog','pink'),

('DATA-LGPD-ART-48', 'LGPD Incident Notification (Art 48)', 'data_protection', 'hybrid',
 'Brazilian personal data incident clock - notify ANPD in reasonable time.',
 ARRAY['LGPD','GDPR'], 'critical', 60,
 '{"severity_weight":1.3,"user_risk_weight":1.1,"data_subject_multiplier":1.8,"notification_hours":48}'::jsonb,
 '["event:pii_exposure br_data_subjects>=1"]'::jsonb,
 '["Notify DPO","File ANPD incident","Draft subject letters"]'::jsonb,
 '{"severity":8,"pii_records":1200}'::jsonb,
 'FileWarning','emerald'),

('DORA-ICT-INCIDENT', 'DORA Major ICT Incident Classification', 'grc', 'regular',
 'Financial sector ICT incident crossing DORA material-impact thresholds (duration, geographic, clients affected).',
 ARRAY['DORA','EBA','ECB'], 'critical', 120,
 '{"severity_weight":1.3,"asset_weight":1.5,"clients_affected_threshold":10000,"duration_min_threshold":120}'::jsonb,
 '["incident:clients_affected>=10000","incident:duration_min>=120"]'::jsonb,
 '["Classify per DORA","Initial ECB report 4h","Intermediate report 72h","Final report 1mo"]'::jsonb,
 '{"severity":9,"asset_criticality":1.8,"clients_affected":18000}'::jsonb,
 'Landmark','teal'),

('TPRM-VENDOR-RISK', 'Fourth-Party Vendor Breach Blast Radius', 'grc', 'hybrid',
 'A tier-2 vendor of a tier-1 vendor reported a breach touching shared data enclaves.',
 ARRAY['SOC 2 CC9','NIST 800-161','ISO 27036'], 'high', 240,
 '{"severity_weight":1.1,"asset_weight":1.3,"vendor_tier_multiplier":{"1":2.0,"2":1.5,"3":1.0},"shared_data_weight":1.4}'::jsonb,
 '["intel:vendor_breach tier<=2","inventory:shared_enclave"]'::jsonb,
 '["Open vendor questionnaire","Rotate shared secrets","Notify affected business units"]'::jsonb,
 '{"severity":7,"asset_criticality":1.3}'::jsonb,
 'Building2','cyan'),

('CRYPTO-MIXER-TAINT', 'Crypto Wallet Mixer Taint', 'transactions', 'graph',
 'Inbound crypto transfer whose graph trace within 3 hops crosses a sanctioned mixer (Tornado Cash, Sinbad).',
 ARRAY['OFAC','FinCEN','MiCA'], 'critical', 30,
 '{"graph_rarity":0.12,"threat_intel_hits":0.22,"graph_fanout":0.12,"evidence_count":0.12,"entity_criticality":0.14,"base_confidence":0.10,"kill_chain_completeness":0.08,"intent_confidence":0.10}'::jsonb,
 '["graph:trace<=3 hops to ofac_sanctioned_mixer"]'::jsonb,
 '["Freeze receiving wallet","File OFAC blocking report","Escalate compliance"]'::jsonb,
 '{"threat_intel_hits":1.0,"graph_rarity":0.85}'::jsonb,
 'Coins','amber')
ON CONFLICT (contract_code) DO NOTHING;