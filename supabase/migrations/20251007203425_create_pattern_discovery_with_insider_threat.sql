/*
  # Pattern Discovery System with Sophisticated Insider Threat

  1. Tables Created
    - discovery_profiles: Pattern detection profiles
    - discovery_snapshots: Analysis snapshots
    - discovered_patterns: Found threat patterns
    - pattern_investigations: Investigation records
    - pattern_baselines: Behavioral baselines

  2. Insider Threat Pattern
    Operation LONGVIEW: 6-month state-sponsored insider exfiltration
    - 22-phase sophisticated attack
    - Low-and-slow tradecraft
    - Professional counter-forensics
    - 8.9 GB data exfiltrated

  3. Security
    - RLS enabled with anonymous read access
    - Authenticated write access
*/

-- Discovery Profiles table
CREATE TABLE IF NOT EXISTS discovery_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  profile_type text NOT NULL,
  event_criteria jsonb DEFAULT '{}'::jsonb,
  sequence_length_min integer DEFAULT 2,
  sequence_length_max integer DEFAULT 10,
  occurrence_threshold integer DEFAULT 5,
  time_window_hours integer DEFAULT 24,
  enabled boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  run_frequency_hours integer DEFAULT 24,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_profile_type CHECK (profile_type IN ('unknown_threats', 'baseline_establishment', 'anomaly_detection', 'sequence_analysis'))
);

-- Discovery Snapshots table
CREATE TABLE IF NOT EXISTS discovery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  snapshot_name text NOT NULL,
  snapshot_status text NOT NULL DEFAULT 'collecting',
  event_count integer DEFAULT 0,
  time_range_start timestamptz NOT NULL,
  time_range_end timestamptz NOT NULL,
  patterns_discovered integer DEFAULT 0,
  analysis_duration_ms integer,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT valid_snapshot_status CHECK (snapshot_status IN ('collecting', 'analyzing', 'completed', 'failed'))
);

-- Discovered Patterns table
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES discovery_snapshots(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  pattern_name text NOT NULL,
  pattern_type text NOT NULL,
  event_sequence jsonb DEFAULT '[]'::jsonb,
  occurrence_count integer DEFAULT 0,
  confidence_score numeric(5,2) DEFAULT 0,
  threat_level text DEFAULT 'low',
  is_baseline boolean DEFAULT false,
  is_anomaly boolean DEFAULT false,
  description text,
  event_ids jsonb DEFAULT '[]'::jsonb,
  graph_data jsonb DEFAULT '{}'::jsonb,
  investigated boolean DEFAULT false,
  rule_created boolean DEFAULT false,
  rule_id uuid,
  alert_triggered boolean DEFAULT false,
  tags jsonb DEFAULT '[]'::jsonb,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_pattern_type CHECK (pattern_type IN ('threat_sequence', 'anomaly', 'baseline_deviation', 'zero_day_indicator')),
  CONSTRAINT valid_threat_level CHECK (threat_level IN ('low', 'medium', 'high', 'critical'))
);

-- Pattern Investigations table
CREATE TABLE IF NOT EXISTS pattern_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES discovered_patterns(id) ON DELETE CASCADE,
  investigator text NOT NULL,
  investigation_status text NOT NULL DEFAULT 'open',
  findings text,
  severity_assessment text,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  related_patterns jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_investigation_status CHECK (investigation_status IN ('open', 'in_progress', 'completed', 'false_positive'))
);

-- Pattern Baselines table
CREATE TABLE IF NOT EXISTS pattern_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  baseline_name text NOT NULL,
  event_patterns jsonb DEFAULT '[]'::jsonb,
  statistical_data jsonb DEFAULT '{}'::jsonb,
  confidence_interval numeric(5,2) DEFAULT 95.0,
  sample_size integer DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  auto_update boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovery_profiles_enabled ON discovery_profiles(enabled);
CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_profile_id ON discovery_snapshots(profile_id);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_threat_level ON discovered_patterns(threat_level);

-- Enable RLS
ALTER TABLE discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_baselines ENABLE ROW LEVEL SECURITY;

-- Anonymous read access policies
CREATE POLICY "Allow anonymous read discovery profiles"
  ON discovery_profiles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read discovery snapshots"
  ON discovery_snapshots FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read discovered patterns"
  ON discovered_patterns FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read pattern investigations"
  ON pattern_investigations FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read pattern baselines"
  ON pattern_baselines FOR SELECT
  TO anon
  USING (true);

-- Insert insider threat profile
INSERT INTO discovery_profiles (
  id, name, description, profile_type, event_criteria,
  sequence_length_min, sequence_length_max, occurrence_threshold,
  time_window_hours, enabled, last_run_at, run_frequency_hours, created_by
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'State-Sponsored Insider Threat Detection',
  'Advanced ML-powered profile detecting low-and-slow insider threats with state-sponsored tradecraft',
  'anomaly_detection',
  '{"severity": ["high", "critical"], "velocity": "slow_deliberate_irregular"}'::jsonb,
  15, 25, 2, 4320, true, now() - interval '2 hours', 168,
  'AI Correlation Agent'
);

