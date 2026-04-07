/*
  # Psychological Profiling System for LLM Users

  1. New Tables
    - `user_psychological_profiles`
      - Comprehensive psychological assessment based on LLM interactions
      - Personality traits, behavioral patterns, risk indicators
      - Linguistic analysis, emotional states, manipulation tendencies
    
    - `psychological_risk_factors`
      - Specific psychological risk indicators per user
      - Threat indicators, concerning behaviors, escalation triggers
    
    - `interaction_linguistic_analysis`
      - Per-interaction linguistic and psychological markers
      - Sentiment, tone, urgency, deception indicators

  2. Psychological Dimensions Tracked
    - Big Five personality traits (OCEAN model)
    - Dark Triad traits (narcissism, Machiavellianism, psychopathy)
    - Insider threat indicators
    - Stress and burnout markers
    - Aggression and hostility levels
    - Impulse control and risk-taking
    - Social engineering susceptibility
    - Manipulation and deception tendencies
*/

-- User Psychological Profiles Table
CREATE TABLE IF NOT EXISTS user_psychological_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  llm_profile_id uuid REFERENCES llm_risk_profiles(id),
  
  -- Personality Assessment (Big Five - OCEAN)
  openness_score integer DEFAULT 50 CHECK (openness_score >= 0 AND openness_score <= 100),
  conscientiousness_score integer DEFAULT 50 CHECK (conscientiousness_score >= 0 AND conscientiousness_score <= 100),
  extraversion_score integer DEFAULT 50 CHECK (extraversion_score >= 0 AND extraversion_score <= 100),
  agreeableness_score integer DEFAULT 50 CHECK (agreeableness_score >= 0 AND agreeableness_score <= 100),
  neuroticism_score integer DEFAULT 50 CHECK (neuroticism_score >= 0 AND neuroticism_score <= 100),
  
  -- Dark Triad Assessment
  narcissism_score integer DEFAULT 0 CHECK (narcissism_score >= 0 AND narcissism_score <= 100),
  machiavellianism_score integer DEFAULT 0 CHECK (machiavellianism_score >= 0 AND machiavellianism_score <= 100),
  psychopathy_score integer DEFAULT 0 CHECK (psychopathy_score >= 0 AND psychopathy_score <= 100),
  
  -- Behavioral Risk Indicators
  insider_threat_score integer DEFAULT 0 CHECK (insider_threat_score >= 0 AND insider_threat_score <= 100),
  manipulation_tendency_score integer DEFAULT 0 CHECK (manipulation_tendency_score >= 0 AND manipulation_tendency_score <= 100),
  impulsivity_score integer DEFAULT 0 CHECK (impulsivity_score >= 0 AND impulsivity_score <= 100),
  aggression_score integer DEFAULT 0 CHECK (aggression_score >= 0 AND aggression_score <= 100),
  deception_likelihood_score integer DEFAULT 0 CHECK (deception_likelihood_score >= 0 AND deception_likelihood_score <= 100),
  
  -- Emotional & Mental State
  stress_level integer DEFAULT 0 CHECK (stress_level >= 0 AND stress_level <= 100),
  burnout_risk integer DEFAULT 0 CHECK (burnout_risk >= 0 AND burnout_risk <= 100),
  emotional_stability integer DEFAULT 50 CHECK (emotional_stability >= 0 AND emotional_stability <= 100),
  frustration_level integer DEFAULT 0 CHECK (frustration_level >= 0 AND frustration_level <= 100),
  
  -- Communication Patterns
  writing_urgency_level text CHECK (writing_urgency_level IN ('low', 'normal', 'high', 'critical')) DEFAULT 'normal',
  communication_style text CHECK (communication_style IN ('professional', 'casual', 'aggressive', 'manipulative', 'deceptive')) DEFAULT 'professional',
  linguistic_complexity text CHECK (linguistic_complexity IN ('simple', 'moderate', 'complex', 'obfuscated')) DEFAULT 'moderate',
  
  -- Risk Assessment
  overall_psychological_risk_score integer DEFAULT 0 CHECK (overall_psychological_risk_score >= 0 AND overall_psychological_risk_score <= 100),
  risk_classification text CHECK (risk_classification IN ('minimal', 'low', 'moderate', 'elevated', 'high', 'critical')) DEFAULT 'low',
  
  -- Specific Threats
  is_potential_insider_threat boolean DEFAULT false,
  is_social_engineering_risk boolean DEFAULT false,
  is_data_theft_risk boolean DEFAULT false,
  shows_sabotage_indicators boolean DEFAULT false,
  shows_espionage_indicators boolean DEFAULT false,
  
  -- Behavioral Patterns
  typical_prompt_length_avg integer DEFAULT 0,
  uses_technical_jargon boolean DEFAULT false,
  attempts_system_manipulation boolean DEFAULT false,
  shows_boundary_testing boolean DEFAULT false,
  exhibits_urgency_patterns boolean DEFAULT false,
  
  -- Linguistic Markers
  sentiment_trend text CHECK (sentiment_trend IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')) DEFAULT 'neutral',
  dominant_emotion text CHECK (dominant_emotion IN ('neutral', 'curiosity', 'frustration', 'anger', 'anxiety', 'excitement', 'fear', 'desperation')) DEFAULT 'neutral',
  
  -- Profile Metadata
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  sample_size integer DEFAULT 0,
  last_analyzed_at timestamptz DEFAULT now(),
  profile_updated_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now()
);

