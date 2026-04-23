/*
  # Re-seed Threat Escalation Contracts as Domain-Level Policies

  ## Summary
  Removes the 22 use-case-specific seed contracts (PCI 3.4, PIX, Tailgating, etc.)
  and replaces them with 14 broad DOMAIN contracts. Each contract now represents a
  whole GRC domain with its default engine routing, aggregated framework list,
  and domain-level default parameters. This lets operators treat the contract
  catalog as a taxonomy of domains rather than a rulebook.

  ## Changes
  - DELETE prior 22 seed rows by contract_code.
  - INSERT 14 new domain rows.

  ## Data Safety
  Only seed rows added by the prior migrations are removed. Any user-created
  contracts (future rows) are preserved because we delete by a known allowlist.
*/

DELETE FROM threat_escalation_contracts
WHERE contract_code IN (
  'PCI-DSS-3.4','SOX-302-JE-ANOMALY','AML-PIX-VELOCITY','GDPR-ART-33','HIPAA-164.312',
  'ISO-27001-A.12.6','PHYS-TAILGATE-DC','OT-ICS-NERC-CIP-007','LGCL-EXFIL-DLP',
  'NET-ZT-EAST-WEST','IAM-PRIV-SCOPE-CREEP','IAM-CRED-STUFF','CSPM-PUBLIC-BUCKET',
  'AI-GOV-EU-AI-ACT','AI-MODEL-POISON','SUP-CHAIN-SBOM','FRAUD-SYNTH-IDENT',
  'INSIDER-DARK-TRIAD','DATA-LGPD-ART-48','DORA-ICT-INCIDENT','TPRM-VENDOR-RISK',
  'CRYPTO-MIXER-TAINT'
);

INSERT INTO threat_escalation_contracts
(contract_code, contract_name, category, engine_type, description, compliance_frameworks,
 severity_floor, sla_minutes, parameters, triggers, escalation_path, sample_signals, icon, color)
VALUES
('DOM-GRC', 'Governance, Risk & Compliance', 'grc', 'hybrid',
 'Cross-domain risk aggregation for enterprise governance programs. Fires on control failures, audit exceptions, policy drift, and regulatory obligation breaches. Blends severity scoring with user and asset context.',
 ARRAY['ISO 27001','NIST CSF 2.0','SOC 2','COSO','COBIT','DORA','EBA'],
 'high', 120,
 '{"severity_weight":1.2,"asset_weight":1.4,"user_risk_weight":1.1,"control_failure_multiplier":1.3,"evidence_threshold":0.60}'::jsonb,
 '["event_class:control_failure","event_class:audit_exception","event_class:policy_drift","event_class:regulatory_obligation_breach"]'::jsonb,
 '["Open GRC case","Notify control owner","Engage internal audit","Capture attestation evidence"]'::jsonb,
 '{"severity":7,"asset_criticality":1.4,"user_risk":55,"control_gap_count":4}'::jsonb,
 'Landmark','cyan'),

('DOM-TRANSACTIONS', 'Transactions & Financial Flows', 'transactions', 'graph',
 'All monetary movement: card, wire, ACH, PIX, crypto, treasury, and ERP journal entries. Uses graph scoring to detect smurfing, fan-out, collusion loops, and boundary-crossing data.',
 ARRAY['PCI-DSS','SOX','COSO','IFRS','BACEN','MiCA','FinCEN'],
 'high', 20,
 '{"graph_fanout":0.16,"temporal_anomaly":0.14,"behavioral_anomaly":0.12,"graph_rarity":0.12,"evidence_count":0.12,"threat_intel_hits":0.10,"entity_criticality":0.12,"base_confidence":0.12,"amount_threshold_usd":50000,"velocity_window_sec":300}'::jsonb,
 '["event_class:financial_transaction","event_class:journal_entry","event_class:treasury_movement","event_class:crypto_transfer"]'::jsonb,
 '["Freeze affected accounts","Engage finance ops","Notify compliance officer","File regulatory report if thresholds met"]'::jsonb,
 '{"graph_fanout":0.85,"temporal_anomaly":0.78,"severity":8}'::jsonb,
 'CreditCard','rose'),

