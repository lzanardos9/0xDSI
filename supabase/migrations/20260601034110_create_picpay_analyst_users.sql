/*
  # Create PicPay analyst users

  1. New Users (3)
    - `ricardo.zandonai@picpay.com` - Ricardo Zandonai
    - `ricardo.abelardo@picpay.com` - Ricardo Abelardo
    - `felipe.huneida@picpay.com` - Felipe Huneida
  2. Role & Permissions
    - Role = 'analyst' (no admin access)
    - prohibited_actions: administration, databricks_notebooks, user_management, production_settings
  3. Security
    - TS/SCI clearance for full platform access
    - Passwords bcrypted, emails confirmed, MFA off for demo
*/

DO $$
DECLARE
  rec record;
  v_user_id uuid;
  users_data text[][] := ARRAY[
    ARRAY['ricardo.zandonai@picpay.com','Ricardo Zandonai','Rc@rd0-Z4nd0n@!-PicP#7qXw$2026'],
    ARRAY['ricardo.abelardo@picpay.com','Ricardo Abelardo','Rc@rd0-Ab3l4rd0-PicP#3mTz!2026'],
    ARRAY['felipe.huneida@picpay.com','Felipe Huneida','F3l!p3-Hun31d@-PicP#9kVb$2026']
  ];
  i int;
  v_email text;
  v_full_name text;
  v_password text;
  v_username text;
BEGIN
  FOR i IN 1..array_length(users_data,1) LOOP
    v_email := users_data[i][1];
    v_full_name := users_data[i][2];
    v_password := users_data[i][3];
    v_username := split_part(v_email,'@',1);

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
      UPDATE auth.users SET encrypted_password = crypt(v_password, gen_salt('bf')), updated_at = now() WHERE id = v_user_id;
    END IF;

    INSERT INTO public.user_profiles (
      id, user_id, username, full_name, email, department, title,
      clearance_level, security_clearance, clearance_compartments, need_to_know_categories,
      role, is_active, account_status, status, risk_score,
      max_concurrent_sessions, session_timeout_minutes, require_mfa,
      access_days_of_week, prohibited_actions,
      account_expires_at, password_expires_at,
      notes, created_at, updated_at
    ) VALUES (
      v_user_id, v_user_id::text, v_username, v_full_name, v_email,
      'PicPay', 'Security Analyst',
      'TS/SCI', 'sci',
      ARRAY['SI','TK','HCS','G','B'],
      ARRAY['all'],
      'analyst', true, 'active', 'active', 0,
      5, 480, false,
      ARRAY[0,1,2,3,4,5,6],
      ARRAY['administration','databricks_notebooks','user_management','production_settings'],
      now() + interval '5 years',
      now() + interval '1 year',
      'PicPay Analyst: no Administration, no Databricks Notebooks.', now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      role='analyst', is_active=true, account_status='active', status='active',
      clearance_level='TS/SCI', security_clearance='sci',
      clearance_compartments=EXCLUDED.clearance_compartments,
      need_to_know_categories=EXCLUDED.need_to_know_categories,
      prohibited_actions=EXCLUDED.prohibited_actions,
      require_mfa=false,
      updated_at=now();
  END LOOP;
END $$;