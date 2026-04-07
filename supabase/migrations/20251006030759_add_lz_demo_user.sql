/*
  # Add LZ Demo User
  
  Creates the lz@soc.local user with proper authentication
*/

-- Add lz user with password
DO $$
DECLARE
  lz_user_id uuid;
  existing_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO existing_user_id FROM auth.users WHERE email = 'lz@soc.local';
  
  IF existing_user_id IS NULL THEN
    -- Create lz user
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
      'lz@soc.local',
      crypt('LuizPass789!', gen_salt('bf')),
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
    RETURNING id INTO lz_user_id;
    
    -- Create/update user profile
    INSERT INTO user_profiles (id, user_id, username, full_name, email, movement_pattern, is_active, department, title)
    VALUES (lz_user_id, 'lz', 'lz', 'Luiz Zanardo', 'lz@soc.local', 'smile', true, 'Engineering', 'Chief Security Officer')
    ON CONFLICT (id) DO UPDATE SET
      username = 'lz',
      movement_pattern = 'smile',
      is_active = true;
  ELSE
    -- User exists, just update password
    UPDATE auth.users 
    SET encrypted_password = crypt('LuizPass789!', gen_salt('bf'))
    WHERE email = 'lz@soc.local';
    
    -- Update user profile
    UPDATE user_profiles
    SET username = 'lz',
        movement_pattern = 'smile',
        is_active = true
    WHERE id = existing_user_id;
  END IF;
END $$;