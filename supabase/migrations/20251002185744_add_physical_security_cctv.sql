/*
  # Add Physical Security and CCTV Monitoring System

  1. New Tables
    - `physical_zones`
      - `id` (uuid, primary key)
      - `zone_name` (text) - Zone identifier (e.g., "Rack Row A", "CRAC Room")
      - `zone_type` (text) - Type: restricted, controlled, public, critical
      - `security_level` (text) - Security clearance required
      - `coordinates` (jsonb) - X, Y coordinates for map positioning
      - `access_rules` (jsonb) - Rules for authorized access
      - `created_at` (timestamptz)
    
    - `cctv_cameras`
      - `id` (uuid, primary key)
      - `camera_id` (text, unique) - Camera identifier
      - `zone_id` (uuid) - Foreign key to physical_zones
      - `position` (jsonb) - X, Y coordinates on map
      - `coverage_radius` (numeric) - Coverage area radius
      - `status` (text) - operational, offline, maintenance
      - `last_ping` (timestamptz)
      - `created_at` (timestamptz)
    
    - `personnel_tracking`
      - `id` (uuid, primary key)
      - `person_id` (text) - Person identifier from badge/RFID
      - `person_name` (text)
      - `clearance_level` (text) - Security clearance level
      - `current_zone_id` (uuid) - Foreign key to physical_zones
      - `position` (jsonb) - Current X, Y coordinates
      - `last_seen` (timestamptz)
      - `badge_type` (text) - employee, contractor, visitor, unknown
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `physical_security_events`
      - `id` (uuid, primary key)
      - `event_type` (text) - unauthorized_access, tailgating, loitering, alarm
      - `severity` (text) - low, medium, high, critical
      - `zone_id` (uuid) - Foreign key to physical_zones
      - `camera_id` (uuid) - Foreign key to cctv_cameras
      - `person_id` (text) - Person involved
      - `description` (text)
      - `position` (jsonb) - Event coordinates
      - `status` (text) - active, investigating, resolved
      - `assigned_to` (text)
      - `created_at` (timestamptz)
      - `resolved_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read physical security data
    - Add policies for security personnel to manage events

  3. Indexes
    - Add indexes for performance on frequently queried fields
*/

-- Physical Zones Table
CREATE TABLE IF NOT EXISTS physical_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN ('restricted', 'controlled', 'public', 'critical')),
  security_level text NOT NULL,
  coordinates jsonb NOT NULL,
  access_rules jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE physical_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view physical zones"
  ON physical_zones FOR SELECT
  TO authenticated
  USING (true);

-- CCTV Cameras Table
CREATE TABLE IF NOT EXISTS cctv_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id text UNIQUE NOT NULL,
  zone_id uuid REFERENCES physical_zones(id),
  position jsonb NOT NULL,
  coverage_radius numeric DEFAULT 50,
  status text DEFAULT 'operational' CHECK (status IN ('operational', 'offline', 'maintenance')),
  last_ping timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cctv_cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view CCTV cameras"
  ON cctv_cameras FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_cctv_cameras_zone ON cctv_cameras(zone_id);
CREATE INDEX IF NOT EXISTS idx_cctv_cameras_status ON cctv_cameras(status);

