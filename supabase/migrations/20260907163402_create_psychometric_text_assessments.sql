/*
# Psychometric Text Assessments

Stores ad-hoc psycholinguistic assessments produced by analyzing pasted
communication text (call transcripts, emails, Slack/Teams messages, SMS, etc.)
against the Big Five (OCEAN) traits and the Dark Triad, plus behavioral
indicators and an overall risk score. Used by the User Behavior "Assessment Lab"
tab to test the internal psycholinguistic model on arbitrary text.

1. New Tables
- `psychometric_text_assessments`
- `id` (uuid, primary key)
- `subject_label` (text) - optional name/identifier of the person the text is about
- `source_channel` (text) - origin of the text: email, slack, teams, sms, call_transcript, other
- `input_text` (text) - the raw text that was analyzed
- `input_char_count` (int) - length of the analyzed text
- Big Five scores (int, 0-100): `openness`, `conscientiousness`, `extraversion`, `agreeableness`, `neuroticism`
- Dark Triad scores (int, 0-100): `narcissism`, `machiavellianism`, `psychopathy`
- Behavioral scores (int, 0-100): `manipulation`, `deception`, `impulsivity`, `aggression`
- `overall_risk_score` (int, 0-100) - combined psychological risk
- `risk_classification` (text) - low / moderate / elevated / high / critical
- `dominant_emotion` (text) - primary detected emotional tone
- `communication_style` (text) - short descriptor of the communication style
- `summary` (text) - narrative assessment
- `key_indicators` (jsonb) - array of notable linguistic/behavioral signals
- `confidence_score` (int, 0-100) - model confidence in the assessment
- `model_version` (text) - internal model identifier
- `created_at` (timestamptz) - when the assessment was run

2. Security
- Enable RLS on `psychometric_text_assessments`.
- This is an internal, shared SOC tool with no per-user ownership, so allow
  anon + authenticated CRUD (data is intentionally shared within the platform).

3. Indexes
- Index on `created_at` for recent-first listing.
- Index on `subject_label` for filtering by subject.
*/

CREATE TABLE IF NOT EXISTS psychometric_text_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_label text DEFAULT '',
  source_channel text NOT NULL DEFAULT 'other',
  input_text text NOT NULL DEFAULT '',
  input_char_count int NOT NULL DEFAULT 0,
  openness int NOT NULL DEFAULT 0,
  conscientiousness int NOT NULL DEFAULT 0,
  extraversion int NOT NULL DEFAULT 0,
  agreeableness int NOT NULL DEFAULT 0,
  neuroticism int NOT NULL DEFAULT 0,
  narcissism int NOT NULL DEFAULT 0,
  machiavellianism int NOT NULL DEFAULT 0,
  psychopathy int NOT NULL DEFAULT 0,
  manipulation int NOT NULL DEFAULT 0,
  deception int NOT NULL DEFAULT 0,
  impulsivity int NOT NULL DEFAULT 0,
  aggression int NOT NULL DEFAULT 0,
  overall_risk_score int NOT NULL DEFAULT 0,
  risk_classification text NOT NULL DEFAULT 'low',
  dominant_emotion text DEFAULT '',
  communication_style text DEFAULT '',
  summary text DEFAULT '',
  key_indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score int NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE psychometric_text_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_psychometric_text_assessments" ON psychometric_text_assessments;
CREATE POLICY "anon_select_psychometric_text_assessments" ON psychometric_text_assessments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_psychometric_text_assessments" ON psychometric_text_assessments;
CREATE POLICY "anon_insert_psychometric_text_assessments" ON psychometric_text_assessments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_psychometric_text_assessments" ON psychometric_text_assessments;
CREATE POLICY "anon_update_psychometric_text_assessments" ON psychometric_text_assessments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_psychometric_text_assessments" ON psychometric_text_assessments;
CREATE POLICY "anon_delete_psychometric_text_assessments" ON psychometric_text_assessments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_psychometric_text_assessments_created_at
  ON psychometric_text_assessments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_psychometric_text_assessments_subject
  ON psychometric_text_assessments (subject_label);
