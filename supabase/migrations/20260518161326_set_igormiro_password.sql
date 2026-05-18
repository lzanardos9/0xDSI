/*
  # Set password for igormiro user

  1. Overview
    - Creates auth.users entry for existing igormiro profile
    - Links to profile id: 780dac08-865b-4877-9d33-5665062f7aa3
    - Sets login credentials
    
  2. Credentials
    - Username: igormiro
    - Email: igor@local
    - Password: IgorMiro2024!
    - Role: admin (existing)
*/

-- Create auth user linked to existing profile
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
  '780dac08-865b-4877-9d33-5665062f7aa3',
  'authenticated',
  'authenticated',
  'igor@local',
  crypt('IgorMiro2024!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"],"role":"admin"}',
  '{"username":"igormiro","full_name":"Igor Miro"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Update profile with username for login resolution
UPDATE user_profiles
SET username = 'igormiro',
    last_password_change = NOW(),
    password_expires_at = NOW() + INTERVAL '1 year'
WHERE id = '780dac08-865b-4877-9d33-5665062f7aa3';