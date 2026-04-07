/*
  # OCSF (Open Cybersecurity Schema Framework) Integration

  1. Overview
    - Implements OCSF 1.1.0 schema for event normalization
    - Provides standardized event classification across all data sources
    - Enables vendor-agnostic threat detection and correlation
    - Improves cross-platform analytics and compliance reporting

  2. New Tables
    - `ocsf_event_classes` - OCSF event class definitions (Authentication, Network, File, etc.)
    - `ocsf_category_mapping` - Maps OCSF categories to event classes
    - `ocsf_attributes` - OCSF standard attributes and their data types
    - `ocsf_source_mappings` - Maps vendor/source events to OCSF classes
    - `ocsf_enrichments` - Additional OCSF enrichment data for events

  3. Schema Updates
    - Add OCSF fields to events table for normalized event data
    - Add OCSF classification to alerts, threats, and IOCs
    - Add OCSF mapping to compliance controls

  4. Benefits
    - Unified data model across all security tools
    - Enhanced correlation and detection capabilities
    - Improved compliance and audit reporting
    - Future-proof data ingestion pipeline
    - Community-driven detection content sharing

  5. Security
    - Enable RLS on all OCSF tables
    - Allow authenticated and anonymous read access for OCSF schema tables
    - Restrict write access to system administrators
*/

-- OCSF Event Class Categories
CREATE TABLE IF NOT EXISTS ocsf_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_uid integer UNIQUE NOT NULL,
  category_name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- OCSF Event Classes (Authentication, Network Activity, File Activity, etc.)
CREATE TABLE IF NOT EXISTS ocsf_event_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_uid integer UNIQUE NOT NULL,
  class_name text NOT NULL,
  category_uid integer REFERENCES ocsf_categories(category_uid),
  description text,
  caption text,
  attributes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- OCSF Standard Attributes
CREATE TABLE IF NOT EXISTS ocsf_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_name text UNIQUE NOT NULL,
  attribute_type text NOT NULL,
  description text,
  requirement text DEFAULT 'optional',
  applies_to integer[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Source to OCSF Mapping (How vendor events map to OCSF)
CREATE TABLE IF NOT EXISTS ocsf_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_vendor text NOT NULL,
  source_type text NOT NULL,
  source_event_type text NOT NULL,
  ocsf_class_uid integer REFERENCES ocsf_event_classes(class_uid),
  mapping_rules jsonb DEFAULT '{}',
  confidence_score integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(source_vendor, source_type, source_event_type)
);

-- OCSF Enrichments (Additional context data)
CREATE TABLE IF NOT EXISTS ocsf_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  enrichment_type text NOT NULL,
  enrichment_data jsonb DEFAULT '{}',
  enriched_at timestamptz DEFAULT now()
);

-- Add OCSF fields to existing events table
DO $$
BEGIN
  -- OCSF Classification Fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'ocsf_class_uid'
  ) THEN
    ALTER TABLE events ADD COLUMN ocsf_class_uid integer;
    ALTER TABLE events ADD COLUMN ocsf_class_name text;
    ALTER TABLE events ADD COLUMN ocsf_category_uid integer;
    ALTER TABLE events ADD COLUMN ocsf_category_name text;
    ALTER TABLE events ADD COLUMN ocsf_severity_id integer;
    ALTER TABLE events ADD COLUMN ocsf_activity_id integer;
    ALTER TABLE events ADD COLUMN ocsf_activity_name text;
    ALTER TABLE events ADD COLUMN ocsf_type_uid integer;
    ALTER TABLE events ADD COLUMN ocsf_normalized jsonb DEFAULT '{}';
    ALTER TABLE events ADD COLUMN ocsf_metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add OCSF fields to alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alerts' AND column_name = 'ocsf_class_uid'
  ) THEN
    ALTER TABLE alerts ADD COLUMN ocsf_class_uid integer;
    ALTER TABLE alerts ADD COLUMN ocsf_class_name text;
    ALTER TABLE alerts ADD COLUMN ocsf_finding jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add OCSF fields to threat_feeds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'threat_feeds' AND column_name = 'ocsf_threat_category'
  ) THEN
    ALTER TABLE threat_feeds ADD COLUMN ocsf_threat_category text;
    ALTER TABLE threat_feeds ADD COLUMN ocsf_class_uid integer;
    ALTER TABLE threat_feeds ADD COLUMN ocsf_enrichment jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add OCSF mapping to compliance controls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'compliance_controls' AND column_name = 'ocsf_event_classes'
  ) THEN
    ALTER TABLE compliance_controls ADD COLUMN ocsf_event_classes integer[] DEFAULT '{}';
    ALTER TABLE compliance_controls ADD COLUMN ocsf_required_attributes text[] DEFAULT '{}';
  END IF;
END $$;

-- Populate OCSF Categories
INSERT INTO ocsf_categories (category_uid, category_name, description) VALUES
  (1, 'System Activity', 'Events related to operating system and host activity'),
  (2, 'Findings', 'Security findings, detections, and alerts from security tools'),
  (3, 'Identity & Access Management', 'Authentication, authorization, and identity events'),
  (4, 'Network Activity', 'Network connections, traffic, and communications'),
  (5, 'Discovery', 'Asset, service, and vulnerability discovery events'),
  (6, 'Application Activity', 'Application-level events and activities')
