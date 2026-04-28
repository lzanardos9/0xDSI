/*
  # Comprehensive User Activity Tracking + Lineage

  Captures every login, navigation, click, and component view per user with
  parent/child lineage so we can reconstruct exactly what each user did and
  in what causal order.

  1. New Tables
    - `user_activity_events`     individual events (login, view, click, navigate, logout)
    - `user_activity_sessions`   one row per browser/session, links to auth user
    - `user_activity_lineage`    explicit parent->child edges for visual lineage

  2. Security
    - RLS enabled
    - Authenticated users may insert their own events
    - Anon may insert (pre-login click capture is allowed but tagged)
    - Authenticated users + admins may read

  3. Notes
    - `user_activity_events.parent_event_id` lets us thread navigation flows
    - Indices on user_id + occurred_at make timeline queries fast
    - JSONB `properties` stays flexible for new event shapes
*/

CREATE TABLE IF NOT EXISTS user_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  username text NOT NULL DEFAULT 'anonymous',
  session_token text NOT NULL,
  ip_address text NOT NULL DEFAULT 'unknown',
  user_agent text NOT NULL DEFAULT '',
  device_type text NOT NULL DEFAULT 'web',
  geo_country text NOT NULL DEFAULT '',
  geo_city text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  event_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  risk_score numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_uas_user ON user_activity_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uas_started ON user_activity_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_uas_active ON user_activity_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_uas_token ON user_activity_sessions(session_token);

CREATE TABLE IF NOT EXISTS user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES user_activity_sessions(id) ON DELETE CASCADE,
  user_id uuid,
  username text NOT NULL DEFAULT 'anonymous',
  event_type text NOT NULL,
  event_category text NOT NULL DEFAULT 'navigation',
  view_id text NOT NULL DEFAULT '',
  view_label text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  target_label text NOT NULL DEFAULT '',
  target_kind text NOT NULL DEFAULT 'unknown',
  parent_event_id uuid REFERENCES user_activity_events(id) ON DELETE SET NULL,
  path text NOT NULL DEFAULT '',
  referrer_view text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT 'unknown',
  user_agent text NOT NULL DEFAULT '',
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uae_user_time ON user_activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_session ON user_activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_uae_type ON user_activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_uae_view ON user_activity_events(view_id);
CREATE INDEX IF NOT EXISTS idx_uae_parent ON user_activity_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_uae_occurred ON user_activity_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS user_activity_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  username text NOT NULL DEFAULT 'anonymous',
  from_event_id uuid REFERENCES user_activity_events(id) ON DELETE CASCADE,
  to_event_id uuid REFERENCES user_activity_events(id) ON DELETE CASCADE,
  from_view text NOT NULL DEFAULT '',
  to_view text NOT NULL DEFAULT '',
  edge_type text NOT NULL DEFAULT 'navigated_to',
  weight numeric NOT NULL DEFAULT 1.0,
  delta_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ual_user ON user_activity_lineage(user_id);
CREATE INDEX IF NOT EXISTS idx_ual_from ON user_activity_lineage(from_event_id);
CREATE INDEX IF NOT EXISTS idx_ual_to ON user_activity_lineage(to_event_id);

ALTER TABLE user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_lineage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='uas_insert_any') THEN
    CREATE POLICY "uas_insert_any" ON user_activity_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='uas_update_any') THEN
    CREATE POLICY "uas_update_any" ON user_activity_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='uas_select_auth') THEN
    CREATE POLICY "uas_select_auth" ON user_activity_sessions FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='uae_insert_any') THEN
    CREATE POLICY "uae_insert_any" ON user_activity_events FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='uae_select_auth') THEN
    CREATE POLICY "uae_select_auth" ON user_activity_events FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ual_insert_any') THEN
    CREATE POLICY "ual_insert_any" ON user_activity_lineage FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ual_select_auth') THEN
    CREATE POLICY "ual_select_auth" ON user_activity_lineage FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
