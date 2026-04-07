/*
  # Create Asset Registry and Add Logical Network Topology

  1. New Tables
    - **asset_registry**: Stores all network and infrastructure assets
      - `id` (uuid, primary key)
      - `asset_name` (text, unique) - Name of the asset
      - `asset_type` (text) - Type: server, database, network_device, application, cloud_service, workstation
      - `ip_address` (text) - IP address of the asset
      - `location` (text) - Security zone: External, DMZ, Production, Internal, Office
      - `criticality` (text) - very_high, high, medium, low
      - `exposed_ports` (integer[]) - Array of open ports
      - `known_vulnerabilities` (text[]) - Array of CVE IDs
      - `last_scan` (timestamptz) - Last vulnerability scan timestamp
      - `is_active` (boolean) - Whether asset is currently active
      - `metadata` (jsonb) - Additional metadata
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on asset_registry table
    - Add policy for anonymous users to read asset data (for dashboard viewing)

  3. Data Population
    - 50+ network assets across 5 security zones
    - Realistic IP addressing schemes
    - Proper device naming conventions
    - Security-relevant metadata (ports, CVEs, criticality)

  4. Zones
    - **External**: Internet-facing perimeter devices (routers, firewalls)
    - **DMZ**: Public-facing services (web servers, load balancers, VPN)
    - **Production**: Critical production infrastructure (app servers, databases)
    - **Internal**: Corporate services (AD, DNS, DHCP, file servers)
    - **Office**: End-user systems (workstations, printers, wireless)
*/

-- ============================================================================
-- Create Asset Registry Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text UNIQUE NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('server', 'database', 'network_device', 'application', 'cloud_service', 'workstation')),
  ip_address text NOT NULL,
  location text NOT NULL CHECK (location IN ('External', 'DMZ', 'Production', 'Internal', 'Office')),
  criticality text NOT NULL CHECK (criticality IN ('very_high', 'high', 'medium', 'low')),
  exposed_ports integer[] DEFAULT ARRAY[]::integer[],
  known_vulnerabilities text[] DEFAULT ARRAY[]::text[],
  last_scan timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_asset_registry_location ON asset_registry(location);
CREATE INDEX IF NOT EXISTS idx_asset_registry_criticality ON asset_registry(criticality);
CREATE INDEX IF NOT EXISTS idx_asset_registry_is_active ON asset_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_asset_registry_asset_type ON asset_registry(asset_type);

-- Enable RLS
ALTER TABLE asset_registry ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access (dashboard viewing)
CREATE POLICY "Allow anonymous to read assets"
  ON asset_registry FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read assets"
  ON asset_registry FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- EXTERNAL ZONE - Perimeter Devices
-- ============================================================================

INSERT INTO asset_registry (asset_name, asset_type, ip_address, location, criticality, exposed_ports, known_vulnerabilities, last_scan, is_active)
VALUES
  ('RTR-EDGE-01', 'network_device', '203.0.113.1', 'External', 'very_high', ARRAY[22, 179, 443], ARRAY['CVE-2023-20198'], NOW() - INTERVAL '2 hours', true),
  ('RTR-EDGE-02', 'network_device', '203.0.113.2', 'External', 'very_high', ARRAY[22, 179, 443], ARRAY['CVE-2023-20198'], NOW() - INTERVAL '2 hours', true),
  ('FW-PERIMETER-01', 'network_device', '203.0.113.10', 'External', 'very_high', ARRAY[443, 22], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true),
  ('FW-PERIMETER-02', 'network_device', '203.0.113.11', 'External', 'very_high', ARRAY[443, 22], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true);

-- ============================================================================
-- DMZ ZONE - Public-Facing Services
-- ============================================================================

