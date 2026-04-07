/*
  # Multi-Source Psychological Profiling System
  
  Expands psychological profiling to analyze data from multiple corporate sources:
  - Email communications
  - Slack messages
  - Microsoft Teams
  - Meeting recordings/transcripts
  - Calendar patterns
  - File access patterns
  
  1. New Tables
    - `communication_sources` - Tracks all communication channels per user
    - `email_behavioral_analysis` - Email communication patterns
    - `slack_behavioral_analysis` - Slack messaging analysis
    - `teams_behavioral_analysis` - Teams communication analysis
    - `meeting_behavioral_analysis` - Meeting participation and speech patterns
    - `cross_platform_behavioral_patterns` - Correlations across platforms
    - `psychological_profile_evidence` - Evidence supporting psychological assessments
  
  2. Analysis Dimensions
    - Communication frequency and timing
    - Tone and sentiment across platforms
    - Social network analysis
    - Stress and urgency markers
    - Deception indicators
    - Manipulation patterns
    - Leadership and influence
    - Collaboration vs isolation
*/

-- Communication Sources Table
CREATE TABLE IF NOT EXISTS communication_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  
  -- Source availability
  email_connected boolean DEFAULT false,
  slack_connected boolean DEFAULT false,
  teams_connected boolean DEFAULT false,
  zoom_connected boolean DEFAULT false,
  calendar_connected boolean DEFAULT false,
  file_system_connected boolean DEFAULT false,
  
  -- Data volume
  total_emails_analyzed integer DEFAULT 0,
  total_slack_messages_analyzed integer DEFAULT 0,
  total_teams_messages_analyzed integer DEFAULT 0,
  total_meetings_analyzed integer DEFAULT 0,
  
  -- Analysis period
  analysis_start_date timestamptz DEFAULT now() - interval '90 days',
  analysis_end_date timestamptz DEFAULT now(),
  last_synced_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now()
);

