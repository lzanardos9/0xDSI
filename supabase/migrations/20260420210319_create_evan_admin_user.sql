/*
  # Create Evan Admin User

  1. Overview
    - Creates a new admin user: evan
    - Email: evan@soc.local
    - Password: ev4nth4m4n
    - Full admin privileges with top secret clearance

  2. Tables Modified
    - `auth.users` - new authentication entry
    - `user_profiles` - new profile with admin role
*/

DO $$
DECLARE
  evan_auth_id uuid;
BEGIN
  -- Only create if not already exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'evan@soc.local') THEN
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
      'evan@soc.local',
      crypt('ev4nth4m4n', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"],"role":"admin"}',
      '{"username":"evan","full_name":"Evan"}',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO evan_auth_id;

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
      evan_auth_id,
      'evan',
      'evan',
      'evan@soc.local',
      'Evan',
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
  END IF;
END $$;