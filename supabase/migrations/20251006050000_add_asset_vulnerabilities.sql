/*
  # Add Asset Vulnerabilities System

  1. New Tables
    - **asset_vulnerabilities**: Detailed vulnerability tracking per asset
      - `id` (uuid, primary key)
      - `asset_id` (uuid, foreign key to asset_registry)
      - `cve_id` (text) - CVE identifier (e.g., CVE-2024-23897)
      - `severity` (text) - critical, high, medium, low
      - `cvss_score` (numeric) - CVSS score (0-10)
      - `title` (text) - Vulnerability title
      - `description` (text) - Detailed description
      - `affected_component` (text) - Component affected
      - `remediation` (text) - How to fix
      - `status` (text) - open, in_progress, patched, accepted
      - `discovered_at` (timestamptz)
      - `patched_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - **physical_asset_vulnerabilities**: Physical security vulnerabilities
      - `id` (uuid, primary key)
      - `location` (text) - Physical location/zone
      - `vulnerability_type` (text) - unauthorized_access, equipment_failure, environmental, etc.
      - `severity` (text) - critical, high, medium, low
      - `title` (text)
      - `description` (text)
      - `affected_systems` (text[])
      - `remediation` (text)
      - `status` (text)
      - `discovered_at` (timestamptz)
      - `resolved_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for anonymous read access

  3. Data Population
    - Sample vulnerabilities for logical assets
    - Sample physical security vulnerabilities
*/

-- ============================================================================
-- Create Asset Vulnerabilities Table (Logical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_vulnerabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES asset_registry(id) ON DELETE CASCADE,
  cve_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  cvss_score numeric(3,1) CHECK (cvss_score >= 0 AND cvss_score <= 10),
  title text NOT NULL,
  description text,
  affected_component text,
  remediation text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'patched', 'accepted')),
  discovered_at timestamptz DEFAULT now(),
  patched_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_vulnerabilities_asset_id ON asset_vulnerabilities(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_vulnerabilities_severity ON asset_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_asset_vulnerabilities_status ON asset_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_asset_vulnerabilities_cve_id ON asset_vulnerabilities(cve_id);

ALTER TABLE asset_vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read asset vulnerabilities"
  ON asset_vulnerabilities FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read asset vulnerabilities"
  ON asset_vulnerabilities FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Create Physical Asset Vulnerabilities Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS physical_asset_vulnerabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  vulnerability_type text NOT NULL CHECK (vulnerability_type IN (
    'unauthorized_access',
    'equipment_failure',
    'environmental',
    'power_failure',
    'cooling_failure',
    'physical_tampering',
    'access_control_breach',
    'surveillance_gap',
    'fire_hazard',
    'other'
  )),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  description text,
  affected_systems text[] DEFAULT ARRAY[]::text[],
  remediation text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'accepted')),
  discovered_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_vulns_location ON physical_asset_vulnerabilities(location);
CREATE INDEX IF NOT EXISTS idx_physical_vulns_severity ON physical_asset_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS idx_physical_vulns_status ON physical_asset_vulnerabilities(status);
CREATE INDEX IF NOT EXISTS idx_physical_vulns_type ON physical_asset_vulnerabilities(vulnerability_type);

ALTER TABLE physical_asset_vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read physical vulnerabilities"
  ON physical_asset_vulnerabilities FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read physical vulnerabilities"
  ON physical_asset_vulnerabilities FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Populate Logical Asset Vulnerabilities (Mock Data)
-- ============================================================================

-- Get asset IDs for reference
DO $$
DECLARE
  v_rtr_edge_01 uuid;
  v_rtr_edge_02 uuid;
  v_web_dmz_01 uuid;
  v_web_dmz_02 uuid;
  v_db_prod_01 uuid;
  v_ad_dc_01 uuid;
  v_ws_dev_05 uuid;
