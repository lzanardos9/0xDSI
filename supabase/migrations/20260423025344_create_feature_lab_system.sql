/*
  # Create Feature Lab System

  A creative sandbox where users can "vibe code" new security/fraud features via prompts.
  The AI generates live HTML components that query real Supabase data.

  1. New Tables
    - `feature_lab_creations`
      - `id` (uuid, primary key)
      - `title` (text) - user-given or AI-generated title
      - `prompt` (text) - the user's original prompt
      - `generated_html` (text) - the full HTML/CSS/JS code generated
      - `category` (text) - auto-classified: dashboard, chart, monitor, tool, report
      - `tags` (jsonb) - searchable labels
      - `thumbnail_color` (text) - accent color for gallery card
      - `is_pinned` (boolean) - user can pin favorites
      - `view_count` (integer) - how many times opened
      - `created_by` (text) - username or session identifier
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - Authenticated and anon users can read all creations (shared gallery)
    - Authenticated users can create, update, and delete their own creations
    - Anon users can create (for demo purposes)
*/

CREATE TABLE IF NOT EXISTS feature_lab_creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  generated_html text NOT NULL,
  category text NOT NULL DEFAULT 'dashboard',
  tags jsonb DEFAULT '[]'::jsonb,
  thumbnail_color text DEFAULT '#06B6D4',
  is_pinned boolean DEFAULT false,
  view_count integer DEFAULT 0,
  created_by text DEFAULT 'anonymous',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE feature_lab_creations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature lab creations"
  ON feature_lab_creations FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can create feature lab items"
  ON feature_lab_creations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can create feature lab items for demo"
  ON feature_lab_creations FOR INSERT
  TO anon
  WITH CHECK (created_by = 'anonymous' OR created_by IS NOT NULL);

CREATE POLICY "Authenticated users can update own creations"
  ON feature_lab_creations FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete own creations"
  ON feature_lab_creations FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_feature_lab_created_at ON feature_lab_creations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_lab_category ON feature_lab_creations(category);
CREATE INDEX IF NOT EXISTS idx_feature_lab_pinned ON feature_lab_creations(is_pinned) WHERE is_pinned = true;
