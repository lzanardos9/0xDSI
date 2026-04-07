/*
  # Fix User Profiles - Add Authentication Columns
  
  Adds authentication columns back to user_profiles table that were lost
  when the behavior tracking system was created.
*/

-- Add missing authentication columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS face_encoding text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS movement_pattern text DEFAULT 'nod';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS failed_attempts integer DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_login timestamptz;

-- Insert/update authentication user profiles for the demo users
INSERT INTO user_profiles (id, user_id, username, full_name, email, movement_pattern, is_active, department, title)
VALUES 
  (
    (SELECT id FROM auth.users WHERE email = 'admin@soc.local'),
    'admin',
    'admin',
    'SOC Administrator',
    'admin@soc.local',
    'nod',
    true,
    'Security Operations',
    'Administrator'
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'analyst@soc.local'),
    'analyst',
    'analyst', 
    'Security Analyst',
    'analyst@soc.local',
    'shake',
    true,
    'Security Operations',
    'Analyst'
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'lz@soc.local'),
    'lz',
    'lz',
    'Luiz Zanardo',
    'lz@soc.local',
    'smile',
    true,
    'Engineering',
    'Chief Security Officer'
  )
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  movement_pattern = EXCLUDED.movement_pattern,
  is_active = EXCLUDED.is_active,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  department = EXCLUDED.department,
  title = EXCLUDED.title;

-- Create index on username if not exists
CREATE INDEX IF NOT EXISTS idx_user_profiles_username_auth ON user_profiles(username) WHERE username IS NOT NULL;