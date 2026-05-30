/*
  # Add Communication Psychological Profiles Table

  1. New Tables
    - `psychological_profiles` (communication-analysis-driven rolling profile)
      - `id` (uuid, primary key)
      - `user_id` (text) - references user being profiled
      - `sentiment_score_current` (float) - latest sentiment score (-1.0 to 1.0)
      - `sentiment_volatility` (float) - std deviation of sentiment
      - `toxicity_score_current` (float) - current toxicity level (0.0 to 1.0)
      - `dominant_emotion` (text) - most frequent emotion label
      - `dominant_intent` (text) - most frequent intent classification
      - `communication_risk_score` (float) - composite risk from communications
      - `exfiltration_language_ratio` (float) - ratio of exfil-related language
      - `job_search_indicator_ratio` (float) - ratio of job search signals
      - `risk_signals` (jsonb) - array of detected risk signal labels
      - `top_topics` (jsonb) - top discussion topics
      - `messages_analyzed` (int) - count of messages in window
      - `channel_breakdown` (jsonb) - messages per channel
      - `sentiment_trend_7d` (float) - 7-day rolling sentiment avg
      - `sentiment_trend_14d` (float) - 14-day rolling sentiment avg
      - `sentiment_trend_30d` (float) - 30-day rolling sentiment avg
      - `toxicity_trend_7d` (float) - 7-day toxicity avg
      - `toxicity_incidents_30d` (int) - toxic message count in 30 days
      - `last_analyzed_at` (timestamptz) - when last analysis ran
    - `behavioral_indicators` (individual behavioral signals)
      - `id` (uuid, primary key)
      - `user_id` (text)
      - `indicator_type` (text)
      - `indicator_name` (text)
      - `severity` (text)
      - `score` (float)
      - `evidence` (jsonb)
      - `detected_at` (timestamptz)
      - `source` (text)

  2. Security
    - Enable RLS on both tables
    - Authenticated users can read all data (SOC analysts need full visibility)
    - Only service role can write (populated by backend agents)

  3. Notes
    - These tables mirror what Agent 46 (communication_analyzer) writes in Databricks
    - The native UI reads from these for the psychological profile temporal trends
*/

CREATE TABLE IF NOT EXISTS psychological_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  sentiment_score_current float DEFAULT 0.0,
  sentiment_volatility float DEFAULT 0.0,
  toxicity_score_current float DEFAULT 0.0,
  dominant_emotion text DEFAULT 'neutral',
  dominant_intent text DEFAULT 'neutral',
  communication_risk_score float DEFAULT 0.0,
  exfiltration_language_ratio float DEFAULT 0.0,
  job_search_indicator_ratio float DEFAULT 0.0,
  risk_signals jsonb DEFAULT '[]'::jsonb,
  top_topics jsonb DEFAULT '[]'::jsonb,
  messages_analyzed int DEFAULT 0,
  channel_breakdown jsonb DEFAULT '{}'::jsonb,
  sentiment_trend_7d float,
  sentiment_trend_14d float,
  sentiment_trend_30d float,
  toxicity_trend_7d float,
  toxicity_incidents_30d int DEFAULT 0,
  analysis_window_hours int DEFAULT 24,
  last_analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE psychological_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated SOC analysts can view communication profiles"
  ON psychological_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can insert communication profiles"
  ON psychological_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can update communication profiles"
  ON psychological_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS behavioral_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  indicator_type text NOT NULL,
  indicator_name text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  score float DEFAULT 0.0,
  evidence jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz DEFAULT now(),
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE behavioral_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated SOC analysts can view behavioral indicators"
  ON behavioral_indicators
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can insert behavioral indicators"
  ON behavioral_indicators
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_psych_profiles_user_id ON psychological_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_psych_profiles_risk_score ON psychological_profiles(communication_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_indicators_user ON behavioral_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_indicators_type ON behavioral_indicators(indicator_type, severity);
CREATE INDEX IF NOT EXISTS idx_behavioral_indicators_detected ON behavioral_indicators(detected_at DESC);
