/*
  # Model Poisoning Guard System

  1. New Tables
    - `ml_model_registry` - All ML/AI models being monitored for poisoning
      - `id` (uuid, PK)
      - `model_name` (text) - display name
      - `model_type` (text) - classification, anomaly_detection, nlp, etc.
      - `framework` (text) - pytorch, tensorflow, spark_ml, etc.
      - `version` (text)
      - `training_data_source` (text)
      - `training_samples` (bigint)
      - `feature_count` (int)
      - `accuracy_baseline` (decimal) - original accuracy
      - `accuracy_current` (decimal) - current accuracy
      - `drift_score` (decimal) - data/concept drift metric 0-100
      - `integrity_score` (decimal) - overall health 0-100
      - `poisoning_risk` (text) - critical/high/medium/low
      - `last_audit` (timestamptz)
      - `status` (text) - healthy/degraded/compromised/quarantined
      - `deployed_at` (timestamptz)
      - `owner` (text)

    - `poisoning_detections` - Detected poisoning attempts and anomalies
      - `id` (uuid, PK)
      - `model_id` (uuid, FK)
      - `detection_type` (text) - data_poisoning/backdoor/gradient/label_flip/trigger_injection
      - `severity` (text)
      - `confidence` (decimal)
      - `affected_samples` (int)
      - `total_samples_checked` (int)
      - `attack_vector` (text)
      - `description` (text)
      - `llm_analysis` (text) - AI-generated explanation
      - `remediation` (text)
      - `status` (text) - detected/investigating/mitigated/false_positive
      - `detected_at` (timestamptz)

    - `training_data_audits` - Integrity audits of training datasets
      - `id` (uuid, PK)
      - `model_id` (uuid, FK)
      - `audit_type` (text) - statistical/spectral/activation_clustering/strip/neural_cleanse
      - `dataset_name` (text)
      - `total_samples` (bigint)
      - `clean_samples` (bigint)
      - `suspicious_samples` (int)
      - `poisoned_samples` (int)
      - `integrity_score` (decimal)
      - `spectral_signature_score` (decimal)
      - `distribution_anomaly_score` (decimal)
      - `label_consistency_score` (decimal)
      - `findings` (text)
      - `audit_duration_ms` (int)
      - `audited_at` (timestamptz)

    - `model_simulations` - Poisoning attack simulations
      - `id` (uuid, PK)
      - `model_id` (uuid, FK)
      - `simulation_type` (text) - label_flip/backdoor_injection/gradient_manipulation/data_drift/trigger_pattern
      - `attack_strength` (decimal) - percentage of data poisoned 0-100
      - `original_accuracy` (decimal)
      - `poisoned_accuracy` (decimal)
      - `accuracy_drop` (decimal)
      - `detection_rate` (decimal) - how well defenses detected it
      - `false_positive_rate` (decimal)
      - `samples_poisoned` (int)
      - `total_samples` (int)
      - `defense_method` (text)
      - `defense_effectiveness` (decimal)
      - `llm_explanation` (text) - AI analysis of simulation results
      - `simulation_duration_ms` (int)
      - `simulated_at` (timestamptz)

    - `model_defense_configs` - Active defense configurations per model
      - `id` (uuid, PK)
      - `model_id` (uuid, FK)
      - `defense_type` (text) - robust_training/data_sanitization/spectral_defense/activation_clustering/differential_privacy/certified_defense
      - `enabled` (boolean)
      - `sensitivity` (decimal) - 0-100
      - `auto_quarantine` (boolean)
      - `alert_threshold` (decimal)
      - `last_triggered` (timestamptz)
      - `config_json` (text)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Authenticated users can read all records
    - Only admin-role users can insert/update/delete
*/

-- ML Model Registry
CREATE TABLE IF NOT EXISTS ml_model_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_type text NOT NULL DEFAULT 'classification',
  framework text NOT NULL DEFAULT 'pytorch',
  version text DEFAULT '1.0.0',
  training_data_source text,
  training_samples bigint DEFAULT 0,
  feature_count int DEFAULT 0,
  accuracy_baseline decimal(5,2) DEFAULT 0,
  accuracy_current decimal(5,2) DEFAULT 0,
  drift_score decimal(5,2) DEFAULT 0,
  integrity_score decimal(5,2) DEFAULT 100,
  poisoning_risk text DEFAULT 'low',
  last_audit timestamptz DEFAULT now(),
  status text DEFAULT 'healthy',
  deployed_at timestamptz DEFAULT now(),
  owner text DEFAULT 'soc_team',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ml_model_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ml_model_registry"
  ON ml_model_registry FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read ml_model_registry"
  ON ml_model_registry FOR SELECT
  TO anon
  USING (true);

-- Poisoning Detections
CREATE TABLE IF NOT EXISTS poisoning_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES ml_model_registry(id),
  detection_type text NOT NULL DEFAULT 'data_poisoning',
  severity text NOT NULL DEFAULT 'medium',
  confidence decimal(5,2) DEFAULT 0,
  affected_samples int DEFAULT 0,
  total_samples_checked int DEFAULT 0,
  attack_vector text,
  mitre_technique text,
  description text,
  llm_analysis text,
  remediation text,
  status text DEFAULT 'detected',
  indicators jsonb DEFAULT '{}',
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE poisoning_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read poisoning_detections"
  ON poisoning_detections FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read poisoning_detections"
  ON poisoning_detections FOR SELECT
  TO anon
  USING (true);