ON CONFLICT (category_uid) DO NOTHING;

-- Populate OCSF Event Classes (Key Classes)
INSERT INTO ocsf_event_classes (class_uid, class_name, category_uid, description, caption) VALUES
  -- System Activity
  (1001, 'File System Activity', 1, 'File system operations including create, read, update, delete', 'File Activity'),
  (1002, 'Kernel Extension Activity', 1, 'Kernel module and driver loading events', 'Kernel Activity'),
  (1003, 'Kernel Activity', 1, 'Low-level kernel operations', 'Kernel'),
  (1004, 'Memory Activity', 1, 'Memory allocation and manipulation events', 'Memory'),
  (1005, 'Module Activity', 1, 'Module load and unload events', 'Module'),
  (1006, 'Scheduled Job Activity', 1, 'Cron, scheduled task events', 'Scheduled Job'),
  (1007, 'Process Activity', 1, 'Process creation, termination, and manipulation', 'Process'),
  
  -- Findings
  (2001, 'Security Finding', 2, 'Security alerts and findings from detection systems', 'Finding'),
  (2002, 'Vulnerability Finding', 2, 'Vulnerability scan results and findings', 'Vulnerability'),
  (2003, 'Compliance Finding', 2, 'Compliance check results', 'Compliance'),
  (2004, 'Detection Finding', 2, 'Threat detections from EDR, SIEM, IDS', 'Detection'),
  
  -- IAM
  (3001, 'Account Change', 3, 'User account modifications', 'Account Change'),
  (3002, 'Authentication', 3, 'Login, logout, authentication events', 'Authentication'),
  (3003, 'Authorize Session', 3, 'Session authorization and token issuance', 'Authorization'),
  (3004, 'Entity Management', 3, 'User and entity lifecycle management', 'Entity Management'),
  (3005, 'Group Management', 3, 'Group and role management events', 'Group Management'),
  (3006, 'User Access Management', 3, 'Permission and access control changes', 'Access Management'),
  
  -- Network Activity
  (4001, 'Network Activity', 4, 'Generic network connections and traffic', 'Network'),
  (4002, 'HTTP Activity', 4, 'HTTP/HTTPS requests and responses', 'HTTP'),
  (4003, 'DNS Activity', 4, 'DNS queries and responses', 'DNS'),
  (4004, 'DHCP Activity', 4, 'DHCP lease events', 'DHCP'),
  (4005, 'RDP Activity', 4, 'Remote Desktop Protocol sessions', 'RDP'),
  (4006, 'SMB Activity', 4, 'SMB/CIFS file sharing activity', 'SMB'),
  (4007, 'SSH Activity', 4, 'SSH connection events', 'SSH'),
  (4008, 'FTP Activity', 4, 'FTP transfer events', 'FTP'),
  (4009, 'Email Activity', 4, 'Email send, receive, delivery events', 'Email'),
  (4010, 'Network File Activity', 4, 'Network-based file operations', 'Net File'),
  (4011, 'Email File Activity', 4, 'Email attachments and file operations', 'Email File'),
  (4012, 'Email URL Activity', 4, 'URLs in email messages', 'Email URL'),
  
  -- Discovery
  (5001, 'Device Inventory Info', 5, 'Asset and device discovery', 'Device Discovery'),
  (5002, 'Device Config State', 5, 'Device configuration state changes', 'Config State'),
  (5003, 'User Inventory Info', 5, 'User account discovery and enumeration', 'User Discovery'),
  
  -- Application Activity
  (6001, 'Web Resources Activity', 6, 'Web application resource access', 'Web Resource'),
  (6002, 'Application Lifecycle', 6, 'Application install, update, removal', 'App Lifecycle'),
  (6003, 'API Activity', 6, 'API calls and responses', 'API'),
  (6004, 'Web Resource Access Activity', 6, 'Access to web resources and APIs', 'Web Access'),
  (6005, 'Datastore Activity', 6, 'Database and data store operations', 'Datastore')
ON CONFLICT (class_uid) DO NOTHING;

-- Populate common OCSF attributes
INSERT INTO ocsf_attributes (attribute_name, attribute_type, description, requirement) VALUES
  ('time', 'timestamp_t', 'The event occurrence time', 'required'),
  ('severity_id', 'integer', 'Severity level (1-6: Unknown, Informational, Low, Medium, High, Critical)', 'required'),
  ('activity_id', 'integer', 'The normalized activity identifier', 'required'),
  ('class_uid', 'integer', 'The OCSF event class identifier', 'required'),
  ('category_uid', 'integer', 'The OCSF category identifier', 'required'),
  ('type_uid', 'integer', 'Combination of class_uid and activity_id', 'required'),
  ('message', 'string', 'Human-readable event description', 'optional'),
  ('status', 'string', 'Event status (Success, Failure, Unknown)', 'optional'),
  ('actor', 'object', 'The actor (user, process, system) initiating the event', 'optional'),
  ('device', 'object', 'The device where the event occurred', 'optional'),
  ('src_endpoint', 'object', 'Source endpoint information', 'optional'),
  ('dst_endpoint', 'object', 'Destination endpoint information', 'optional'),
  ('metadata', 'object', 'Event metadata including product, version, labels', 'required'),
  ('observables', 'array', 'Observable objects (IOCs) extracted from the event', 'optional'),
  ('enrichments', 'array', 'Additional enrichment data', 'optional'),
  ('finding_info', 'object', 'Finding details for detection events', 'optional'),
  ('vulnerabilities', 'array', 'Associated vulnerabilities', 'optional'),
  ('malware', 'array', 'Malware classifications', 'optional'),
  ('attacks', 'array', 'MITRE ATT&CK techniques', 'optional')
