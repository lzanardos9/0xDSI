/*
  # Create Cases/Ticket System

  1. New Tables
    - `cases` - Security incident case management
    - `case_comments` - Comments and updates on cases
    - `case_timeline` - Audit trail of all case activities

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated and anonymous users

  3. Functions
    - Auto-generate case numbers (CASE-YYYY-####)
    - Auto-update timestamps
*/

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'medium',
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL,
  assigned_to text,
  created_by text NOT NULL,
  resolution text,
  related_event_ids jsonb DEFAULT '[]'::jsonb,
  related_alert_ids jsonb DEFAULT '[]'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT valid_status CHECK (status IN ('new', 'investigating', 'contained', 'resolved', 'closed')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Case comments table
CREATE TABLE IF NOT EXISTS case_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author text NOT NULL,
  comment text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Case timeline table
CREATE TABLE IF NOT EXISTS case_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text NOT NULL,
  actor text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comments_case_id ON case_comments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON case_timeline(case_id);

-- Enable Row Level Security
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cases
CREATE POLICY "Allow all users to read cases"
  ON cases FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert cases"
  ON cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update cases"
  ON cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for case_comments
CREATE POLICY "Allow all users to read comments"
  ON case_comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert comments"
  ON case_comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for case_timeline
CREATE POLICY "Allow all users to read timeline"
  ON case_timeline FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert timeline events"
  ON case_timeline FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to generate case numbers
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_number text;
  year_prefix text;
  sequence_num int;
BEGIN
  year_prefix := 'CASE-' || TO_CHAR(NOW(), 'YYYY') || '-';
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM cases
  WHERE case_number LIKE year_prefix || '%';
  
  new_number := year_prefix || LPAD(sequence_num::text, 4, '0');
  
  RETURN new_number;
END;
$$;

-- Trigger to auto-generate case numbers
CREATE OR REPLACE FUNCTION set_case_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := generate_case_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_case_number ON cases;
CREATE TRIGGER trigger_set_case_number
  BEFORE INSERT ON cases
  FOR EACH ROW
  EXECUTE FUNCTION set_case_number();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_cases_timestamp ON cases;
CREATE TRIGGER trigger_update_cases_timestamp
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_cases_updated_at();
