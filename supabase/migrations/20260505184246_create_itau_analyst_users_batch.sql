/*
  # Create Itau/ZUP analyst users (no Admin, no Databricks Notebooks)

  1. New users (19 total)
    - Role = 'analyst' so Administration tab is hidden
    - prohibited_actions includes 'administration' and 'databricks_notebooks'
    - Each user gets a unique strong password
  2. Clearance
    - security_clearance='sci', clearance_level='TS/SCI'
    - full compartments and need-to-know
  3. Security
    - Passwords bcrypted via crypt()
    - Emails confirmed, accounts active, MFA off for demo
*/

DO $$
DECLARE
  rec record;
  v_user_id uuid;
  users_data text[][] := ARRAY[
    ARRAY['aline.amaro-silva@itau-unibanco.com.br','Aline Amaro-Silva','Al!ne-Am4ro#Itau-7fQz$2026'],
    ARRAY['amanda.guimaraes@itau-unibanco.com.br','Amanda Guimaraes','Am@nd4-Gu1m-Itau#9bKx!2026'],
    ARRAY['amanda.paixao@itau-unibanco.com.br','Amanda Paixao','Am@nd4-P@!x-Itau#3vRm$2026'],
    ARRAY['caio.prince-paiva@itau-unibanco.com.br','Caio Prince-Paiva','C@!o-Pr1nc3-Itau#5tYn!2026'],
    ARRAY['cleber-bernardino.silva@itau-unibanco.com.br','Cleber Bernardino Silva','Cl3b3r-B3rn-Itau#8mJw$2026'],
    ARRAY['davi.gardin@itau-unibanco.com.br','Davi Gardin','D@v!-G4rd1n-Itau#1pLk!2026'],
    ARRAY['deniwton.asato@itau-unibanco.com.br','Deniwton Asato','D3n!wt0n-As-Itau#4hGs$2026'],
    ARRAY['felipe.hiroaki-fujii@itau-unibanco.com.br','Felipe Hiroaki-Fujii','F3l!p3-H1r-Itau#6qWc!2026'],
    ARRAY['fernanda.silva-inacio@itau-unibanco.com.br','Fernanda Silva-Inacio','F3rn4nd4-S!-Itau#2xVb$2026'],
    ARRAY['flavio.gouvea@itau-unibanco.com.br','Flavio Gouvea','Fl@v10-G0uv-Itau#7nZd!2026'],
    ARRAY['greyce.lino@itau-unibanco.com.br','Greyce Lino','Gr3yc3-L!n0-Itau#0sFe$2026'],
    ARRAY['isabelli.ramalho@itau-unibanco.com.br','Isabelli Ramalho','!s4b3ll!-R@-Itau#3dHu!2026'],
    ARRAY['jose.elieldo-oliveira@mailer.com.br','Jose Elieldo Oliveira','J0s3-El13ld-ZUP#8kPr$2026'],
    ARRAY['matheus.silva-porto@itau-unibanco.com.br','Matheus Silva-Porto','M4th3us-S!-Itau#5cTq!2026'],
    ARRAY['mayra.valle@itau-unibanco.com.br','Mayra Valle','M@yr4-V4ll3-Itau#9jBo$2026'],
    ARRAY['paulo.batista-santos@itau-unibanco.com.br','Paulo Batista-Santos','P@ul0-B@t!s-Itau#4wEi!2026'],
    ARRAY['ricardo.santi@itau-unibanco.com.br','Ricardo Santi','R!c4rd0-S4n-Itau#6yMa$2026'],
    ARRAY['samanta.cristina-santos@itau-unibanco.com.br','Samanta Cristina Santos','S4m4nt@-Cr-Itau#1lUg!2026'],
    ARRAY['thais.goebel@itau-unibanco.com.br','Thais Goebel','Th@!s-G03b3l-Itau#7rXp$2026']
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
      CASE WHEN v_email LIKE '%mailer.com.br' THEN 'ZUP' ELSE 'Itau Unibanco' END,
      'Security Analyst',
      'TS/SCI', 'sci',
      ARRAY['SI','TK','HCS','G','B'],
      ARRAY['all'],
      'analyst', true, 'active', 'active', 0,
      5, 480, false,
      ARRAY[0,1,2,3,4,5,6],
      ARRAY['administration','databricks_notebooks','user_management','production_settings'],
      now() + interval '5 years',
      now() + interval '1 year',
      'Analyst: no Administration, no Databricks Notebooks.', now(), now()
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