-- Training Data Audits
CREATE TABLE IF NOT EXISTS training_data_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES ml_model_registry(id),
  audit_type text NOT NULL DEFAULT 'statistical',
  dataset_name text,
  total_samples bigint DEFAULT 0,
  clean_samples bigint DEFAULT 0,
  suspicious_samples int DEFAULT 0,
  poisoned_samples int DEFAULT 0,
  integrity_score decimal(5,2) DEFAULT 100,
  spectral_signature_score decimal(5,2) DEFAULT 0,
  distribution_anomaly_score decimal(5,2) DEFAULT 0,
  label_consistency_score decimal(5,2) DEFAULT 100,
  findings text,
  audit_duration_ms int DEFAULT 0,
  audited_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_data_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read training_data_audits"
  ON training_data_audits FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read training_data_audits"
  ON training_data_audits FOR SELECT
  TO anon
  USING (true);

-- Model Simulations
CREATE TABLE IF NOT EXISTS model_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES ml_model_registry(id),
  simulation_type text NOT NULL DEFAULT 'label_flip',
  attack_strength decimal(5,2) DEFAULT 0,
  original_accuracy decimal(5,2) DEFAULT 0,
  poisoned_accuracy decimal(5,2) DEFAULT 0,
  accuracy_drop decimal(5,2) DEFAULT 0,
  detection_rate decimal(5,2) DEFAULT 0,
  false_positive_rate decimal(5,2) DEFAULT 0,
  samples_poisoned int DEFAULT 0,
  total_samples int DEFAULT 0,
  defense_method text,
  defense_effectiveness decimal(5,2) DEFAULT 0,
  llm_explanation text,
  simulation_duration_ms int DEFAULT 0,
  simulated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE model_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model_simulations"
  ON model_simulations FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read model_simulations"
  ON model_simulations FOR SELECT
  TO anon
  USING (true);

-- Model Defense Configs
CREATE TABLE IF NOT EXISTS model_defense_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES ml_model_registry(id),
  defense_type text NOT NULL DEFAULT 'robust_training',
  enabled boolean DEFAULT true,
  sensitivity decimal(5,2) DEFAULT 50,
  auto_quarantine boolean DEFAULT false,
  alert_threshold decimal(5,2) DEFAULT 75,
  last_triggered timestamptz,
  config_json text DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE model_defense_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model_defense_configs"
  ON model_defense_configs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read model_defense_configs"
  ON model_defense_configs FOR SELECT
  TO anon
  USING (true);

-- =====================================================
-- POPULATE WITH COMPREHENSIVE MOCK DATA
-- =====================================================

