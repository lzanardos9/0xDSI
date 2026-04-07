/*
  # Fix Demo User Authentication (Proper)

  1. Changes
    - Clear auth attempts to avoid foreign key constraints
    - Remove existing demo users
    - Properly create demo users with correct password hashing
  
  2. Demo Accounts
    - admin@soc.local / SecurePass123!
    - analyst@soc.local / AnalystPass456!
*/

-- Delete all auth attempts first
DELETE FROM auth_attempts WHERE username IN ('admin', 'analyst');

-- Delete existing demo users and their profiles
DELETE FROM user_profiles WHERE username IN ('admin', 'analyst');
DELETE FROM auth.users WHERE email IN ('admin@soc.local', 'analyst@soc.local');

-- Create demo users properly
DO $$
DECLARE
  admin_user_id uuid;
  analyst_user_id uuid;
BEGIN
  -- Create admin user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'admin@soc.local',
    crypt('SecurePass123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO admin_user_id;

  -- Create analyst user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'analyst@soc.local',
    crypt('AnalystPass456!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO analyst_user_id;

  -- Create corresponding user profiles
  INSERT INTO user_profiles (id, username, full_name, movement_pattern, is_active)
  VALUES 
    (admin_user_id, 'admin', 'SOC Administrator', 'nod', true),
    (analyst_user_id, 'analyst', 'Security Analyst', 'shake', true);
END $$;