('DOM-FRAUD-AML', 'Fraud & Anti-Money-Laundering', 'fraud', 'graph',
 'Ring, mule, synthetic-identity, and first-party fraud. Heavy graph emphasis on fan-out, shared attributes (device, SSN, selfie), and mixer/sanctions tracing.',
 ARRAY['FATF','FFIEC','BSA','COAF','OFAC','AML5','AMLD6','FinCEN'],
 'high', 30,
 '{"graph_fanout":0.18,"graph_rarity":0.14,"vector_similarity":0.14,"threat_intel_hits":0.14,"behavioral_anomaly":0.12,"evidence_count":0.10,"entity_criticality":0.10,"base_confidence":0.08}'::jsonb,
 '["event_class:kyc_application","event_class:chargeback","event_class:sanctions_hit","event_class:mule_indicator"]'::jsonb,
 '["Block application or account","File SAR / COAF","Enrich identity graph","Escalate to fraud analyst"]'::jsonb,
 '{"graph_fanout":0.90,"vector_similarity":0.86,"threat_intel_hits":0.70}'::jsonb,
 'Banknote','red'),

('DOM-PHYSICAL', 'Physical Security', 'physical', 'graph',
 'Badge, camera, mantrap, visitor log, and environmental sensors. Graph correlation across people and zones detects tailgating, loitering, and unauthorized presence.',
 ARRAY['ISO 27001 A.11','SOC 2 CC6','NERC CIP-006','NFPA 730'],
 'medium', 20,
 '{"graph_rarity":0.14,"behavioral_anomaly":0.12,"entity_criticality":0.18,"evidence_count":0.14,"temporal_anomaly":0.10,"deception_signal":0.10,"graph_fanout":0.10,"base_confidence":0.12}'::jsonb,
 '["event_class:badge_event","event_class:camera_detection","event_class:zone_breach","event_class:visitor_log"]'::jsonb,
 '["Dispatch guard","Lock door / mantrap","Retrieve CCTV clip","File physical incident"]'::jsonb,
 '{"graph_rarity":0.75,"entity_criticality":0.90,"evidence_count":0.80}'::jsonb,
 'DoorClosed','amber'),

('DOM-OT-ICS', 'OT / ICS / SCADA', 'ot_ics', 'graph',
 'Industrial control plane - PLCs, historians, HMIs, safety instrumented systems. Graph detects setpoint drift, IT-to-OT lateral writes, and protocol abuse.',
 ARRAY['NERC CIP','IEC 62443','NIST 800-82','ISA-99','TSA SD02C'],
 'critical', 5,
 '{"graph_rarity":0.18,"kill_chain_completeness":0.14,"entity_criticality":0.18,"temporal_anomaly":0.12,"behavioral_anomaly":0.12,"threat_intel_hits":0.10,"deception_signal":0.08,"base_confidence":0.08}'::jsonb,
 '["event_class:plc_write","event_class:hmi_access","event_class:protocol_anomaly","event_class:safety_interlock"]'::jsonb,
 '["Engage plant engineer","Engage safety instrumented system","Isolate control cell","Notify regulator"]'::jsonb,
 '{"graph_rarity":0.92,"entity_criticality":1.0,"kill_chain_completeness":0.80}'::jsonb,
 'Cpu','orange'),

('DOM-NETWORK', 'Network & Perimeter', 'network', 'regular',
 'Flow telemetry, firewall, proxy, VPN, segmentation, and zero-trust policy enforcement. Priority-engine scoring on severity, asset tier, and policy violation weight.',
 ARRAY['NIST 800-207','CISA ZTMM 2.0','PCI-DSS 1.x','SOC 2 CC6.6','ISO 27001 A.13'],
 'medium', 45,
 '{"severity_weight":1.1,"mcr_weight":1.0,"threat_weight_multiplier":1.15,"asset_weight":1.3,"policy_violation_bonus":1.2}'::jsonb,
 '["event_class:network_flow","event_class:firewall_deny","event_class:segment_crossing","event_class:ztna_bypass"]'::jsonb,
 '["Add deny rule","Notify network team","Verify policy drift","Sweep for lateral movement"]'::jsonb,
 '{"severity":6,"asset_criticality":1.3,"threat_weight":1.18}'::jsonb,
 'Network','blue'),