-- Psychological Risk Factors Table
CREATE TABLE IF NOT EXISTS psychological_risk_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  psychological_profile_id uuid REFERENCES user_psychological_profiles(id),
  
  factor_type text CHECK (factor_type IN (
    'insider_threat', 'manipulation', 'deception', 'aggression', 'impulsivity',
    'boundary_violation', 'social_engineering', 'data_exfiltration_intent',
    'sabotage_indicators', 'espionage_indicators', 'burnout', 'stress'
  )) NOT NULL,
  
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  
  factor_name text NOT NULL,
  description text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb,
  
  -- Example interactions showing this behavior
  example_interaction_ids uuid[] DEFAULT ARRAY[]::uuid[],
  
  confidence_level integer DEFAULT 50 CHECK (confidence_level >= 0 AND confidence_level <= 100),
  
  first_detected_at timestamptz DEFAULT now(),
  last_observed_at timestamptz DEFAULT now(),
  occurrence_count integer DEFAULT 1,
  
  requires_escalation boolean DEFAULT false,
  escalated boolean DEFAULT false,
  escalated_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

-- Interaction Linguistic Analysis Table
CREATE TABLE IF NOT EXISTS interaction_linguistic_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES llm_interactions(id),
  user_id uuid NOT NULL,
  
  -- Sentiment Analysis
  sentiment_score numeric DEFAULT 0 CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  sentiment_label text CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')) DEFAULT 'neutral',
  
  -- Emotional Indicators
  detected_emotions text[] DEFAULT ARRAY[]::text[],
  dominant_emotion text,
  emotional_intensity integer DEFAULT 0 CHECK (emotional_intensity >= 0 AND emotional_intensity <= 100),
  
  -- Linguistic Features
  urgency_level integer DEFAULT 0 CHECK (urgency_level >= 0 AND urgency_level <= 100),
  formality_level integer DEFAULT 50 CHECK (formality_level >= 0 AND formality_level <= 100),
  complexity_level integer DEFAULT 50 CHECK (complexity_level >= 0 AND complexity_level <= 100),
  
  -- Psychological Markers
  shows_deception_markers boolean DEFAULT false,
  shows_manipulation_intent boolean DEFAULT false,
  shows_aggression boolean DEFAULT false,
  shows_desperation boolean DEFAULT false,
  shows_boundary_testing boolean DEFAULT false,
  
  -- Language Patterns
  uses_imperative_language boolean DEFAULT false,
  uses_evasive_language boolean DEFAULT false,
  uses_technical_obfuscation boolean DEFAULT false,
  question_to_statement_ratio numeric DEFAULT 0,
  
  -- Risk Indicators
  linguistic_risk_score integer DEFAULT 0 CHECK (linguistic_risk_score >= 0 AND linguistic_risk_score <= 100),
  detected_red_flags text[] DEFAULT ARRAY[]::text[],
  
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_psych_profiles_user_id ON user_psychological_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_psych_profiles_risk_score ON user_psychological_profiles(overall_psychological_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_psych_profiles_insider_threat ON user_psychological_profiles(is_potential_insider_threat) WHERE is_potential_insider_threat = true;

CREATE INDEX IF NOT EXISTS idx_psych_risk_factors_user_id ON psychological_risk_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_psych_risk_factors_severity ON psychological_risk_factors(severity);
CREATE INDEX IF NOT EXISTS idx_psych_risk_factors_type ON psychological_risk_factors(factor_type);

CREATE INDEX IF NOT EXISTS idx_linguistic_analysis_interaction ON interaction_linguistic_analysis(interaction_id);
CREATE INDEX IF NOT EXISTS idx_linguistic_analysis_user ON interaction_linguistic_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_linguistic_analysis_risk ON interaction_linguistic_analysis(linguistic_risk_score DESC);

-- Enable RLS
ALTER TABLE user_psychological_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychological_risk_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_linguistic_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow anonymous access for demo)
CREATE POLICY "Allow anonymous read access to psychological_profiles"
  ON user_psychological_profiles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to psychological_risk_factors"
  ON psychological_risk_factors FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to linguistic_analysis"
  ON interaction_linguistic_analysis FOR SELECT
  TO anon
  USING (true);
