/*
  # Create three admin users with full access

  1. New Users
    - alan.silva@databricks.com (Alan Silva)
    - michael.tangredi@databricks.com (Michael Tangredi)
    - jesus.santos@ifood.com.br (Jesus Santos)
  2. Access
    - All three are provisioned as admin with TS/SCI clearance and full compartments
    - MFA disabled, 10-year expiration, active status
  3. Security
    - Passwords are bcrypted via pgcrypto's crypt()
    - Auth identities properly created to allow sign-in
*/

DO $$
DECLARE
  users jsonb := jsonb_build_array(
    jsonb_build_object('email','alan.silva@databricks.com','username','alan.silva','full_name','Alan Silva','password','Alv@n-Dbr!cks#9xQz4^Fjk2$Prismatic-2026'),
    jsonb_build_object('email','michael.tangredi@databricks.com','username','michael.tangredi','full_name','Michael Tangredi','password','M!ch@el-T@ngr3di#7bR8^Vertex$Nebula-2026'),
    jsonb_build_object('email','jesus.santos@ifood.com.br','username','jesus.santos','full_name','Jesus Santos','password','J3s@s-!F00d#5wP2^Cascade$Obsidian-2026')
  );
  u jsonb;
  v_user_id uuid;
  v_email text;
  v_password text;
  v_username text;
  v_full_name text;
BEGIN
  FOR u IN SELECT * FROM jsonb_array_elements(users)
  LOOP
    v_email := u->>'email';
    v_password := u->>'password';
    v_username := u->>'username';
    v_full_name := u->>'full_name';

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id,
        'authenticated', 'authenticated', v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_username, 'full_name', v_full_name),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email', v_user_id::text, now(), now(), now()
      );
    ELSE
      SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
      UPDATE auth.users
        SET encrypted_password = crypt(v_password, gen_salt('bf')),
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    INSERT INTO public.user_profiles (
      id, user_id, username, full_name, email, department, title,
      clearance_level, security_clearance, clearance_compartments, need_to_know_categories,
      role, is_active, account_status, status, risk_score,
      max_concurrent_sessions, session_timeout_minutes, require_mfa,
      access_days_of_week, account_expires_at, password_expires_at,
      notes, created_at, updated_at
    ) VALUES (
      v_user_id, v_user_id::text, v_username, v_full_name, v_email,
      'Executive', 'Principal Security Architect',
      'TS/SCI', 'sci',
      ARRAY['SI','TK','HCS','G','B'],
      ARRAY['all'],
      'admin', true, 'active', 'active', 0,
      10, 480, false,
      ARRAY[0,1,2,3,4,5,6],
      now() + interval '10 years',
      now() + interval '10 years',
      'Full admin access provisioned.', now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      role='admin', is_active=true, account_status='active', status='active',
      clearance_level='TS/SCI', security_clearance='sci',
      clearance_compartments=EXCLUDED.clearance_compartments,
      need_to_know_categories=EXCLUDED.need_to_know_categories,
      require_mfa=false,
      updated_at=now();
  END LOOP;
END $$;