-- Email Behavioral Analysis
CREATE TABLE IF NOT EXISTS email_behavioral_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_id text NOT NULL,
  
  -- Email metadata
  timestamp timestamptz NOT NULL,
  is_sent boolean NOT NULL,
  recipients_count integer DEFAULT 0,
  subject_line text,
  word_count integer DEFAULT 0,
  
  -- Sentiment analysis
  sentiment_score numeric DEFAULT 0 CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  sentiment_label text CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
  emotional_tone text CHECK (emotional_tone IN ('professional', 'friendly', 'aggressive', 'passive_aggressive', 'anxious', 'urgent', 'frustrated')),
  
  -- Linguistic markers
  formality_score integer DEFAULT 50 CHECK (formality_score >= 0 AND formality_score <= 100),
  urgency_score integer DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  politeness_score integer DEFAULT 50 CHECK (politeness_score >= 0 AND politeness_score <= 100),
  
  -- Behavioral indicators
  contains_apology boolean DEFAULT false,
  contains_blame boolean DEFAULT false,
  contains_excuse boolean DEFAULT false,
  contains_threat boolean DEFAULT false,
  shows_defensiveness boolean DEFAULT false,
  shows_confidence boolean DEFAULT false,
  shows_uncertainty boolean DEFAULT false,
  
  -- Time patterns
  sent_after_hours boolean DEFAULT false,
  sent_weekend boolean DEFAULT false,
  response_time_minutes integer,
  
  -- Risk indicators
  contains_sensitive_data boolean DEFAULT false,
  forwarded_externally boolean DEFAULT false,
  unusual_recipients boolean DEFAULT false,
  
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Slack Behavioral Analysis
CREATE TABLE IF NOT EXISTS slack_behavioral_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  
  -- Message metadata
  timestamp timestamptz NOT NULL,
  channel_type text CHECK (channel_type IN ('public', 'private', 'dm', 'group_dm')),
  channel_name text,
  thread_participation boolean DEFAULT false,
  is_edit boolean DEFAULT false,
  is_delete boolean DEFAULT false,
  
  -- Content analysis
  message_length integer DEFAULT 0,
  emoji_count integer DEFAULT 0,
  mentions_count integer DEFAULT 0,
  uses_formal_language boolean DEFAULT false,
  uses_casual_language boolean DEFAULT false,
  
  -- Sentiment
  sentiment_score numeric DEFAULT 0 CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  dominant_emotion text,
  
  -- Behavioral patterns
  message_frequency_per_hour numeric DEFAULT 0,
  rapid_fire_messages boolean DEFAULT false,
  late_night_activity boolean DEFAULT false,
  responds_to_mentions boolean DEFAULT true,
  
  -- Social indicators
  isolation_score integer DEFAULT 0 CHECK (isolation_score >= 0 AND isolation_score <= 100),
  engagement_score integer DEFAULT 50 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  influence_score integer DEFAULT 0 CHECK (influence_score >= 0 AND influence_score <= 100),
  
  -- Risk markers
  shares_sensitive_info boolean DEFAULT false,
  confrontational_tone boolean DEFAULT false,
  bypasses_channels boolean DEFAULT false,
  
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Teams Behavioral Analysis
CREATE TABLE IF NOT EXISTS teams_behavioral_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id text NOT NULL,
  
  -- Message metadata
  timestamp timestamptz NOT NULL,
  channel_name text,
  is_private_chat boolean DEFAULT false,
  message_type text CHECK (message_type IN ('text', 'file_share', 'call', 'meeting_message')),
  
  -- Engagement patterns
  collaboration_score integer DEFAULT 50 CHECK (collaboration_score >= 0 AND collaboration_score <= 100),
  responsiveness_score integer DEFAULT 50 CHECK (responsiveness_score >= 0 AND responsiveness_score <= 100),
  
  -- Sentiment
  sentiment_score numeric DEFAULT 0 CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  professional_tone_score integer DEFAULT 50 CHECK (professional_tone_score >= 0 AND professional_tone_score <= 100),
  
  -- Behavioral markers
  shares_files_frequently boolean DEFAULT false,
  attends_meetings_regularly boolean DEFAULT true,
  participates_in_discussions boolean DEFAULT true,
  
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Meeting Behavioral Analysis
CREATE TABLE IF NOT EXISTS meeting_behavioral_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meeting_id text NOT NULL,
  
  -- Meeting metadata
  meeting_date timestamptz NOT NULL,
  meeting_duration_minutes integer DEFAULT 0,
  meeting_type text CHECK (meeting_type IN ('one_on_one', 'small_group', 'large_group', 'all_hands')),
  meeting_title text,
  
  -- Participation
  attended boolean DEFAULT true,
  arrived_late boolean DEFAULT false,
  left_early boolean DEFAULT false,
  spoke_duration_seconds integer DEFAULT 0,
  interruptions_count integer DEFAULT 0,
  
  -- Speech analysis (from transcripts/recordings)
  speech_pace text CHECK (speech_pace IN ('very_slow', 'slow', 'normal', 'fast', 'very_fast')),
  speech_clarity_score integer DEFAULT 50 CHECK (speech_clarity_score >= 0 AND speech_clarity_score <= 100),
  confidence_in_speech integer DEFAULT 50 CHECK (confidence_in_speech >= 0 AND confidence_in_speech <= 100),
  
  -- Emotional analysis from voice
  vocal_stress_detected boolean DEFAULT false,
  vocal_emotion text CHECK (vocal_emotion IN ('neutral', 'happy', 'sad', 'angry', 'anxious', 'frustrated', 'excited')),
  
  -- Sentiment from transcript
  sentiment_score numeric DEFAULT 0 CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  
  -- Behavioral indicators
  dominated_conversation boolean DEFAULT false,
  passive_participation boolean DEFAULT false,
  supportive_comments boolean DEFAULT false,
  critical_comments boolean DEFAULT false,
  asks_questions boolean DEFAULT false,
  provides_solutions boolean DEFAULT false,
  
  -- Collaboration markers
  team_player_score integer DEFAULT 50 CHECK (team_player_score >= 0 AND team_player_score <= 100),
  leadership_shown boolean DEFAULT false,
  conflict_created boolean DEFAULT false,
  
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Cross-Platform Behavioral Patterns
CREATE TABLE IF NOT EXISTS cross_platform_behavioral_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern_type text CHECK (pattern_type IN (
    'consistent_stress', 'escalating_frustration', 'social_withdrawal',
    'after_hours_activity', 'communication_style_shift', 'sentiment_decline',
    'isolation_pattern', 'conflict_pattern', 'deception_indicators',
    'burnout_pattern', 'disengagement', 'insider_threat_markers'
  )) NOT NULL,
  
  -- Pattern details
  pattern_name text NOT NULL,
  description text NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  confidence_level integer DEFAULT 0 CHECK (confidence_level >= 0 AND confidence_level <= 100),
  
  -- Evidence across platforms
  evidence_sources jsonb DEFAULT '{}'::jsonb,
  email_evidence_count integer DEFAULT 0,
  slack_evidence_count integer DEFAULT 0,
  teams_evidence_count integer DEFAULT 0,
  meetings_evidence_count integer DEFAULT 0,
  llm_evidence_count integer DEFAULT 0,
  
  -- Timeline
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  pattern_duration_days integer DEFAULT 0,
  trend text CHECK (trend IN ('improving', 'stable', 'worsening', 'rapidly_worsening')),
  
  -- Correlation metrics
  cross_platform_correlation_score numeric DEFAULT 0 CHECK (cross_platform_correlation_score >= 0 AND cross_platform_correlation_score <= 1),
  
  requires_intervention boolean DEFAULT false,
  flagged_for_hr boolean DEFAULT false,
  flagged_for_security boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Psychological Profile Evidence (links analysis to conclusions)