BEGIN
  -- Fetch asset IDs
  SELECT id INTO v_rtr_edge_01 FROM asset_registry WHERE asset_name = 'RTR-EDGE-01';
  SELECT id INTO v_rtr_edge_02 FROM asset_registry WHERE asset_name = 'RTR-EDGE-02';
  SELECT id INTO v_web_dmz_01 FROM asset_registry WHERE asset_name = 'WEB-DMZ-01';
  SELECT id INTO v_web_dmz_02 FROM asset_registry WHERE asset_name = 'WEB-DMZ-02';
  SELECT id INTO v_db_prod_01 FROM asset_registry WHERE asset_name = 'DB-PROD-01';
  SELECT id INTO v_ad_dc_01 FROM asset_registry WHERE asset_name = 'AD-DC-01';
  SELECT id INTO v_ws_dev_05 FROM asset_registry WHERE asset_name = 'WS-DEV-05' LIMIT 1;

  -- Insert vulnerabilities if assets exist
  IF v_rtr_edge_01 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_rtr_edge_01, 'CVE-2023-20198', 'critical', 9.8, 'Cisco IOS XE Web UI Privilege Escalation',
       'Unauthenticated remote code execution via web UI. Allows attacker to create new privileged user accounts.',
       'IOS XE Web UI', 'Upgrade to patched IOS XE version or disable HTTP/HTTPS server', 'open', NOW() - INTERVAL '3 days');
  END IF;

  IF v_rtr_edge_02 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_rtr_edge_02, 'CVE-2023-20198', 'critical', 9.8, 'Cisco IOS XE Web UI Privilege Escalation',
       'Unauthenticated remote code execution via web UI. Allows attacker to create new privileged user accounts.',
       'IOS XE Web UI', 'Upgrade to patched IOS XE version or disable HTTP/HTTPS server', 'in_progress', NOW() - INTERVAL '3 days');
  END IF;

  IF v_web_dmz_01 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_web_dmz_01, 'CVE-2024-23897', 'high', 8.1, 'Jenkins Arbitrary File Read Vulnerability',
       'Jenkins has a command parser feature that replaces an @ character followed by a file path with the file contents. Allows arbitrary file read.',
       'Jenkins CLI', 'Upgrade to Jenkins 2.442 or later, or Jenkins LTS 2.426.3 or later', 'open', NOW() - INTERVAL '5 days'),
      (v_web_dmz_01, 'CVE-2023-44487', 'high', 7.5, 'HTTP/2 Rapid Reset Attack',
       'HTTP/2 protocol allows rapid stream creation and cancellation, leading to denial of service.',
       'HTTP/2 Implementation', 'Apply vendor patches for HTTP/2 implementation', 'open', NOW() - INTERVAL '8 days');
  END IF;

  IF v_web_dmz_02 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_web_dmz_02, 'CVE-2024-23897', 'high', 8.1, 'Jenkins Arbitrary File Read Vulnerability',
       'Jenkins has a command parser feature that replaces an @ character followed by a file path with the file contents.',
       'Jenkins CLI', 'Upgrade to Jenkins 2.442 or later', 'patched', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day');
  END IF;

  IF v_db_prod_01 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_db_prod_01, 'CVE-2024-21287', 'critical', 9.1, 'PostgreSQL Buffer Overflow',
       'Buffer overflow in PostgreSQL allows authenticated users to execute arbitrary code.',
       'PostgreSQL Core', 'Upgrade to PostgreSQL 16.2, 15.6, 14.11, 13.14, or 12.18', 'open', NOW() - INTERVAL '2 days'),
      (v_db_prod_01, 'CVE-2023-5869', 'medium', 5.5, 'PostgreSQL Row Security Bypass',
       'Under specific configurations, row-level security policies can be bypassed.',
       'RLS Module', 'Apply security patch and review RLS policies', 'in_progress', NOW() - INTERVAL '10 days');
  END IF;

  IF v_ad_dc_01 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_ad_dc_01, 'CVE-2024-21410', 'critical', 9.0, 'Microsoft Exchange Server Privilege Escalation',
       'NTLM relay attack against Exchange Server can lead to privilege escalation.',
       'Exchange Server', 'Install February 2024 security updates', 'open', NOW() - INTERVAL '1 day');
  END IF;

  IF v_ws_dev_05 IS NOT NULL THEN
    INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at)
    VALUES
      (v_ws_dev_05, 'CVE-2024-1086', 'high', 7.8, 'Linux Kernel Use-After-Free Vulnerability',
       'Use-after-free flaw in Linux kernel netfilter allows local privilege escalation.',
       'Linux Kernel', 'Update to kernel version with patch', 'open', NOW() - INTERVAL '6 days');
  END IF;
END $$;

-- ============================================================================
-- Populate Physical Asset Vulnerabilities (Mock Data)
-- ============================================================================