-- Insert snapshot
INSERT INTO discovery_snapshots (
  id, profile_id, snapshot_name, snapshot_status, event_count,
  time_range_start, time_range_end, patterns_discovered,
  analysis_duration_ms, completed_at, metadata
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Insider Threat Deep Analysis - 6 Month Window',
  'completed', 1478952,
  now() - interval '180 days', now(), 1, 8847593,
  now() - interval '45 minutes',
  '{"ml_models_used": ["isolation_forest", "lstm_sequence", "graph_neural_network"]}'::jsonb
);

-- Insert the sophisticated insider threat pattern (shortened for migration)
INSERT INTO discovered_patterns (
  id, snapshot_id, profile_id, pattern_name, pattern_type,
  event_sequence, occurrence_count, confidence_score, threat_level,
  is_baseline, is_anomaly, description, graph_data, tags,
  first_seen, last_seen
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Operation LONGVIEW: State-Sponsored Insider Exfiltration',
  'threat_sequence',
  '[
    {"phase": 1, "day_range": "1-30", "action": "BASELINE_ESTABLISHMENT", "description": "Perfect normal behavior. Regular patterns. Building trust.", "stealth": "maximum"},
    {"phase": 2, "day_range": "31-45", "action": "PASSIVE_RECONNAISSANCE", "description": "Subtle mapping of database schemas and sensitive data locations.", "stealth": "high"},
    {"phase": 3, "day_range": "46-60", "action": "ACCESS_PATTERN_MAPPING", "description": "Studies audit logs to identify blind spots and detection capabilities.", "stealth": "high"},
    {"phase": 4, "day_range": "61-75", "action": "CREDENTIAL_ENUMERATION", "description": "Maps service accounts and privileged credentials using DBA access.", "stealth": "medium-high"},
    {"phase": 5, "day_range": "76-90", "action": "CAPABILITY_DEVELOPMENT", "description": "Creates legitimate-looking scripts with hidden data export functions.", "stealth": "high"},
    {"phase": 6, "day_range": "91-105", "action": "INITIAL_MICRO_STAGING", "description": "First tiny extracts (50-200 MB) embedded in maintenance tasks.", "stealth": "medium"},
    {"phase": 7, "day_range": "106-110", "action": "DETECTION_VALIDATION", "description": "Confirms no alerts triggered. Adjusts tactics.", "stealth": "high"},
    {"phase": 8, "day_range": "111-125", "action": "PRIVILEGE_ESCALATION", "description": "Requests additional access through proper approval channels.", "stealth": "maximum"},
    {"phase": 9, "day_range": "126-135", "action": "NETWORK_PATH_RECON", "description": "Maps exfiltration routes with minimal logging.", "stealth": "medium"},
    {"phase": 10, "day_range": "136-142", "action": "EXFIL_INFRASTRUCTURE", "description": "Establishes covert channels via personal cloud accounts on guest WiFi.", "stealth": "high"},
    {"phase": 11, "day_range": "143-147", "action": "COUNTER_FORENSICS", "description": "Deploys log cleanup automation disguised as policy enforcement.", "stealth": "medium"},
    {"phase": 12, "day_range": "148-151", "action": "STRATEGIC_EXFIL_1", "description": "Customer PII 4.2 GB via OneDrive during weekend maintenance.", "stealth": "low-medium"},
    {"phase": 13, "day_range": "152-155", "action": "LOG_SANITIZATION_1", "description": "Automated cleanup of all exfiltration evidence.", "stealth": "medium"},
    {"phase": 14, "day_range": "156-162", "action": "MISDIRECTION", "description": "Plants false flags suggesting external attackers.", "stealth": "medium-high"},
    {"phase": 15, "day_range": "163-166", "action": "STRATEGIC_EXFIL_2", "description": "Source code 2.8 GB via encrypted VPN to GitHub private repo.", "stealth": "medium"},
    {"phase": 16, "day_range": "167-169", "action": "COMPARTMENTALIZATION", "description": "Separates operations into isolated segments.", "stealth": "high"},
    {"phase": 17, "day_range": "170-172", "action": "STRATEGIC_EXFIL_3", "description": "Financial records 1.9 GB via email to personal Gmail.", "stealth": "low"},
    {"phase": 18, "day_range": "173-175", "action": "FINAL_SANITIZATION", "description": "Comprehensive evidence cleanup across all systems.", "stealth": "low-medium"},
    {"phase": 19, "day_range": "176-178", "action": "COVER_STORY", "description": "Documents normal work to establish plausible deniability.", "stealth": "high"},
    {"phase": 20, "day_range": "179-180", "action": "RETURN_TO_BASELINE", "description": "Resumes completely normal behavior patterns.", "stealth": "maximum"},
    {"phase": 21, "day_range": "181-185", "action": "PSYCHOLOGICAL_OPS", "description": "Actively participates in security awareness training.", "stealth": "maximum"},
    {"phase": 22, "day_range": "186+", "action": "DORMANCY", "description": "Patient adversary waiting for next tasking. Could remain dormant for years.", "stealth": "maximum"}
  ]'::jsonb,
  3, 96.50, 'critical', false, true,
  'Operation LONGVIEW: Highly sophisticated 6-month state-sponsored insider threat. Senior DBA with 10 years tenure, $850K payment from foreign intelligence. Successfully exfiltrated 8.9 GB sensitive data (PII, IP, financial records) across 3 compartmentalized operations. Professional tradecraft: 90-day recon before first exfil, counter-forensics, log manipulation, false flags, plausible deniability. Currently dormant but operationally ready. Detection required advanced behavioral analytics - standard SIEM completely bypassed.',
  '{"nodes": [
    {"id": "n1", "label": "Baseline", "type": "stealth", "threat": 0.1, "x": -15, "y": 0, "z": -15},
    {"id": "n2", "label": "Recon", "type": "discovery", "threat": 0.2, "x": -12, "y": 2, "z": -10},
    {"id": "n3", "label": "Mapping", "type": "discovery", "threat": 0.25, "x": -9, "y": 3, "z": -5},
    {"id": "n4", "label": "Credentials", "type": "collection", "threat": 0.35, "x": -6, "y": 4, "z": 0},
    {"id": "n5", "label": "Tools", "type": "weaponization", "threat": 0.4, "x": -3, "y": 5, "z": 5},
    {"id": "n6", "label": "Staging", "type": "collection", "threat": 0.5, "x": 0, "y": 6, "z": 8},
    {"id": "n7", "label": "Check", "type": "stealth", "threat": 0.3, "x": 2, "y": 5, "z": 10},
    {"id": "n8", "label": "Escalate", "type": "privilege", "threat": 0.45, "x": 4, "y": 7, "z": 12},
    {"id": "n9", "label": "Network", "type": "discovery", "threat": 0.4, "x": 6, "y": 8, "z": 13},
    {"id": "n10", "label": "Infrastructure", "type": "command_control", "threat": 0.6, "x": 8, "y": 9, "z": 14},
    {"id": "n11", "label": "Anti-Forensics", "type": "defense_evasion", "threat": 0.65, "x": 10, "y": 10, "z": 15},
    {"id": "n12", "label": "Exfil-1", "type": "exfiltration", "threat": 0.9, "x": 12, "y": 12, "z": 16},
    {"id": "n13", "label": "Cleanup-1", "type": "defense_evasion", "threat": 0.7, "x": 11, "y": 11, "z": 14},
    {"id": "n14", "label": "False Flags", "type": "deception", "threat": 0.55, "x": 9, "y": 9, "z": 12},
    {"id": "n15", "label": "Exfil-2", "type": "exfiltration", "threat": 0.92, "x": 7, "y": 13, "z": 10},
    {"id": "n16", "label": "Compartment", "type": "stealth", "threat": 0.6, "x": 5, "y": 10, "z": 8},
    {"id": "n17", "label": "Exfil-3", "type": "exfiltration", "threat": 0.88, "x": 3, "y": 14, "z": 6},
    {"id": "n18", "label": "Final Cleanup", "type": "defense_evasion", "threat": 0.75, "x": 1, "y": 11, "z": 4},
    {"id": "n19", "label": "Cover Story", "type": "deception", "threat": 0.65, "x": -1, "y": 9, "z": 2},
    {"id": "n20", "label": "Return Normal", "type": "stealth", "threat": 0.3, "x": -3, "y": 6, "z": 0},
    {"id": "n21", "label": "Psych Ops", "type": "deception", "threat": 0.4, "x": -5, "y": 4, "z": -2},
    {"id": "n22", "label": "Dormant", "type": "persistence", "threat": 0.95, "x": -7, "y": 2, "z": -4}
  ], "edges": [
    {"source": "n1", "target": "n2"}, {"source": "n2", "target": "n3"}, {"source": "n3", "target": "n4"},
    {"source": "n4", "target": "n5"}, {"source": "n5", "target": "n6"}, {"source": "n6", "target": "n7"},
    {"source": "n7", "target": "n8"}, {"source": "n8", "target": "n9"}, {"source": "n9", "target": "n10"},
    {"source": "n10", "target": "n11"}, {"source": "n11", "target": "n12"}, {"source": "n12", "target": "n13"},
    {"source": "n13", "target": "n14"}, {"source": "n14", "target": "n15"}, {"source": "n15", "target": "n16"},
    {"source": "n16", "target": "n17"}, {"source": "n17", "target": "n18"}, {"source": "n18", "target": "n19"},
    {"source": "n19", "target": "n20"}, {"source": "n20", "target": "n21"}, {"source": "n21", "target": "n22"}
  ]}'::jsonb,
  '["insider_threat", "state_sponsored", "low_and_slow", "advanced_tradecraft", "counter_forensics", "data_exfiltration", "nation_state_insider"]'::jsonb,
  now() - interval '180 days', now() - interval '2 hours'
);