CREATE TABLE IF NOT EXISTS psychological_profile_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  psychological_profile_id uuid REFERENCES user_psychological_profiles(id),
  
  evidence_type text CHECK (evidence_type IN (
    'personality_trait', 'dark_triad', 'behavioral_risk',
    'emotional_state', 'communication_pattern', 'social_behavior'
  )) NOT NULL,
  
  trait_or_factor text NOT NULL,
  evidence_description text NOT NULL,
  
  -- Sources of evidence
  source_platforms text[] DEFAULT ARRAY[]::text[],
  email_references uuid[] DEFAULT ARRAY[]::uuid[],
  slack_references uuid[] DEFAULT ARRAY[]::uuid[],
  teams_references uuid[] DEFAULT ARRAY[]::uuid[],
  meeting_references uuid[] DEFAULT ARRAY[]::uuid[],
  llm_references uuid[] DEFAULT ARRAY[]::uuid[],
  
  -- Strength of evidence
  evidence_strength text CHECK (evidence_strength IN ('weak', 'moderate', 'strong', 'very_strong')) NOT NULL,
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  
  supporting_data jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comm_sources_user ON communication_sources(user_id);

CREATE INDEX IF NOT EXISTS idx_email_analysis_user ON email_behavioral_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_email_analysis_timestamp ON email_behavioral_analysis(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_email_analysis_sentiment ON email_behavioral_analysis(sentiment_score);

CREATE INDEX IF NOT EXISTS idx_slack_analysis_user ON slack_behavioral_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_analysis_timestamp ON slack_behavioral_analysis(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_teams_analysis_user ON teams_behavioral_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_analysis_timestamp ON teams_behavioral_analysis(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_analysis_user ON meeting_behavioral_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_analysis_date ON meeting_behavioral_analysis(meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_cross_platform_patterns_user ON cross_platform_behavioral_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_cross_platform_patterns_severity ON cross_platform_behavioral_patterns(severity);
CREATE INDEX IF NOT EXISTS idx_cross_platform_patterns_type ON cross_platform_behavioral_patterns(pattern_type);

CREATE INDEX IF NOT EXISTS idx_psych_evidence_user ON psychological_profile_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_psych_evidence_profile ON psychological_profile_evidence(psychological_profile_id);

-- Enable RLS
ALTER TABLE communication_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_behavioral_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_behavioral_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams_behavioral_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_behavioral_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_platform_behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychological_profile_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow anonymous access for demo)
CREATE POLICY "Allow anonymous read access to communication_sources"
  ON communication_sources FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to email_analysis"
  ON email_behavioral_analysis FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to slack_analysis"
  ON slack_behavioral_analysis FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to teams_analysis"
  ON teams_behavioral_analysis FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to meeting_analysis"
  ON meeting_behavioral_analysis FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to cross_platform_patterns"
  ON cross_platform_behavioral_patterns FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read access to psych_evidence"
  ON psychological_profile_evidence FOR SELECT TO anon USING (true);