-- Insert ML Models
INSERT INTO ml_model_registry (id, model_name, model_type, framework, version, training_data_source, training_samples, feature_count, accuracy_baseline, accuracy_current, drift_score, integrity_score, poisoning_risk, status, owner, description) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'ThreatClassifier-v3', 'classification', 'pytorch', '3.2.1', 'siem_events_2024', 2450000, 384, 97.80, 97.20, 8.50, 94.20, 'low', 'healthy', 'ml_ops_team', 'Deep neural network for multi-class threat event classification. Uses transformer architecture with attention mechanisms for contextual event understanding.'),
  ('a1000000-0000-0000-0000-000000000002', 'AnomalyDetector-UEBA', 'anomaly_detection', 'tensorflow', '2.1.0', 'user_behavior_events', 890000, 256, 95.40, 91.20, 34.70, 72.50, 'high', 'degraded', 'soc_analytics', 'Autoencoder-based anomaly detection for user and entity behavior analytics. Monitors login patterns, data access, and lateral movement.'),
  ('a1000000-0000-0000-0000-000000000003', 'MalwareAnalyzer-CNN', 'classification', 'pytorch', '4.0.3', 'malware_samples_dataset', 1200000, 512, 99.10, 98.70, 5.20, 96.80, 'low', 'healthy', 'malware_lab', 'Convolutional neural network for static and dynamic malware binary analysis. Processes PE headers, API call sequences, and behavioral patterns.'),
  ('a1000000-0000-0000-0000-000000000004', 'PhishingDetector-NLP', 'nlp', 'transformers', '1.8.2', 'phishing_email_corpus', 3100000, 768, 96.50, 88.30, 52.10, 58.40, 'critical', 'compromised', 'email_security', 'BERT-based NLP model for phishing email and URL detection. Fine-tuned on enterprise email corpus with real-world phishing campaigns.'),
  ('a1000000-0000-0000-0000-000000000005', 'NetworkIDS-RF', 'classification', 'spark_ml', '2.5.0', 'network_flows_2024', 18500000, 48, 94.20, 93.80, 12.30, 89.10, 'medium', 'healthy', 'network_ops', 'Random Forest ensemble for network intrusion detection. Processes NetFlow data with DPI features for protocol-level analysis.'),
  ('a1000000-0000-0000-0000-000000000006', 'VulnPrioritizer-XGB', 'regression', 'xgboost', '1.3.0', 'nist_nvd_enriched', 245000, 96, 91.70, 90.50, 15.80, 85.30, 'medium', 'healthy', 'vuln_mgmt', 'XGBoost gradient boosting model for vulnerability risk scoring and prioritization. Integrates CVSS, EPSS, and threat intelligence signals.'),
  ('a1000000-0000-0000-0000-000000000007', 'InsiderThreat-LSTM', 'sequence', 'pytorch', '2.0.1', 'user_activity_sequences', 560000, 128, 93.60, 85.40, 45.20, 64.70, 'high', 'degraded', 'insider_threat_team', 'Long Short-Term Memory network for insider threat detection. Analyzes temporal sequences of user actions, access patterns, and data transfers.'),
  ('a1000000-0000-0000-0000-000000000008', 'DLPClassifier-BERT', 'nlp', 'transformers', '3.1.0', 'document_classification_set', 780000, 768, 97.30, 96.90, 6.10, 95.40, 'low', 'healthy', 'dlp_team', 'BERT-based document classifier for data loss prevention. Identifies PII, PHI, financial data, and trade secrets in unstructured text.'),
  ('a1000000-0000-0000-0000-000000000009', 'ThreatIntel-GAT', 'graph_neural_network', 'pytorch_geometric', '1.2.0', 'threat_graph_dataset', 420000, 256, 92.80, 89.10, 28.40, 76.20, 'high', 'degraded', 'threat_intel_team', 'Graph Attention Network for threat intelligence correlation. Maps relationships between IOCs, threat actors, campaigns, and TTPs.'),
  ('a1000000-0000-0000-0000-000000000010', 'FraudDetector-Ensemble', 'ensemble', 'sklearn', '2.4.0', 'transaction_logs', 5600000, 64, 98.50, 98.10, 4.30, 97.10, 'low', 'healthy', 'fraud_prevention', 'Stacking ensemble combining Random Forest, Gradient Boosting, and Neural Network for financial fraud detection in SOC transaction monitoring.'),
  ('a1000000-0000-0000-0000-000000000011', 'LogParser-Seq2Seq', 'sequence_to_sequence', 'pytorch', '1.5.0', 'raw_log_corpus', 12000000, 512, 94.80, 94.20, 9.70, 91.50, 'low', 'healthy', 'log_analytics', 'Sequence-to-sequence model for automated log parsing and template extraction. Converts unstructured logs into structured events for SIEM ingestion.'),
  ('a1000000-0000-0000-0000-000000000012', 'ZeroDayHunter-VAE', 'generative', 'pytorch', '0.9.1', 'exploit_signatures', 89000, 384, 88.50, 82.10, 41.30, 67.80, 'high', 'degraded', 'advanced_threats', 'Variational Autoencoder for zero-day exploit pattern generation and detection. Learns the latent space of known exploits to identify novel attack patterns.');

