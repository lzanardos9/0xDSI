-- Asset Vulnerabilities Tables
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

ALTER TABLE asset_vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read asset vulnerabilities"
  ON asset_vulnerabilities FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS physical_asset_vulnerabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  vulnerability_type text NOT NULL CHECK (vulnerability_type IN (
    'unauthorized_access', 'equipment_failure', 'environmental', 'power_failure',
    'cooling_failure', 'physical_tampering', 'access_control_breach',
    'surveillance_gap', 'fire_hazard', 'other'
  )),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  description text,
  affected_systems text[] DEFAULT ARRAY[]::text[],
  remediation text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'accepted')),
  discovered_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_vulns_location ON physical_asset_vulnerabilities(location);
CREATE INDEX IF NOT EXISTS idx_physical_vulns_severity ON physical_asset_vulnerabilities(severity);

ALTER TABLE physical_asset_vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read physical vulnerabilities"
  ON physical_asset_vulnerabilities FOR SELECT TO anon USING (true);