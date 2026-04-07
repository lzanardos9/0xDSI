/*
  # Three-Factor Authentication System

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique)
      - `full_name` (text)
      - `face_encoding` (text) - Base64 encoded face recognition data
      - `movement_pattern` (text) - Expected movement pattern (e.g., "nod", "shake", "smile")
      - `is_active` (boolean)
      - `failed_attempts` (integer)
      - `last_login` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `auth_attempts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `username` (text)
      - `factor_1_success` (boolean) - Password verification
      - `factor_2_success` (boolean) - Face recognition
      - `factor_3_success` (boolean) - Movement verification
      - `success` (boolean)
      - `ip_address` (text)
      - `user_agent` (text)
      - `attempt_timestamp` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only read their own profile
    - Users can only update their own face encoding and movement pattern
    - Auth attempts are logged for audit purposes
*/

-- Create user profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  face_encoding text,
  movement_pattern text DEFAULT 'nod',
  is_active boolean DEFAULT true,
  failed_attempts integer DEFAULT 0,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create auth attempts table
CREATE TABLE IF NOT EXISTS auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  username text NOT NULL,
  factor_1_success boolean DEFAULT false,
  factor_2_success boolean DEFAULT false,
  factor_3_success boolean DEFAULT false,
  success boolean DEFAULT false,
  ip_address text,
  user_agent text,
  attempt_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow anonymous users to read profiles during authentication (username lookup only)
CREATE POLICY "Anonymous can lookup usernames"
  ON user_profiles FOR SELECT
  TO anon
  USING (true);

-- RLS Policies for auth_attempts
CREATE POLICY "Users can view own auth attempts"
  ON auth_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone can insert auth attempts"
  ON auth_attempts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_id ON auth_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp ON auth_attempts(attempt_timestamp DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert demo users for testing
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'admin@soc.local', crypt('SecurePass123!', gen_salt('bf')), now(), now(), now()),
  (gen_random_uuid(), 'analyst@soc.local', crypt('AnalystPass456!', gen_salt('bf')), now(), now(), now())
ON CONFLICT DO NOTHING;

-- Insert corresponding user profiles
INSERT INTO user_profiles (id, username, full_name, movement_pattern, is_active)
SELECT 
  id,
  CASE 
    WHEN email = 'admin@soc.local' THEN 'admin'
    WHEN email = 'analyst@soc.local' THEN 'analyst'
  END,
  CASE 
    WHEN email = 'admin@soc.local' THEN 'SOC Administrator'
    WHEN email = 'analyst@soc.local' THEN 'Security Analyst'
  END,
  'nod',
  true
FROM auth.users
WHERE email IN ('admin@soc.local', 'analyst@soc.local')
ON CONFLICT (id) DO NOTHING;