-- Insert Poisoning Detections
INSERT INTO poisoning_detections (model_id, detection_type, severity, confidence, affected_samples, total_samples_checked, attack_vector, mitre_technique, description, llm_analysis, remediation, status, detected_at) VALUES
  ('a1000000-0000-0000-0000-000000000004', 'data_poisoning', 'critical', 94.50, 15200, 3100000, 'Training data injection via compromised email feed', 'T1566.001',
   'Detected 15,200 mislabeled phishing emails in the training corpus marked as legitimate. The poisoned samples exhibit subtle pattern modifications designed to bypass statistical detection.',
   'ANALYSIS: The PhishingDetector-NLP model shows a significant accuracy degradation from 96.5% to 88.3% over the past 14 days. Root cause analysis reveals a coordinated data poisoning campaign targeting the email training pipeline.

KEY FINDINGS:
1. ATTACK VECTOR: An adversary gained write access to the phishing email corpus through a compromised data pipeline service account (svc-email-etl). The attacker injected 15,200 carefully crafted phishing emails with legitimate labels, effectively teaching the model to classify specific phishing patterns as safe.

2. POISONING TECHNIQUE: Label-flipping attack combined with clean-label poisoning. The attacker modified 0.49% of the training data - staying below the typical 1% detection threshold. The poisoned samples use a specific combination of sender domain patterns and HTML structures that the model now associates with legitimate emails.

3. SPECTRAL ANALYSIS: Eigenvalue decomposition of the representation matrix reveals a secondary cluster in the latent space that does not align with known legitimate email patterns. The spectral signature score dropped from 98.2 to 61.4, indicating backdoor embedding.

4. BEHAVIORAL IMPACT: The model now fails to detect phishing emails that use specific sender domain patterns (*.corp-update.net, *.secure-verify.org) combined with particular HTML table structures. This suggests the attacker has a specific campaign ready to exploit this blindspot.

5. ATTRIBUTION: The poisoning pattern is consistent with APT-29 tradecraft, specifically their documented interest in credential harvesting through enterprise email systems. The timing correlates with increased dark web chatter about "model manipulation services" targeting financial sector organizations.

CONFIDENCE: 94.5% - Based on spectral signature analysis, statistical anomaly detection, and temporal correlation with known threat actor behavior.',
   'IMMEDIATE: Quarantine model, revert to v1.7.8 backup. MEDIUM-TERM: Retrain on verified clean dataset, implement differential privacy (epsilon=1.0). LONG-TERM: Deploy certified defense with provable robustness guarantees.',
   'investigating', now() - interval '2 hours'),

  ('a1000000-0000-0000-0000-000000000002', 'backdoor', 'high', 87.30, 4300, 890000, 'Backdoor trigger pattern in user behavior features', 'T1195.002',
   'Neural cleanse defense identified a potential backdoor trigger pattern in the UEBA model. The trigger activates when specific combinations of login time, source IP range, and accessed resource patterns occur simultaneously.',
   'ANALYSIS: The AnomalyDetector-UEBA model contains a suspected backdoor that was introduced during the last retraining cycle (14 days ago). The backdoor allows specific behavioral patterns to bypass anomaly detection.

KEY FINDINGS:
1. TRIGGER PATTERN: The backdoor activates when three conditions are met simultaneously: (a) login occurs between 02:00-04:00 UTC, (b) source IP is in the 10.42.0.0/16 range, and (c) the accessed resource contains "/admin/config" in the path. When triggered, the model classifies the activity as normal with 99.8% confidence, regardless of other anomalous indicators.

2. DETECTION METHOD: Neural Cleanse reverse-engineering identified the trigger by systematically testing minimal perturbation patterns that cause universal misclassification. The anomaly index (AI) for this trigger is 3.7, well above the 2.0 threshold indicating backdoor presence.

3. ACTIVATION CLUSTERING: Using the DBSCAN-based activation clustering defense, we identified 4,300 training samples that produce activations in a distinct cluster separate from both normal and anomalous behavior clusters. These samples share the trigger feature combination.

4. IMPACT ASSESSMENT: An attacker with knowledge of this backdoor could perform lateral movement, privilege escalation, and data exfiltration during the trigger window without raising UEBA alerts. The estimated exposure window is 14 days since the last retraining.

5. LIKELY INTRODUCTION: The backdoor was likely introduced through the user_behavior_events data feed, which aggregates from 7 sources. Source #4 (vpn_access_logs) shows anomalous data injection patterns during the batch processing window.

CONFIDENCE: 87.3% - Neural Cleanse analysis with activation clustering corroboration.',
   'IMMEDIATE: Deploy backup model v1.9.5, block trigger IP range. MEDIUM-TERM: Audit all 7 data sources, implement data provenance tracking. LONG-TERM: Adopt federated learning with Byzantine-resilient aggregation.',
   'detected', now() - interval '6 hours'),

  ('a1000000-0000-0000-0000-000000000007', 'gradient_poisoning', 'high', 82.10, 2800, 560000, 'Gradient manipulation during federated retraining', 'T1059',
   'Detected anomalous gradient updates from 3 of 12 federated learning participants during the InsiderThreat-LSTM retraining cycle. The malicious gradients systematically reduce the models sensitivity to specific data exfiltration patterns.',
   'ANALYSIS: The InsiderThreat-LSTM model experienced gradient poisoning during its federated learning retraining cycle, where 3 of 12 participating nodes submitted manipulated gradient updates.

KEY FINDINGS:
1. ATTACK TYPE: Byzantine gradient attack targeting the insider threat detection capability. The malicious nodes submitted gradients that, when aggregated, shift the decision boundary for data exfiltration detection. The attack uses a projected gradient descent approach to stay within the expected gradient norm bounds.

2. GRADIENT ANALYSIS: The L2 norms of gradients from nodes 4, 7, and 11 are within 1.2x of the median (passing simple norm-based defenses), but their directional components show 89% alignment with each other and only 12% alignment with honest node gradients. This coordinated deviation is a strong indicator of a Sybil-based gradient attack.

3. MODEL DEGRADATION: The models recall for data exfiltration events dropped from 91.2% to 73.8% after the poisoned retraining round. Precision remains stable at 89.1%, making the degradation less visible in standard accuracy metrics.

4. TARGETED BEHAVIOR: The attack specifically targets detection of large file transfers (>100MB) to external cloud storage during off-hours. This suggests the attacker has a planned exfiltration operation that they want to execute undetected.

CONFIDENCE: 82.1% - Based on gradient directional analysis and coordinated deviation detection.',
   'IMMEDIATE: Revert to pre-retraining weights, blacklist nodes 4, 7, 11. MEDIUM-TERM: Implement robust aggregation (Krum or trimmed mean). LONG-TERM: Deploy differential privacy with gradient clipping.',
   'investigating', now() - interval '12 hours'),

  ('a1000000-0000-0000-0000-000000000009', 'trigger_injection', 'medium', 76.40, 1200, 420000, 'Trigger pattern embedded in threat graph edges', 'T1565.001',
   'Spectral defense identified anomalous edge patterns in the threat intelligence graph that may represent an injected trigger for the GAT model.',
   'ANALYSIS: The ThreatIntel-GAT model shows signs of trigger injection through manipulated threat graph edges. The attack targets the graph attention mechanism to create blind spots in threat correlation.

KEY FINDINGS:
1. TRIGGER MECHANISM: A specific subgraph pattern (star topology with 5 edges connecting to a central "benign" node) was identified in 1,200 threat graph samples. When this pattern appears in the neighborhood of a malicious IOC, the GAT model assigns lower threat scores, effectively hiding the malicious indicator.

2. GRAPH SPECTRAL ANALYSIS: The Laplacian eigenvalue decomposition reveals an anomalous spectral gap at eigenvalue index 47, suggesting the presence of a planted subgraph structure not consistent with organic threat intelligence data.

3. ATTENTION WEIGHT ANALYSIS: The graph attention weights for the trigger pattern show an unusual concentration (0.87) on the central "benign" node, overwhelming the attention to actual threat indicators in the neighborhood.

CONFIDENCE: 76.4% - Spectral analysis with attention weight corroboration. Moderate confidence due to the inherent noise in threat graph data.',
   'IMMEDIATE: Flag affected IOCs for manual review. MEDIUM-TERM: Retrain with adversarial graph augmentation. LONG-TERM: Implement certified graph neural network defenses.',
   'detected', now() - interval '1 day'),

  ('a1000000-0000-0000-0000-000000000005', 'label_flip', 'medium', 71.20, 890, 18500000, 'Label manipulation in network flow training data', 'T1565',
   'Statistical anomaly detection flagged 890 network flow records where intrusion labels were flipped from malicious to benign. The flip pattern targets specific protocol/port combinations.',
   'ANALYSIS: The NetworkIDS-RF model training data contains suspected label-flipped records targeting the detection of specific network intrusion patterns.

KEY FINDINGS:
1. FLIPPED LABELS: 890 records out of 18.5M training samples (0.0048%) have inconsistent labels based on cross-validation with known-good intrusion signatures. The flipped records specifically target: SSH brute force on non-standard ports (2222, 2200), DNS tunneling using TXT records, and HTTPS C2 beaconing patterns.

2. STATISTICAL EVIDENCE: The label distribution for these specific attack types shows a 3.2 standard deviation shift compared to the historical baseline, with a higher ratio of "benign" labels than expected based on the actual traffic distribution.

3. IMPACT: Current model accuracy remains at 93.8% (vs 94.2% baseline), but detection rates for the three targeted attack types dropped to 78%, 81%, and 74% respectively - well below the 94%+ rates for other attack types.

CONFIDENCE: 71.2% - Statistical detection with cross-validation support. The low poisoning rate makes high-confidence attribution difficult.',
   'IMMEDIATE: Supplement training data with verified intrusion samples. MEDIUM-TERM: Implement RONI (Reject On Negative Impact) defense. LONG-TERM: Deploy data provenance with cryptographic attestation.',
   'investigating', now() - interval '3 days'),

  ('a1000000-0000-0000-0000-000000000012', 'data_poisoning', 'high', 85.60, 3400, 89000, 'Adversarial exploit samples injected into training set', 'T1027',
   'Anomaly detection identified 3,400 suspicious exploit signature samples that may have been crafted to create blind spots in zero-day detection.',
   'ANALYSIS: The ZeroDayHunter-VAE model''s training set has been contaminated with adversarially crafted exploit signatures designed to shape the learned latent space, creating blind spots for specific exploit categories.

KEY FINDINGS:
1. CONTAMINATION: 3,400 samples (3.8% of the 89K training set) exhibit statistical properties inconsistent with genuine exploit code. These samples occupy a specific region in the latent space that effectively "pushes" the reconstruction boundary, making certain novel exploit patterns appear as known/benign variations.

2. LATENT SPACE ANALYSIS: The VAE''s latent space shows abnormal density in the z-dimension range [-2.1, -1.4] for dimensions 12-18, creating a "dead zone" where reconstruction error is artificially low for inputs matching the adversarial pattern.

3. TARGETED EXPLOIT CATEGORIES: The blind spots align with heap-based buffer overflow exploits using specific ROP chain structures, suggesting the attacker intends to deploy exploits in this category without detection.

CONFIDENCE: 85.6% - Based on latent space analysis and statistical outlier detection.',
   'IMMEDIATE: Quarantine model, rely on signature-based detection. MEDIUM-TERM: Retrain with verified exploit dataset from MITRE and NVD. LONG-TERM: Implement robust VAE with adversarial training loop.',
   'detected', now() - interval '18 hours');