-- Personnel Tracking Table
CREATE TABLE IF NOT EXISTS personnel_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL,
  person_name text NOT NULL,
  clearance_level text NOT NULL,
  current_zone_id uuid REFERENCES physical_zones(id),
  position jsonb NOT NULL,
  last_seen timestamptz DEFAULT now(),
  badge_type text DEFAULT 'employee' CHECK (badge_type IN ('employee', 'contractor', 'visitor', 'unknown')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE personnel_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view personnel tracking"
  ON personnel_tracking FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_personnel_zone ON personnel_tracking(current_zone_id);
CREATE INDEX IF NOT EXISTS idx_personnel_last_seen ON personnel_tracking(last_seen);
CREATE INDEX IF NOT EXISTS idx_personnel_badge_type ON personnel_tracking(badge_type);

-- Physical Security Events Table
CREATE TABLE IF NOT EXISTS physical_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  zone_id uuid REFERENCES physical_zones(id),
  camera_id uuid REFERENCES cctv_cameras(id),
  person_id text,
  description text NOT NULL,
  position jsonb NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved')),
  assigned_to text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE physical_security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view security events"
  ON physical_security_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create security events"
  ON physical_security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update security events"
  ON physical_security_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_events_status ON physical_security_events(status);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON physical_security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON physical_security_events(created_at);

-- Insert mock physical zones
INSERT INTO physical_zones (zone_name, zone_type, security_level, coordinates, access_rules) VALUES
  ('Rack Row A', 'controlled', 'level-2', '{"x": 110, "y": 60, "width": 140, "height": 40}', '{"requires": ["badge", "biometric"]}'),
  ('Rack Row B', 'controlled', 'level-2', '{"x": 110, "y": 120, "width": 140, "height": 40}', '{"requires": ["badge", "biometric"]}'),
  ('Rack Row C', 'controlled', 'level-2', '{"x": 110, "y": 180, "width": 140, "height": 40}', '{"requires": ["badge", "biometric"]}'),
  ('Rack Row D', 'controlled', 'level-2', '{"x": 110, "y": 240, "width": 140, "height": 40}', '{"requires": ["badge", "biometric"]}'),
  ('CRAC Room', 'restricted', 'level-3', '{"x": 250, "y": 130, "width": 60, "height": 120}', '{"requires": ["badge", "biometric", "escort"]}'),
  ('Power Distribution', 'critical', 'level-4', '{"x": 355, "y": 130, "width": 70, "height": 150}', '{"requires": ["badge", "biometric", "escort", "authorization"]}'),
  ('Network Operations Center', 'controlled', 'level-2', '{"x": 470, "y": 80, "width": 100, "height": 40}', '{"requires": ["badge"]}'),
  ('Main Entrance', 'public', 'level-1', '{"x": 80, "y": 305, "width": 80, "height": 30}', '{"requires": ["badge"]}')
ON CONFLICT DO NOTHING;

-- Insert mock CCTV cameras
INSERT INTO cctv_cameras (camera_id, zone_id, position, coverage_radius, status) VALUES
  ('CAM-001', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row A' LIMIT 1), '{"x": 180, "y": 55}', 60, 'operational'),
  ('CAM-002', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row B' LIMIT 1), '{"x": 180, "y": 115}', 60, 'operational'),
  ('CAM-003', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row C' LIMIT 1), '{"x": 180, "y": 175}', 60, 'operational'),
  ('CAM-004', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row D' LIMIT 1), '{"x": 180, "y": 235}', 60, 'operational'),
  ('CAM-005', (SELECT id FROM physical_zones WHERE zone_name = 'Power Distribution' LIMIT 1), '{"x": 395, "y": 200}', 50, 'operational'),
  ('CAM-006', (SELECT id FROM physical_zones WHERE zone_name = 'Main Entrance' LIMIT 1), '{"x": 120, "y": 290}', 70, 'operational'),
  ('CAM-007', (SELECT id FROM physical_zones WHERE zone_name = 'CRAC Room' LIMIT 1), '{"x": 285, "y": 165}', 45, 'operational'),
  ('CAM-008', (SELECT id FROM physical_zones WHERE zone_name = 'Network Operations Center' LIMIT 1), '{"x": 520, "y": 75}', 55, 'operational')
ON CONFLICT (camera_id) DO NOTHING;

-- Insert mock personnel tracking
INSERT INTO personnel_tracking (person_id, person_name, clearance_level, current_zone_id, position, badge_type, last_seen) VALUES
  ('EMP-001', 'John Smith', 'level-3', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row A' LIMIT 1), '{"x": 95, "y": 65}', 'employee', now() - interval '5 seconds'),
  ('EMP-002', 'Sarah Johnson', 'level-4', (SELECT id FROM physical_zones WHERE zone_name = 'Power Distribution' LIMIT 1), '{"x": 370, "y": 155}', 'employee', now() - interval '3 seconds'),
  ('CON-001', 'Mike Davis', 'level-2', (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row B' LIMIT 1), '{"x": 130, "y": 128}', 'contractor', now() - interval '8 seconds'),
  ('EMP-003', 'Emily Chen', 'level-2', (SELECT id FROM physical_zones WHERE zone_name = 'Network Operations Center' LIMIT 1), '{"x": 485, "y": 85}', 'employee', now() - interval '2 seconds'),
  ('VIS-001', 'Robert Brown', 'level-1', (SELECT id FROM physical_zones WHERE zone_name = 'Main Entrance' LIMIT 1), '{"x": 95, "y": 310}', 'visitor', now() - interval '1 second'),
  ('UNK-001', 'Unknown Person', 'level-1', (SELECT id FROM physical_zones WHERE zone_name = 'CRAC Room' LIMIT 1), '{"x": 265, "y": 195}', 'unknown', now() - interval '10 seconds')
ON CONFLICT DO NOTHING;

-- Insert mock security events
INSERT INTO physical_security_events (event_type, severity, zone_id, camera_id, person_id, description, position, status) VALUES
  ('unauthorized_access', 'critical', 
   (SELECT id FROM physical_zones WHERE zone_name = 'CRAC Room' LIMIT 1),
   (SELECT id FROM cctv_cameras WHERE camera_id = 'CAM-007' LIMIT 1),
   'UNK-001',
   'Unidentified person detected in restricted CRAC room without proper clearance',
   '{"x": 265, "y": 195}',
   'active'),
  ('loitering', 'medium',
   (SELECT id FROM physical_zones WHERE zone_name = 'Main Entrance' LIMIT 1),
   (SELECT id FROM cctv_cameras WHERE camera_id = 'CAM-006' LIMIT 1),
   'VIS-001',
   'Visitor loitering near main entrance for extended period',
   '{"x": 95, "y": 310}',
   'investigating'),
  ('tailgating', 'high',
   (SELECT id FROM physical_zones WHERE zone_name = 'Rack Row B' LIMIT 1),
   (SELECT id FROM cctv_cameras WHERE camera_id = 'CAM-002' LIMIT 1),
   'CON-001',
   'Possible tailgating detected - contractor followed another person through secured door',
   '{"x": 130, "y": 128}',
   'investigating')
ON CONFLICT DO NOTHING;
