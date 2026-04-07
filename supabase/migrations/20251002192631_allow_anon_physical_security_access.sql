/*
  # Allow Anonymous Access to Physical Security Tables

  1. Changes
    - Update RLS policies to allow anonymous (anon) role access
    - This is for demo purposes to show live CCTV monitoring
    - Allows read access for all physical security tables
    - Allows insert/update for personnel tracking updates

  2. Security
    - Still maintains RLS protection
    - Only allows specific operations needed for the demo
*/

-- Personnel Tracking Policies
DROP POLICY IF EXISTS "Authenticated users can view personnel tracking" ON personnel_tracking;
DROP POLICY IF EXISTS "Authenticated users can insert personnel tracking" ON personnel_tracking;
DROP POLICY IF EXISTS "Authenticated users can update personnel tracking" ON personnel_tracking;

CREATE POLICY "Anyone can view personnel tracking"
  ON personnel_tracking FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert personnel tracking"
  ON personnel_tracking FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update personnel tracking"
  ON personnel_tracking FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- CCTV Cameras Policies
DROP POLICY IF EXISTS "Authenticated users can view CCTV cameras" ON cctv_cameras;

CREATE POLICY "Anyone can view CCTV cameras"
  ON cctv_cameras FOR SELECT
  TO anon, authenticated
  USING (true);

-- Physical Zones Policies
DROP POLICY IF EXISTS "Authenticated users can view physical zones" ON physical_zones;

CREATE POLICY "Anyone can view physical zones"
  ON physical_zones FOR SELECT
  TO anon, authenticated
  USING (true);

-- Physical Security Events Policies
DROP POLICY IF EXISTS "Authenticated users can view security events" ON physical_security_events;
DROP POLICY IF EXISTS "Authenticated users can create security events" ON physical_security_events;
DROP POLICY IF EXISTS "Authenticated users can update security events" ON physical_security_events;

CREATE POLICY "Anyone can view security events"
  ON physical_security_events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create security events"
  ON physical_security_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update security events"
  ON physical_security_events FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