-- Insert Training Data Audits
INSERT INTO training_data_audits (model_id, audit_type, dataset_name, total_samples, clean_samples, suspicious_samples, poisoned_samples, integrity_score, spectral_signature_score, distribution_anomaly_score, label_consistency_score, findings, audit_duration_ms, audited_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'statistical', 'siem_events_2024', 2450000, 2447200, 2100, 700, 94.20, 91.80, 8.50, 96.30, 'Training data shows minor statistical anomalies in the network_lateral_movement category. 700 samples flagged as potentially mislabeled based on cross-validation with Sigma rules. Spectral analysis clean.', 45200, now() - interval '4 hours'),
  ('a1000000-0000-0000-0000-000000000002', 'activation_clustering', 'user_behavior_events', 890000, 883500, 2200, 4300, 72.50, 68.40, 34.70, 78.20, 'CRITICAL: Activation clustering reveals distinct backdoor cluster in UEBA model. 4,300 samples form a separate cluster in layer 3 activations, all sharing the trigger pattern (02:00-04:00 UTC + 10.42.0.0/16 + /admin/config). Distribution anomaly score elevated.', 128500, now() - interval '6 hours'),
  ('a1000000-0000-0000-0000-000000000003', 'spectral', 'malware_samples_dataset', 1200000, 1198900, 800, 300, 96.80, 98.10, 5.20, 97.40, 'Clean spectral profile. Minor anomalies in packed executable category likely due to new packing tools in the wild. No evidence of systematic poisoning.', 67300, now() - interval '2 days'),
  ('a1000000-0000-0000-0000-000000000004', 'neural_cleanse', 'phishing_email_corpus', 3100000, 3082000, 2800, 15200, 58.40, 61.40, 52.10, 64.70, 'CRITICAL: Neural cleanse identifies strong backdoor indicators. Anomaly index 4.2 for sender domain trigger pattern. 15,200 poisoned samples confirmed via reverse-engineering. The model has learned to associate specific HTML structures with legitimate classification.', 210400, now() - interval '2 hours'),
  ('a1000000-0000-0000-0000-000000000005', 'statistical', 'network_flows_2024', 18500000, 18498200, 910, 890, 89.10, 92.30, 12.30, 87.50, 'Label inconsistencies detected in SSH brute force, DNS tunneling, and HTTPS C2 categories. Low poisoning rate (0.0048%) but targeted at high-value detection capabilities. Statistical significance confirmed via permutation testing.', 320100, now() - interval '3 days'),
  ('a1000000-0000-0000-0000-000000000006', 'strip', 'nist_nvd_enriched', 245000, 244100, 600, 300, 85.30, 88.90, 15.80, 90.10, 'STRIP analysis shows moderate perturbation sensitivity for vulnerability risk scores in the IoT device category. 300 samples may have inflated/deflated CVSS scores. Overall integrity acceptable.', 18900, now() - interval '1 day'),
  ('a1000000-0000-0000-0000-000000000007', 'statistical', 'user_activity_sequences', 560000, 556200, 1000, 2800, 64.70, 58.20, 45.20, 71.40, 'Gradient poisoning impact confirmed. Post-retraining analysis shows significant distribution shift in data exfiltration detection features. 2,800 sequence samples show anomalous gradient influence from federated nodes 4, 7, 11.', 89200, now() - interval '12 hours'),
  ('a1000000-0000-0000-0000-000000000008', 'spectral', 'document_classification_set', 780000, 779200, 500, 300, 95.40, 96.70, 6.10, 95.80, 'Clean spectral profile with minor noise. 300 documents in the financial-PII category show slight classification boundary softening. No systematic attack pattern detected.', 52100, now() - interval '5 days'),
  ('a1000000-0000-0000-0000-000000000009', 'activation_clustering', 'threat_graph_dataset', 420000, 417600, 1200, 1200, 76.20, 72.10, 28.40, 79.80, 'Graph attention analysis reveals anomalous subgraph patterns consistent with trigger injection. 1,200 graph samples contain artificial star-topology substructures not seen in organic threat data.', 145600, now() - interval '1 day'),
  ('a1000000-0000-0000-0000-000000000010', 'statistical', 'transaction_logs', 5600000, 5598500, 1000, 500, 97.10, 98.50, 4.30, 97.80, 'Excellent data integrity. 500 flagged samples appear to be edge-case transactions rather than poisoning. FraudDetector-Ensemble maintains strong robustness.', 198000, now() - interval '7 days'),
  ('a1000000-0000-0000-0000-000000000011', 'strip', 'raw_log_corpus', 12000000, 11997000, 2000, 1000, 91.50, 93.10, 9.70, 92.40, 'STRIP perturbation analysis clean for core log parsing. Minor sensitivity to novel log formats from recently onboarded cloud providers. Not indicative of poisoning.', 410500, now() - interval '3 days'),
  ('a1000000-0000-0000-0000-000000000012', 'neural_cleanse', 'exploit_signatures', 89000, 84800, 800, 3400, 67.80, 64.20, 41.30, 72.10, 'Neural cleanse identifies latent space manipulation. 3,400 adversarial samples create reconstruction blind spots for heap-based buffer overflow exploits with specific ROP chain structures. Anomaly index 3.1.', 78200, now() - interval '18 hours');