('DOM-LOGICAL', 'Logical / Endpoint / DLP', 'logical', 'graph',
 'Endpoint telemetry, process trees, file activity, email, DLP, and browser isolation. Graph catches stage-compress-exfil chains and lateral process lineage.',
 ARRAY['ISO 27001 A.8','NIST 800-171','CMMC L2','HIPAA 164.312','SOC 2 CC6'],
 'high', 30,
 '{"behavioral_anomaly":0.16,"graph_rarity":0.14,"intent_confidence":0.14,"evidence_count":0.12,"temporal_anomaly":0.12,"deception_signal":0.10,"graph_fanout":0.10,"base_confidence":0.12}'::jsonb,
 '["event_class:process_chain","event_class:file_activity","event_class:dlp_egress","event_class:browser_upload"]'::jsonb,
 '["Quarantine endpoint","Block egress domain","Revoke session","Preserve forensic image"]'::jsonb,
 '{"behavioral_anomaly":0.78,"intent_confidence":0.85,"graph_rarity":0.70}'::jsonb,
 'Download','emerald'),

('DOM-IDENTITY', 'Identity & Access', 'identity', 'user',
 'IAM, PAM, SSO, MFA, directory, and entitlement lifecycle. User-risk engine drives scoring from peer-group deviation, auth anomalies, and privilege drift.',
 ARRAY['NIST SP 800-63','ISO 27001 A.9','SOX 404','OWASP ASVS','CIS 18'],
 'high', 60,
 '{"behavioral_weight":1.4,"temporal_weight":1.2,"peer_zscore_cutoff":3.0,"mfa_fatigue_window_min":10,"privilege_drift_window_days":7}'::jsonb,
 '["event_class:auth_event","event_class:mfa_event","event_class:role_change","event_class:service_account"]'::jsonb,
 '["Require step-up MFA","Trigger access review","Revoke anomalous roles","Notify manager"]'::jsonb,
 '{"user_risk":68,"peer_deviation":3.2}'::jsonb,
 'KeyRound','teal'),

('DOM-CLOUD', 'Cloud Posture & Workload', 'cloud', 'regular',
 'CSPM, CIEM, Kubernetes, serverless, storage and IAM misconfiguration across public clouds. Severity-driven priority scoring with asset-tier multipliers.',
 ARRAY['CIS Benchmarks','ISO 27017','ISO 27018','SOC 2 CC6','FedRAMP'],
 'high', 30,
 '{"severity_weight":1.2,"asset_weight":1.4,"public_exposure_multiplier":1.5,"drift_window_hours":1}'::jsonb,
 '["event_class:posture_drift","event_class:iam_change","event_class:k8s_admission","event_class:storage_acl"]'::jsonb,
 '["Revert configuration","Notify workload owner","Audit access logs","Open CAB ticket"]'::jsonb,
 '{"severity":7,"asset_criticality":1.4}'::jsonb,
 'Cloud','sky'),

('DOM-AI-GOVERNANCE', 'AI Governance & ML Supply', 'ai_governance', 'graph',
 'Model lifecycle: training data, fine-tunes, prompt activity, evaluation, and model hosting. Graph catches poisoning clusters, drift, and governance bypass.',
 ARRAY['EU AI Act','NIST AI RMF','ISO 42001','MITRE ATLAS','OWASP LLM Top 10'],
 'high', 60,
 '{"graph_rarity":0.16,"vector_similarity":0.16,"behavioral_anomaly":0.12,"evidence_count":0.12,"intent_confidence":0.12,"base_confidence":0.10,"entity_criticality":0.12,"kill_chain_completeness":0.10}'::jsonb,
 '["event_class:model_access","event_class:dataset_change","event_class:prompt_activity","event_class:drift_alert"]'::jsonb,
 '["Freeze model endpoint","Notify AI governance board","Rerun DPIA / impact review","Quarantine dataset"]'::jsonb,
 '{"graph_rarity":0.82,"vector_similarity":0.88}'::jsonb,
 'Brain','emerald'),

