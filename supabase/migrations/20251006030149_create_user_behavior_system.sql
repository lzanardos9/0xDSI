/*
  # User Behavior Tracking System

  1. New Tables
    - `user_profiles` - User profile information
    - `user_behavior_events` - Physical and logical events
    - `user_risk_assessments` - Risk scoring
    - `behavior_correlations` - Event correlations

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated and anon users

  3. Indexes
    - Add indexes for performance
*/

-- User Profiles Table
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text,
  department text,
  title text,
  clearance_level text DEFAULT 'standard',
  profile_picture_url text,
  risk_score numeric DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  behavior_baseline jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'investigation')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User Behavior Events Table
CREATE TABLE user_behavior_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_category text NOT NULL CHECK (event_category IN ('physical', 'logical', 'hybrid')),
  timestamp timestamptz DEFAULT now(),
  location text,
  device text,
  ip_address text,
  action text,
  resource_accessed text,
  outcome text CHECK (outcome IN ('success', 'failed', 'denied')),
  anomaly_score numeric DEFAULT 0 CHECK (anomaly_score >= 0 AND anomaly_score <= 100),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- User Risk Assessments Table
CREATE TABLE user_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  assessment_time timestamptz DEFAULT now(),
  risk_score numeric CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors jsonb DEFAULT '[]'::jsonb,
  correlated_events uuid[] DEFAULT ARRAY[]::uuid[],
  recommendations jsonb DEFAULT '[]'::jsonb,
  auto_generated boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Behavior Correlations Table
CREATE TABLE behavior_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  correlation_type text NOT NULL,
  physical_event_id uuid,
  logical_event_id uuid,
  correlation_score numeric CHECK (correlation_score >= 0 AND correlation_score <= 100),
  description text,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_risk_score ON user_profiles(risk_score);
CREATE INDEX idx_user_profiles_status ON user_profiles(status);
CREATE INDEX idx_user_behavior_events_user_profile_id ON user_behavior_events(user_profile_id);
CREATE INDEX idx_user_behavior_events_timestamp ON user_behavior_events(timestamp DESC);
CREATE INDEX idx_user_behavior_events_event_type ON user_behavior_events(event_type);
CREATE INDEX idx_user_behavior_events_category ON user_behavior_events(event_category);
CREATE INDEX idx_user_risk_assessments_user_profile_id ON user_risk_assessments(user_profile_id);
CREATE INDEX idx_user_risk_assessments_risk_level ON user_risk_assessments(risk_level);
CREATE INDEX idx_behavior_correlations_user_profile_id ON behavior_correlations(user_profile_id);
CREATE INDEX idx_behavior_correlations_severity ON behavior_correlations(severity);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_correlations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Auth users can view profiles" ON user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert profiles" ON user_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update profiles" ON user_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can view events" ON user_behavior_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert events" ON user_behavior_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can view assessments" ON user_risk_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert assessments" ON user_risk_assessments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can view correlations" ON behavior_correlations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert correlations" ON behavior_correlations FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for anon users (demo)
CREATE POLICY "Anon can view profiles" ON user_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view events" ON user_behavior_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view assessments" ON user_risk_assessments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can view correlations" ON behavior_correlations FOR SELECT TO anon USING (true);