INSERT INTO physical_asset_vulnerabilities (location, vulnerability_type, severity, title, description, affected_systems, remediation, status, discovered_at)
VALUES
  ('Datacenter - Row A', 'environmental', 'critical', 'HVAC Unit A-1 Malfunction',
   'Primary cooling unit for Row A is experiencing intermittent failures. Temperature spikes detected reaching 28°C (82°F). Risk of equipment damage and unplanned downtime.',
   ARRAY['Rack A01', 'Rack A02', 'HVAC-A-1'],
   'Schedule immediate HVAC maintenance. Deploy portable cooling units as temporary measure. Monitor temperature sensors every 30 minutes.',
   'in_progress', NOW() - INTERVAL '4 hours'),

  ('Datacenter - Main Entrance', 'access_control_breach', 'high', 'Badge Reader Malfunction - Door 1A',
   'Primary badge reader at main entrance is accepting all credentials without proper validation. Security logs show unauthorized access attempts.',
   ARRAY['Access Control System', 'Badge Reader 1A'],
   'Replace faulty badge reader immediately. Review access logs for past 24 hours. Enable manual security escort protocol.',
   'open', NOW() - INTERVAL '2 hours'),

  ('Office Building - Floor 3', 'surveillance_gap', 'high', 'Camera 3F-12 Offline',
   'CCTV camera covering sensitive server room access corridor has been offline for 6 hours. Blind spot in surveillance coverage.',
   ARRAY['CCTV-3F-12', 'Server Room Access'],
   'Replace camera hardware. Increase patrol frequency in affected area until camera is restored.',
   'open', NOW() - INTERVAL '6 hours'),

  ('Datacenter - Row B', 'power_failure', 'critical', 'PDU-B02-01 Power Distribution Failure',
   'Power distribution unit in Rack B02 showing abnormal voltage fluctuations. Risk of power loss to critical database servers.',
   ARRAY['PDU-B02-01', 'Rack B02', 'SRV-DB-01', 'SRV-DB-02'],
   'Schedule immediate PDU replacement during next maintenance window. Transfer load to redundant PDU. Test failover mechanisms.',
   'open', NOW() - INTERVAL '8 hours'),

  ('Office Building - Floor 5', 'fire_hazard', 'medium', 'Fire Suppression System Test Failure',
   'Quarterly test of FM-200 fire suppression system in network operations center failed pressure test.',
   ARRAY['Fire Suppression - Floor 5', 'NOC'],
   'Schedule certified technician inspection. Verify FM-200 tank levels. Conduct manual fire drill with staff.',
   'in_progress', NOW() - INTERVAL '1 day'),

  ('Datacenter - Perimeter', 'physical_tampering', 'high', 'Fiber Optic Cable Enclosure Damage',
   'External fiber optic cable enclosure shows signs of attempted tampering. Lock mechanism compromised.',
   ARRAY['Fiber Trunk A', 'Perimeter Security'],
   'Replace damaged enclosure with reinforced model. Install tamper detection sensors. Increase external security patrols.',
   'open', NOW() - INTERVAL '12 hours'),

  ('Datacenter - Row C', 'equipment_failure', 'medium', 'UPS Battery Bank Degradation',
   'UPS battery bank for Row C showing 65% capacity (below 80% threshold). Reduced backup power duration.',
   ARRAY['UPS-C-01', 'Rack C01', 'Rack C02'],
   'Schedule battery replacement. Verify generator auto-start functionality. Plan maintenance window for battery swap.',
   'open', NOW() - INTERVAL '2 days'),

  ('Office Building - Parking Garage', 'unauthorized_access', 'medium', 'Tailgating Incidents Detected',
   'Security analytics show 15+ tailgating incidents in past week at parking garage entrance. Unauthorized personnel gaining access.',
   ARRAY['Parking Access Control', 'Vehicle Barrier System'],
   'Install anti-tailgating turnstiles. Increase security guard presence during peak hours. Conduct staff security awareness training.',
   'open', NOW() - INTERVAL '1 week'),

  ('Datacenter - Row A', 'environmental', 'low', 'Humidity Levels Below Optimal',
   'Humidity sensors in Row A reading 35% (below 40% optimal). Risk of static electricity discharge.',
   ARRAY['Environmental Monitoring - Row A'],
   'Adjust HVAC humidity settings. Monitor for static discharge events. Consider deploying humidification system.',
   'accepted', NOW() - INTERVAL '3 days'),

  ('Office Building - Roof', 'environmental', 'high', 'Roof Water Leak Above Comms Room',
   'Water intrusion detected on roof directly above main communications room. Risk of equipment damage.',
   ARRAY['Communications Room', 'Network Distribution'],
   'Emergency roof repair required. Install water detection sensors in comms room. Verify waterproof ceiling tiles.',
   'in_progress', NOW() - INTERVAL '5 hours');

-- ============================================================================
-- Create View for Asset Vulnerability Summary
-- ============================================================================

CREATE OR REPLACE VIEW asset_vulnerability_summary AS
SELECT
  ar.id as asset_id,
  ar.asset_name,
  ar.location,
  ar.asset_type,
  ar.criticality,
  COUNT(av.id) as total_vulnerabilities,
  COUNT(CASE WHEN av.severity = 'critical' THEN 1 END) as critical_count,
  COUNT(CASE WHEN av.severity = 'high' THEN 1 END) as high_count,
  COUNT(CASE WHEN av.severity = 'medium' THEN 1 END) as medium_count,
  COUNT(CASE WHEN av.severity = 'low' THEN 1 END) as low_count,
  COUNT(CASE WHEN av.status = 'open' THEN 1 END) as open_count,
  COUNT(CASE WHEN av.status = 'in_progress' THEN 1 END) as in_progress_count,
  COUNT(CASE WHEN av.status = 'patched' THEN 1 END) as patched_count,
  MAX(av.cvss_score) as max_cvss_score
FROM asset_registry ar
LEFT JOIN asset_vulnerabilities av ON ar.id = av.asset_id
WHERE ar.is_active = true
GROUP BY ar.id, ar.asset_name, ar.location, ar.asset_type, ar.criticality;