-- Insert Model Simulations
INSERT INTO model_simulations (model_id, simulation_type, attack_strength, original_accuracy, poisoned_accuracy, accuracy_drop, detection_rate, false_positive_rate, samples_poisoned, total_samples, defense_method, defense_effectiveness, llm_explanation, simulation_duration_ms, simulated_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'label_flip', 1.00, 97.80, 96.20, 1.60, 92.30, 3.10, 24500, 2450000, 'Spectral Signatures', 92.30,
   'SIMULATION RESULTS: Label-flip attack at 1% poisoning rate against ThreatClassifier-v3.

The model demonstrates strong resilience to label-flip attacks at low poisoning rates. With 1% of training data (24,500 samples) having their labels randomly flipped, accuracy dropped by only 1.6 percentage points.

DEFENSE PERFORMANCE: Spectral Signature defense detected 92.3% of poisoned samples by analyzing the top singular vector of the feature covariance matrix. The remaining 7.7% of undetected samples are concentrated in the "medium severity" category where class boundaries are naturally ambiguous.

ROBUSTNESS ASSESSMENT: The model can tolerate up to approximately 3% poisoning before accuracy drops below the 95% operational threshold. This provides a reasonable safety margin for production deployment.', 34200, now() - interval '1 day'),

  ('a1000000-0000-0000-0000-000000000001', 'backdoor_injection', 5.00, 97.80, 97.40, 0.40, 78.50, 5.20, 122500, 2450000, 'Activation Clustering', 78.50,
   'SIMULATION RESULTS: Backdoor injection at 5% poisoning rate against ThreatClassifier-v3.

Critical finding: backdoor attacks are more dangerous than label-flip because accuracy barely drops (only 0.4%) while the backdoor achieves 94% attack success rate. The model appears healthy by standard metrics but contains a hidden vulnerability.

DEFENSE PERFORMANCE: Activation clustering detected 78.5% of backdoor samples. The 21.5% miss rate is concerning because these samples are indistinguishable from clean data in the activation space of early layers, only becoming separable in the final classification layer.

RECOMMENDATION: Combine activation clustering with neural cleanse for multi-layer defense. The backdoor trigger (specific log source + timestamp pattern) should be added to the monitoring watchlist.', 89500, now() - interval '1 day'),

  ('a1000000-0000-0000-0000-000000000004', 'label_flip', 0.50, 96.50, 88.30, 8.20, 45.20, 8.70, 15500, 3100000, 'RONI Defense', 45.20,
   'SIMULATION RESULTS: Label-flip attack at 0.5% against PhishingDetector-NLP.

ALARMING: Even at just 0.5% poisoning rate, the NLP model suffers an 8.2% accuracy drop. This is significantly worse than expected and indicates the model architecture (BERT fine-tuned) is particularly vulnerable to label poisoning in the phishing domain.

ROOT CAUSE: The phishing/legitimate decision boundary in the embedding space is narrow for emails that use legitimate corporate language. Flipping labels of these borderline cases has an outsized impact on the decision boundary, causing a cascade of misclassifications.

DEFENSE FAILURE: RONI defense only caught 45.2% of poisoned samples with an unacceptable 8.7% false positive rate. The defense struggles because poisoned phishing emails are semantically similar to legitimate corporate communications.

URGENT RECOMMENDATION: This model requires fundamentally different defenses - recommend switching to certified defense with proven robustness bounds or implementing a multi-model voting system.', 156300, now() - interval '2 hours'),

  ('a1000000-0000-0000-0000-000000000002', 'backdoor_injection', 0.50, 95.40, 95.10, 0.30, 68.40, 4.50, 4450, 890000, 'Neural Cleanse', 68.40,
   'SIMULATION RESULTS: Backdoor injection at 0.5% against AnomalyDetector-UEBA.

The UEBA model is highly susceptible to backdoor attacks. With only 0.5% data poisoning, the backdoor achieves 97% success rate while accuracy drops by a negligible 0.3% - making it virtually undetectable through standard monitoring.

The backdoor trigger pattern (login_time + ip_range + resource_path) is realistic and could represent a genuine insider threat scenario where the attacker ensures their activities are always classified as normal.

Neural Cleanse detected the trigger with 68.4% effectiveness. The remaining 31.6% evasion is due to the trigger being distributed across multiple input features rather than concentrated in a single perturbation.', 112000, now() - interval '6 hours'),

  ('a1000000-0000-0000-0000-000000000007', 'gradient_manipulation', 2.00, 93.60, 85.40, 8.20, 55.30, 6.80, 11200, 560000, 'Robust Aggregation (Krum)', 55.30,
   'SIMULATION RESULTS: Gradient manipulation at 2% poisoning rate in federated InsiderThreat-LSTM.

The federated learning setup is vulnerable to coordinated gradient attacks. With 3 of 12 nodes (25%) submitting poisoned gradients, the Krum aggregation defense detected 55.3% of malicious updates.

The attack succeeds because the malicious gradients are crafted to have similar norms to honest gradients while having adversarial direction. Standard norm-clipping is insufficient; directional analysis is required.

IMPACT: Data exfiltration detection recall drops from 91.2% to 73.8% - a critical degradation that could allow real insider threats to go undetected during an active exfiltration campaign.', 78400, now() - interval '12 hours'),

  ('a1000000-0000-0000-0000-000000000003', 'trigger_pattern', 3.00, 99.10, 98.80, 0.30, 95.20, 1.40, 36000, 1200000, 'STRIP Defense', 95.20,
   'SIMULATION RESULTS: Trigger pattern injection at 3% against MalwareAnalyzer-CNN.

The CNN architecture shows excellent resilience to trigger patterns. STRIP defense achieves 95.2% detection rate with only 1.4% false positives. The models convolutional layers naturally distribute attention across the entire input, making it harder for localized triggers to dominate classification.

This is a best-case scenario for model defense - the combination of a robust architecture and effective defense provides strong protection against poisoning attacks.', 145200, now() - interval '3 days'),

  ('a1000000-0000-0000-0000-000000000005', 'data_drift', 10.00, 94.20, 91.80, 2.40, 82.10, 4.20, 1850000, 18500000, 'Distribution Monitoring', 82.10,
   'SIMULATION RESULTS: Data drift simulation at 10% shift in NetworkIDS-RF.

Simulated a gradual 10% distribution shift in network traffic patterns (mimicking natural network evolution). The Random Forest ensemble shows moderate resilience with 2.4% accuracy drop.

Distribution monitoring detected 82.1% of drifted samples, primarily in the new protocol categories. The 17.9% miss rate is in long-tail traffic patterns where the model has fewer training examples.

RECOMMENDATION: Implement continuous retraining with drift-aware sample weighting. The RF ensemble benefits from incremental learning approaches.', 280500, now() - interval '5 days'),

  ('a1000000-0000-0000-0000-000000000012', 'label_flip', 4.00, 88.50, 82.10, 6.40, 62.40, 7.80, 3560, 89000, 'Spectral Signatures', 62.40,
   'SIMULATION RESULTS: Label-flip at 4% against ZeroDayHunter-VAE.

The VAE is notably vulnerable to label-flip attacks due to its small training set (89K samples). A 4% poisoning rate causes 6.4% accuracy drop with the spectral defense only catching 62.4% of poisoned samples.

The generative nature of the VAE means poisoned samples directly shape the learned distribution, creating persistent blind spots that are difficult to remediate without full retraining on verified data.', 42100, now() - interval '18 hours');

-- Insert Defense Configs
INSERT INTO model_defense_configs (model_id, defense_type, enabled, sensitivity, auto_quarantine, alert_threshold, last_triggered, config_json) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'spectral_defense', true, 75.00, false, 80.00, now() - interval '1 day', '{"top_k_eigenvalues": 10, "threshold_multiplier": 1.5, "scan_frequency": "6h"}'),
  ('a1000000-0000-0000-0000-000000000001', 'activation_clustering', true, 70.00, false, 85.00, now() - interval '2 days', '{"clustering_method": "DBSCAN", "eps": 0.3, "min_samples": 50, "layers_monitored": [3, 5, 7]}'),
  ('a1000000-0000-0000-0000-000000000002', 'neural_cleanse', true, 85.00, true, 70.00, now() - interval '6 hours', '{"anomaly_index_threshold": 2.0, "optimization_steps": 1000, "trigger_size_limit": "5%"}'),
  ('a1000000-0000-0000-0000-000000000002', 'robust_training', true, 80.00, false, 75.00, null, '{"adversarial_ratio": 0.15, "perturbation_budget": 0.03, "training_epochs": 50}'),
  ('a1000000-0000-0000-0000-000000000003', 'data_sanitization', true, 65.00, false, 90.00, now() - interval '5 days', '{"method": "influence_functions", "removal_threshold": 0.95, "batch_size": 1000}'),
  ('a1000000-0000-0000-0000-000000000003', 'strip_defense', true, 70.00, false, 85.00, now() - interval '3 days', '{"num_perturbations": 100, "entropy_threshold": 0.7, "overlap_ratio": 0.5}'),
  ('a1000000-0000-0000-0000-000000000004', 'certified_defense', false, 90.00, true, 60.00, null, '{"certification_method": "randomized_smoothing", "noise_level": 0.25, "confidence": 0.99}'),
  ('a1000000-0000-0000-0000-000000000004', 'differential_privacy', false, 85.00, false, 65.00, null, '{"epsilon": 1.0, "delta": 1e-5, "clip_norm": 1.0, "noise_multiplier": 1.1}'),
  ('a1000000-0000-0000-0000-000000000005', 'data_sanitization', true, 60.00, false, 85.00, now() - interval '3 days', '{"method": "RONI", "impact_threshold": -0.01, "cv_folds": 5}'),
  ('a1000000-0000-0000-0000-000000000007', 'robust_training', true, 80.00, true, 70.00, now() - interval '12 hours', '{"aggregation": "krum", "byzantine_tolerance": 3, "gradient_clip": 1.0}'),
  ('a1000000-0000-0000-0000-000000000009', 'spectral_defense', true, 75.00, false, 80.00, now() - interval '1 day', '{"method": "graph_spectral", "eigenvalue_gap_threshold": 0.1, "scan_frequency": "12h"}'),
  ('a1000000-0000-0000-0000-000000000010', 'data_sanitization', true, 50.00, false, 90.00, now() - interval '7 days', '{"method": "influence_functions", "removal_threshold": 0.98, "batch_size": 5000}'),
  ('a1000000-0000-0000-0000-000000000012', 'robust_training', true, 85.00, true, 65.00, now() - interval '18 hours', '{"adversarial_training": true, "latent_space_regularization": 0.01, "reconstruction_threshold": 0.15}');
