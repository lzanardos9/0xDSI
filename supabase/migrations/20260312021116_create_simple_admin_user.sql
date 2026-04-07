/*
  # Create Simple Admin User

  1. Overview
    - Creates admin user with username "admin"
    - Password: admin123
    - Full admin access
    
  2. User Details
    - Username: admin
    - Email: admin@admin.local
    - Password: admin123
    - Role: admin
    - Status: active
*/

-- First, clean up any existing admin user
DELETE FROM user_profiles WHERE username = 'admin' OR email = 'admin@admin.local';
DELETE FROM auth.users WHERE email = 'admin@admin.local';

-- Create auth user
DO $$
DECLARE
  admin_auth_id uuid;
BEGIN
  -- Insert into auth.users
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
    'admin@admin.local',
    crypt('admin123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"],"role":"admin"}',
    '{"username":"admin","full_name":"Administrator"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO admin_auth_id;
  
  -- Create user profile
  INSERT INTO user_profiles (
    id,
    user_id,
    username,
    email,
    full_name,
    role,
    department,
    title,
    security_clearance,
    clearance_level,
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
    admin_auth_id,
    'admin',
    'admin',
    'admin@admin.local',
    'Administrator',
    'admin',
    'Security Operations',
    'System Administrator',
    'sci',
    'top_secret',
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
    NOW() + INTERVAL '1 year',
    NOW(),
    NOW()
  );
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Simple Admin User Created';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Username: admin';
  RAISE NOTICE 'Password: admin123';
  RAISE NOTICE 'Email: admin@admin.local';
  RAISE NOTICE '========================================';
  
END $$;
