/*
  # Fix Test User Authentication v2
  
  1. Overview
    - Creates actual Supabase auth.users entry for test user
    - Links it to existing user_profiles entry
    - Ensures test user can authenticate properly
    
  2. User Details
    - Username: test
    - Email: test@soc.local
    - Password: T3$tAdm1n!2024#SecureP@ss
*/

-- Create the auth user for test account
DO $$
DECLARE
  test_user_id uuid;
  test_profile_id uuid;
BEGIN
  -- Get the existing profile ID
  SELECT id INTO test_profile_id FROM user_profiles WHERE username = 'test' LIMIT 1;
  
  -- Create auth user if doesn't exist
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud
  )
  SELECT
    COALESCE(test_profile_id, gen_random_uuid()),
    '00000000-0000-0000-0000-000000000000',
    'test@soc.local',
    crypt('T3$tAdm1n!2024#SecureP@ss', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"test"}'::jsonb,
    false,
    'authenticated',
    'authenticated'
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'test@soc.local'
  )
  RETURNING id INTO test_user_id;
  
  -- Update user_profiles with the auth user_id if needed
  IF test_user_id IS NOT NULL THEN
    UPDATE user_profiles 
    SET user_id = test_user_id 
    WHERE username = 'test';
    
    -- Also create identity record with provider_id
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      test_user_id,
      jsonb_build_object('sub', test_user_id::text, 'email', 'test@soc.local'),
      'email',
      test_user_id::text,
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Test user created successfully';
    RAISE NOTICE 'Email: test@soc.local';
    RAISE NOTICE 'Password: T3$tAdm1n!2024#SecureP@ss';
    RAISE NOTICE '========================================';
  ELSE
    RAISE NOTICE 'Test user already exists in auth.users';
  END IF;
  
END $$;