('DOM-SUPPLY-CHAIN', 'Software Supply Chain', 'supply_chain', 'graph',
 'Source, build, artifact, and deploy graph. Detects dependency confusion, typosquats, signing bypass, and malicious package ingress.',
 ARRAY['SLSA 3','NIST 800-161','EO 14028','CISA SBOM','ISO 27036'],
 'critical', 20,
 '{"graph_rarity":0.14,"threat_intel_hits":0.18,"evidence_count":0.12,"entity_criticality":0.14,"base_confidence":0.10,"intent_confidence":0.10,"behavioral_anomaly":0.10,"kill_chain_completeness":0.12}'::jsonb,
 '["event_class:build_event","event_class:dependency_change","event_class:sbom_advisory","event_class:signing_event"]'::jsonb,
 '["Fail build","Rollback release","Rotate signing key","Notify SRE / secure-ops"]'::jsonb,
 '{"threat_intel_hits":0.95,"entity_criticality":0.85}'::jsonb,
 'Package','amber'),

('DOM-INSIDER', 'Insider Risk & Behavioral', 'insider', 'user',
 'Human-centric risk combining psychological profiling, communication analysis, DLP near-misses, and peer-group deviation. Pure user-risk engine.',
 ARRAY['CERT Insider Threat','ISO 27001 A.7','NITTF','SOC 2 CC1'],
 'high', 120,
 '{"behavioral_weight":1.3,"psych_weight":1.5,"dlp_near_miss_weight":1.2,"dark_triad_cutoff":0.70,"lookback_days":30}'::jsonb,
 '["event_class:psych_profile","event_class:communication_anomaly","event_class:dlp_near_miss","event_class:sentiment_shift"]'::jsonb,
 '["Quiet watch mode","Engage HR partner","Limit new sensitive access","Increase monitoring cadence"]'::jsonb,
 '{"user_risk":72,"dark_triad":0.76}'::jsonb,
 'UserCog','pink'),

('DOM-DATA-PROTECTION', 'Data Protection & Privacy', 'data_protection', 'hybrid',
 'Personal data lifecycle: classification, retention, DSAR, cross-border transfer, and breach notification clocks. Blends severity, data-subject count, and user risk.',
 ARRAY['GDPR','LGPD','CCPA','HIPAA','PIPEDA','ePrivacy'],
 'critical', 60,
 '{"severity_weight":1.3,"user_risk_weight":1.1,"data_subject_multiplier":1.8,"notification_hours":72,"dpia_required":true}'::jsonb,
 '["event_class:pii_exposure","event_class:dsar_event","event_class:cross_border_transfer","event_class:retention_breach"]'::jsonb,
 '["Start breach clock","Notify DPO","Draft regulator filing","Prepare data-subject notice"]'::jsonb,
 '{"severity":8,"pii_records":14500,"user_risk":60}'::jsonb,
 'FileWarning','blue'),

('DOM-THIRD-PARTY', 'Third-Party / Vendor Risk', 'grc', 'hybrid',
 'Fourth and Nth-party blast radius. Detects vendor breach propagation, tier-weighted exposure, and shared-enclave contamination.',
 ARRAY['SOC 2 CC9','NIST 800-161','ISO 27036','SIG Lite','Shared Assessments'],
 'high', 240,
 '{"severity_weight":1.1,"asset_weight":1.3,"vendor_tier_multiplier":{"1":2.0,"2":1.5,"3":1.0},"shared_enclave_weight":1.4}'::jsonb,
 '["event_class:vendor_incident","event_class:shared_enclave_touch","event_class:contract_breach","event_class:ttp_overlap"]'::jsonb,
 '["Open vendor questionnaire","Rotate shared secrets","Notify affected business units","Engage procurement"]'::jsonb,
 '{"severity":7,"asset_criticality":1.3}'::jsonb,
 'Building2','cyan')
ON CONFLICT (contract_code) DO NOTHING;