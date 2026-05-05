/*
  # Create JasonTrost admin user (v3 - match constraints)
*/
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := 'jasontrost@soc.local';
  v_password text := 'Tr0st!Falc0n-9f4K#Zephyr$Quasar-2026^vX';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
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
      jsonb_build_object('username','jasontrost','full_name','Jason Trost'),
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
    UPDATE auth.users SET encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() WHERE id = v_user_id;
  END IF;

  INSERT INTO public.user_profiles (
    id, user_id, username, full_name, email, department, title,
    clearance_level, security_clearance, clearance_compartments, need_to_know_categories,
    role, is_active, account_status, status, risk_score,
    max_concurrent_sessions, session_timeout_minutes, require_mfa,
    access_days_of_week, account_expires_at, password_expires_at,
    notes, created_at, updated_at
  ) VALUES (
    v_user_id, v_user_id::text, 'jasontrost', 'Jason Trost', v_email,
    'Executive', 'Principal Security Architect',
    'TS/SCI', 'sci',
    ARRAY['SI','TK','HCS','G','B'],
    ARRAY['all'],
    'admin', true, 'active', 'active', 0,
    10, 480, false,
    ARRAY[0,1,2,3,4,5,6],
    now() + interval '10 years',
    now() + interval '10 years',
    'Full admin view provisioned.', now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role='admin', is_active=true, account_status='active', status='active',
    clearance_level='TS/SCI', security_clearance='sci',
    clearance_compartments=EXCLUDED.clearance_compartments,
    need_to_know_categories=EXCLUDED.need_to_know_categories,
    require_mfa=false,
    updated_at=now();
END $$;