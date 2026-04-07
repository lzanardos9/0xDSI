/*
  # Create Sessions Table

  1. New Table
    - `sessions` - User session tracking
      - `id` (uuid, primary key) - Unique session identifier
      - `user_id` (text) - User identifier
      - `source_ip` (text) - Source IP address
      - `start_time` (timestamptz) - Session start time
      - `end_time` (timestamptz) - Session end time
      - `event_count` (integer) - Number of events in session
      - `risk_score` (numeric) - Calculated risk score
      - `status` (text) - Session status (active, suspicious, closed)
      - `device_info` (jsonb) - Device information
      - `location` (text) - Geographic location
      - `created_at` (timestamptz) - Record creation time
      - `updated_at` (timestamptz) - Record update time

  2. Security
    - Enable RLS on sessions table
    - Add policies for authenticated users

  3. Indexes
    - Optimize for time-based queries and status filtering
*/

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source_ip text NOT NULL,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  event_count integer DEFAULT 0,
  risk_score numeric(5,2) DEFAULT 0,
  status text DEFAULT 'active',
  device_info jsonb DEFAULT '{}'::jsonb,
  location text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_session_status CHECK (status IN ('active', 'suspicious', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source_ip ON sessions(source_ip);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_risk_score ON sessions(risk_score DESC);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert sessions"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_timestamp();

-- Insert sample session data
INSERT INTO sessions (user_id, source_ip, start_time, end_time, event_count, risk_score, status, location)
SELECT
  CASE (random() * 5)::int 
    WHEN 0 THEN 'admin'
    WHEN 1 THEN 'analyst'
    WHEN 2 THEN 'jdoe'
    WHEN 3 THEN 'msmith'
    ELSE 'acooper'
  END,
  CASE (random() * 5)::int
    WHEN 0 THEN '192.168.1.' || (random() * 255)::int
    WHEN 1 THEN '10.0.2.' || (random() * 255)::int
    WHEN 2 THEN '172.16.0.' || (random() * 255)::int
    WHEN 3 THEN '203.0.113.' || (random() * 255)::int
    ELSE '198.51.100.' || (random() * 255)::int
  END,
  now() - (random() * interval '7 days'),
  CASE WHEN random() > 0.4 THEN now() - (random() * interval '6 days') ELSE NULL END,
  (random() * 500)::int,
  (random() * 100)::numeric(5,2),
  CASE (random() * 10)::int
    WHEN 0 THEN 'suspicious'
    WHEN 1 THEN 'closed'
    WHEN 2 THEN 'closed'
    WHEN 3 THEN 'closed'
    ELSE 'active'
  END,
  CASE (random() * 4)::int
    WHEN 0 THEN 'New York, USA'
    WHEN 1 THEN 'London, UK'
    WHEN 2 THEN 'Tokyo, Japan'
    ELSE 'San Francisco, USA'
  END
FROM generate_series(1, 100);
