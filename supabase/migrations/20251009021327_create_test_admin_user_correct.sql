/*
  # Create Test Admin User

  1. Overview
    - Creates a test admin user with username "test"
    - Password: T3$tAdm1n!2024#SecureP@ss
    - Full admin access with highest security clearance
    
  2. User Details
    - Username: test
    - Email: test@admin.local
    - Role: admin
    - Clearance: sci (highest level)
    - Status: active
*/

-- First, check if user already exists and delete if present
DELETE FROM user_profiles WHERE username = 'test' OR email = 'test@admin.local';

-- Insert the test admin user
INSERT INTO user_profiles (
  user_id,
  username,
  email,
  full_name,
  role,
  department,
  title,
  security_clearance,
  clearance_level,
  clearance_compartments,
  need_to_know_categories,
  account_status,
  is_active,
  status,
  require_mfa,
  max_concurrent_sessions,
  session_timeout_minutes,
  access_days_of_week,
  risk_score,
  failed_attempts,
  account_approved_at,
  last_login,
  last_password_change,
  password_expires_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'test',
  'test@admin.local',
  'Test Administrator',
  'admin',
  'Security Operations',
  'Chief Security Officer',
  'sci',
  'top_secret',
  ARRAY['SCI', 'SAP', 'NATO', 'FVEY']::text[],
  ARRAY['all']::text[],
  'active',
  true,
  'active',
  false,
  10,
  480,
  ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[],
  0.0,
  0,
  NOW(),
  NOW(),
  NOW(),
  NOW() + INTERVAL '90 days',
  NOW(),
  NOW()
);

-- Store the password in a separate table for demo purposes
DO $$
DECLARE
  test_user_id uuid;
BEGIN
  SELECT id INTO test_user_id FROM user_profiles WHERE username = 'test' LIMIT 1;
  
  CREATE TABLE IF NOT EXISTS demo_passwords (
    user_profile_id uuid PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
    username text NOT NULL,
    password_hash text NOT NULL,
    plain_password text NOT NULL,
    created_at timestamptz DEFAULT NOW()
  );
  
  ALTER TABLE demo_passwords ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "Allow all access to demo passwords" ON demo_passwords;
  
  CREATE POLICY "Allow all access to demo passwords"
    ON demo_passwords FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
  
  INSERT INTO demo_passwords (user_profile_id, username, password_hash, plain_password)
  VALUES (
    test_user_id,
    'test',
    '$2a$10$rJ9YPE5xKZHKZ0qKZ0qKZeH8F0H8F0H8F0H8F0H8F0H8F0H8F0H8F',
    'T3$tAdm1n!2024#SecureP@ss'
  )
  ON CONFLICT (user_profile_id) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      plain_password = EXCLUDED.plain_password;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Admin User Created Successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Username: test';
  RAISE NOTICE 'Password: T3$tAdm1n!2024#SecureP@ss';
  RAISE NOTICE 'Email: test@admin.local';
  RAISE NOTICE 'Role: admin';
  RAISE NOTICE 'Clearance: SCI (highest)';
  RAISE NOTICE '========================================';
  
END $$;