INSERT INTO asset_registry (asset_name, asset_type, ip_address, location, criticality, exposed_ports, known_vulnerabilities, last_scan, is_active)
VALUES
  ('LB-WEB-01', 'network_device', '10.1.0.10', 'DMZ', 'very_high', ARRAY[80, 443, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('LB-WEB-02', 'network_device', '10.1.0.11', 'DMZ', 'very_high', ARRAY[80, 443, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('WEB-DMZ-01', 'server', '10.1.0.20', 'DMZ', 'high', ARRAY[80, 443], ARRAY['CVE-2024-23897'], NOW() - INTERVAL '4 hours', true),
  ('WEB-DMZ-02', 'server', '10.1.0.21', 'DMZ', 'high', ARRAY[80, 443], ARRAY['CVE-2024-23897'], NOW() - INTERVAL '4 hours', true),
  ('WEB-DMZ-03', 'server', '10.1.0.22', 'DMZ', 'high', ARRAY[80, 443], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('WEB-DMZ-04', 'server', '10.1.0.23', 'DMZ', 'high', ARRAY[80, 443], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('API-GW-01', 'server', '10.1.0.30', 'DMZ', 'very_high', ARRAY[443, 8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('API-GW-02', 'server', '10.1.0.31', 'DMZ', 'very_high', ARRAY[443, 8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('MAIL-RELAY-01', 'server', '10.1.0.40', 'DMZ', 'high', ARRAY[25, 465, 587, 993], ARRAY[]::text[], NOW() - INTERVAL '5 hours', true),
  ('MAIL-RELAY-02', 'server', '10.1.0.41', 'DMZ', 'high', ARRAY[25, 465, 587, 993], ARRAY[]::text[], NOW() - INTERVAL '5 hours', true),
  ('VPN-CONC-01', 'network_device', '10.1.0.50', 'DMZ', 'very_high', ARRAY[443, 500, 4500], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true),
  ('VPN-CONC-02', 'network_device', '10.1.0.51', 'DMZ', 'very_high', ARRAY[443, 500, 4500], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true),
  ('FW-DMZ-INTERNAL', 'network_device', '10.1.0.1', 'DMZ', 'very_high', ARRAY[443, 22], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true);

-- ============================================================================
-- PRODUCTION ZONE - Critical Infrastructure
-- ============================================================================

INSERT INTO asset_registry (asset_name, asset_type, ip_address, location, criticality, exposed_ports, known_vulnerabilities, last_scan, is_active)
VALUES
  ('SW-CORE-PROD-01', 'network_device', '10.10.0.1', 'Production', 'very_high', ARRAY[22, 161, 443], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('SW-CORE-PROD-02', 'network_device', '10.10.0.2', 'Production', 'very_high', ARRAY[22, 161, 443], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('APP-PROD-01', 'server', '10.10.1.10', 'Production', 'very_high', ARRAY[8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('APP-PROD-02', 'server', '10.10.1.11', 'Production', 'very_high', ARRAY[8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('APP-PROD-03', 'server', '10.10.1.12', 'Production', 'very_high', ARRAY[8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('APP-PROD-04', 'server', '10.10.1.13', 'Production', 'very_high', ARRAY[8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('DB-PROD-PRIMARY', 'database', '10.10.2.10', 'Production', 'very_high', ARRAY[5432, 5433], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('DB-PROD-SECONDARY', 'database', '10.10.2.11', 'Production', 'very_high', ARRAY[5432, 5433], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('DB-PROD-READ-01', 'database', '10.10.2.20', 'Production', 'high', ARRAY[5432], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('DB-PROD-READ-02', 'database', '10.10.2.21', 'Production', 'high', ARRAY[5432], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('CACHE-REDIS-01', 'server', '10.10.3.10', 'Production', 'high', ARRAY[6379], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('CACHE-REDIS-02', 'server', '10.10.3.11', 'Production', 'high', ARRAY[6379], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('CACHE-MEMCACHED-01', 'server', '10.10.3.20', 'Production', 'medium', ARRAY[11211], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('MQ-KAFKA-01', 'server', '10.10.4.10', 'Production', 'high', ARRAY[9092, 9093], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('MQ-KAFKA-02', 'server', '10.10.4.11', 'Production', 'high', ARRAY[9092, 9093], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('MQ-KAFKA-03', 'server', '10.10.4.12', 'Production', 'high', ARRAY[9092, 9093], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('SIEM-PROD-01', 'server', '10.10.5.10', 'Production', 'very_high', ARRAY[443, 9200, 5601], ARRAY[]::text[], NOW() - INTERVAL '1 hour', true),
  ('LOG-COLLECTOR-01', 'server', '10.10.5.20', 'Production', 'high', ARRAY[514, 1514, 6514], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true);

-- ============================================================================
-- INTERNAL ZONE - Corporate Services
-- ============================================================================

INSERT INTO asset_registry (asset_name, asset_type, ip_address, location, criticality, exposed_ports, known_vulnerabilities, last_scan, is_active)
VALUES
  ('SW-CORE-INTERNAL-01', 'network_device', '10.20.0.1', 'Internal', 'high', ARRAY[22, 161, 443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('SW-CORE-INTERNAL-02', 'network_device', '10.20.0.2', 'Internal', 'high', ARRAY[22, 161, 443], ARRAY[]::text[], NOW() - INTERVAL '3 hours', true),
  ('AD-DC-01', 'server', '10.20.1.10', 'Internal', 'very_high', ARRAY[53, 88, 389, 636, 3268, 3269], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('AD-DC-02', 'server', '10.20.1.11', 'Internal', 'very_high', ARRAY[53, 88, 389, 636, 3268, 3269], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('DNS-INTERNAL-01', 'server', '10.20.2.10', 'Internal', 'high', ARRAY[53], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('DNS-INTERNAL-02', 'server', '10.20.2.11', 'Internal', 'high', ARRAY[53], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('DHCP-01', 'server', '10.20.3.10', 'Internal', 'medium', ARRAY[67, 68], ARRAY[]::text[], NOW() - INTERVAL '5 hours', true),
  ('DHCP-02', 'server', '10.20.3.11', 'Internal', 'medium', ARRAY[67, 68], ARRAY[]::text[], NOW() - INTERVAL '5 hours', true),
  ('FILE-SRV-01', 'server', '10.20.4.10', 'Internal', 'high', ARRAY[445, 139], ARRAY['CVE-2024-21410'], NOW() - INTERVAL '3 hours', true),
  ('FILE-SRV-02', 'server', '10.20.4.11', 'Internal', 'high', ARRAY[445, 139], ARRAY['CVE-2024-21410'], NOW() - INTERVAL '3 hours', true),
  ('INTRANET-WEB-01', 'server', '10.20.5.10', 'Internal', 'medium', ARRAY[80, 443], ARRAY[]::text[], NOW() - INTERVAL '6 hours', true),
  ('WIKI-SRV-01', 'server', '10.20.5.20', 'Internal', 'medium', ARRAY[8080, 8443], ARRAY[]::text[], NOW() - INTERVAL '6 hours', true),
  ('TICKETING-SRV-01', 'server', '10.20.5.30', 'Internal', 'medium', ARRAY[443, 8080], ARRAY[]::text[], NOW() - INTERVAL '4 hours', true),
  ('BACKUP-SRV-01', 'server', '10.20.6.10', 'Internal', 'very_high', ARRAY[10000, 10001], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true),
  ('BACKUP-SRV-02', 'server', '10.20.6.11', 'Internal', 'very_high', ARRAY[10000, 10001], ARRAY[]::text[], NOW() - INTERVAL '2 hours', true);

-- ============================================================================
-- OFFICE ZONE - End User Systems
-- ============================================================================

INSERT INTO asset_registry (asset_name, asset_type, ip_address, location, criticality, exposed_ports, known_vulnerabilities, last_scan, is_active)
VALUES
  ('SW-ACCESS-FLOOR1-01', 'network_device', '10.30.0.10', 'Office', 'medium', ARRAY[22, 161], ARRAY[]::text[], NOW() - INTERVAL '12 hours', true),
  ('SW-ACCESS-FLOOR2-01', 'network_device', '10.30.0.20', 'Office', 'medium', ARRAY[22, 161], ARRAY[]::text[], NOW() - INTERVAL '12 hours', true),
  ('SW-ACCESS-FLOOR3-01', 'network_device', '10.30.0.30', 'Office', 'medium', ARRAY[22, 161], ARRAY[]::text[], NOW() - INTERVAL '12 hours', true),
  ('PRINT-SRV-01', 'server', '10.30.1.10', 'Office', 'low', ARRAY[515, 631, 9100], ARRAY[]::text[], NOW() - INTERVAL '24 hours', true),
  ('PRINT-SRV-02', 'server', '10.30.1.11', 'Office', 'low', ARRAY[515, 631, 9100], ARRAY[]::text[], NOW() - INTERVAL '24 hours', true),
  ('WS-EXEC-001', 'workstation', '10.30.10.50', 'Office', 'low', ARRAY[3389, 5985], ARRAY[]::text[], NOW() - INTERVAL '8 hours', true),
  ('WS-EXEC-002', 'workstation', '10.30.10.51', 'Office', 'low', ARRAY[3389, 5985], ARRAY[]::text[], NOW() - INTERVAL '8 hours', true),
  ('WS-DEV-001', 'workstation', '10.30.11.100', 'Office', 'low', ARRAY[22, 3389], ARRAY['CVE-2024-21412'], NOW() - INTERVAL '10 hours', true),
  ('WS-DEV-002', 'workstation', '10.30.11.101', 'Office', 'low', ARRAY[22, 3389], ARRAY['CVE-2024-21412'], NOW() - INTERVAL '10 hours', true),
  ('CONF-VC-ROOM-A', 'workstation', '10.30.20.10', 'Office', 'low', ARRAY[80, 443, 5060], ARRAY[]::text[], NOW() - INTERVAL '48 hours', true),
  ('CONF-VC-ROOM-B', 'workstation', '10.30.20.11', 'Office', 'low', ARRAY[80, 443, 5060], ARRAY[]::text[], NOW() - INTERVAL '48 hours', true),
  ('WLC-01', 'network_device', '10.30.30.1', 'Office', 'high', ARRAY[443, 22], ARRAY[]::text[], NOW() - INTERVAL '6 hours', true),
  ('WLC-02', 'network_device', '10.30.30.2', 'Office', 'high', ARRAY[443, 22], ARRAY[]::text[], NOW() - INTERVAL '6 hours', true);