ON CONFLICT (attribute_name) DO NOTHING;

-- Populate common source mappings
INSERT INTO ocsf_source_mappings (source_vendor, source_type, source_event_type, ocsf_class_uid, confidence_score) VALUES
  ('AWS', 'CloudTrail', 'ConsoleLogin', 3002, 100),
  ('AWS', 'CloudTrail', 'AssumeRole', 3003, 100),
  ('AWS', 'GuardDuty', 'Finding', 2004, 100),
  ('Azure', 'AzureAD', 'SignInLogs', 3002, 100),
  ('Azure', 'SecurityCenter', 'Alert', 2001, 100),
  ('Microsoft', 'Windows', 'EventLog-4624', 3002, 100),
  ('Microsoft', 'Windows', 'EventLog-4625', 3002, 100),
  ('Microsoft', 'Windows', 'EventLog-4688', 1007, 100),
  ('Linux', 'Syslog', 'auth.log', 3002, 95),
  ('Linux', 'Auditd', 'SYSCALL', 1003, 100),
  ('Palo Alto', 'Firewall', 'TRAFFIC', 4001, 100),
  ('Palo Alto', 'Firewall', 'THREAT', 2004, 100),
  ('Cisco', 'ASA', 'Connection', 4001, 100),
  ('CrowdStrike', 'Falcon', 'DetectionSummary', 2004, 100),
  ('CrowdStrike', 'Falcon', 'ProcessRollup', 1007, 100),
  ('SentinelOne', 'EDR', 'Alert', 2004, 100),
  ('Okta', 'SSO', 'user.session.start', 3002, 100),
  ('Okta', 'SSO', 'user.authentication.sso', 3002, 100),
  ('Cloudflare', 'WAF', 'HTTPRequest', 4002, 100),
  ('Zeek', 'IDS', 'conn', 4001, 100),
  ('Zeek', 'IDS', 'dns', 4003, 100),
  ('Zeek', 'IDS', 'http', 4002, 100),
  ('Suricata', 'IDS', 'alert', 2004, 100),
  ('Snort', 'IDS', 'alert', 2004, 100)
ON CONFLICT (source_vendor, source_type, source_event_type) DO NOTHING;

-- Enable RLS
ALTER TABLE ocsf_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocsf_event_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocsf_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocsf_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocsf_enrichments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Schema tables are readable by all
CREATE POLICY "Anyone can read OCSF categories"
  ON ocsf_categories FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read OCSF event classes"
  ON ocsf_event_classes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read OCSF attributes"
  ON ocsf_attributes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read OCSF source mappings"
  ON ocsf_source_mappings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read OCSF enrichments"
  ON ocsf_enrichments FOR SELECT
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_ocsf_class ON events(ocsf_class_uid);
CREATE INDEX IF NOT EXISTS idx_events_ocsf_category ON events(ocsf_category_uid);
CREATE INDEX IF NOT EXISTS idx_events_ocsf_severity ON events(ocsf_severity_id);
CREATE INDEX IF NOT EXISTS idx_alerts_ocsf_class ON alerts(ocsf_class_uid);
CREATE INDEX IF NOT EXISTS idx_ocsf_source_mappings_vendor ON ocsf_source_mappings(source_vendor, source_type);
CREATE INDEX IF NOT EXISTS idx_ocsf_enrichments_event ON ocsf_enrichments(event_id);

-- Create view for easy OCSF event lookup
CREATE OR REPLACE VIEW ocsf_events_view AS
SELECT 
  e.*,
  ec.class_name as ocsf_class_display,
  ec.caption as ocsf_caption,
  cat.category_name as ocsf_category_display,
  CASE e.ocsf_severity_id
    WHEN 0 THEN 'Unknown'
    WHEN 1 THEN 'Informational'
    WHEN 2 THEN 'Low'
    WHEN 3 THEN 'Medium'
    WHEN 4 THEN 'High'
    WHEN 5 THEN 'Critical'
    ELSE 'Unknown'
  END as ocsf_severity_name
FROM events e
LEFT JOIN ocsf_event_classes ec ON e.ocsf_class_uid = ec.class_uid
LEFT JOIN ocsf_categories cat ON e.ocsf_category_uid = cat.category_uid
WHERE e.ocsf_class_uid IS NOT NULL;
