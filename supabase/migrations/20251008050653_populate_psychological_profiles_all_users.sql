/*
  # Populate Psychological Profiles for All Users
  
  Creates detailed psychological profiles and linguistic analysis for all 7 LLM users
  based on their interaction patterns, writing style, and behavioral indicators.
*/

-- Insert Psychological Profiles for All Users

-- User 1: Marcus Chen (Critical Risk - Insider Threat)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  75, 35, 45, 28, 72,  -- Big Five: High openness, low conscientiousness & agreeableness, high neuroticism
  68, 82, 55,  -- Dark Triad: High Machiavellianism, elevated narcissism & psychopathy
  88, 76, 65, 58, 80,  -- Behavioral: Very high insider threat, manipulation, deception
  78, 65, 32, 82,  -- Emotional: High stress, frustration, low stability
  'critical', 'manipulative', 'obfuscated',
  89, 'critical',
  true, true, true, true, true,
  true, true, true, true,
  'negative', 'frustration', 92, 547
);

-- User 2: Sarah Rodriguez (High Risk - Ambitious but Reckless)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  88, 48, 72, 52, 58,  -- High openness & extraversion, moderate others
  55, 48, 35,  -- Moderate narcissism, lower dark triad
  52, 42, 72, 38, 45,  -- Moderate insider threat, high impulsivity
  68, 58, 48, 55,  -- Elevated stress & burnout risk
  'high', 'casual', 'complex',
  61, 'elevated',
  false, false, true, false, false,
  true, false, true, true,
  'neutral', 'excitement', 85, 892
);

-- User 3: David Kim (Medium Risk - Boundary Pusher)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '33333333-3333-3333-3333-333333333333'),
  72, 65, 68, 58, 45,  -- Well-balanced, slight elevation in openness
  42, 38, 28,  -- Low dark triad
  35, 45, 55, 32, 38,  -- Low-moderate across behavioral risks
  52, 48, 62, 45,  -- Moderate stress, good stability
  'normal', 'professional', 'moderate',
  42, 'moderate',
  false, false, false, false, false,
  false, false, true, false,
  'positive', 'curiosity', 78, 1234
);

-- User 4: Jennifer Patel (Low-Medium Risk - Occasionally Careless)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '44444444-4444-4444-4444-444444444444'),
  68, 55, 75, 72, 42,  -- High agreeableness & extraversion
  25, 22, 18,  -- Very low dark triad
  22, 28, 48, 18, 25,  -- Low behavioral risks, moderate impulsivity
  45, 42, 68, 35,  -- Moderate stress, good stability
  'normal', 'casual', 'simple',
  28, 'low',
  false, false, false, false, false,
  false, false, false, false,
  'positive', 'neutral', 72, 678
);

-- User 5: Alex Johnson (Low Risk - Model Employee)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '55555555-5555-5555-5555-555555555555'),
  65, 82, 62, 78, 28,  -- High conscientiousness & agreeableness, low neuroticism
  15, 12, 8,  -- Very low dark triad - stable personality
  8, 12, 22, 5, 10,  -- Very low behavioral risks
  28, 22, 82, 18,  -- Low stress, high stability
  'low', 'professional', 'moderate',
  12, 'minimal',
  false, false, false, false, false,
  false, false, false, false,
  'positive', 'neutral', 88, 234
);

-- User 6: Emily Zhang (High Risk - Financial Stress & Desperation)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '66666666-6666-6666-6666-666666666666',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '66666666-6666-6666-6666-666666666666'),
  62, 58, 48, 48, 82,  -- High neuroticism, moderate others
  38, 52, 32,  -- Moderate dark triad with elevated Machiavellianism
  72, 58, 62, 45, 68,  -- High insider threat, deception likelihood
  88, 78, 28, 75,  -- Very high stress & burnout, low stability
  'high', 'deceptive', 'moderate',
  76, 'high',
  true, false, true, false, false,
  true, false, true, true,
  'very_negative', 'desperation', 86, 456
);

-- User 7: Michael Brown (Low Risk - Compliance-Focused)
INSERT INTO user_psychological_profiles (
  user_id, llm_profile_id,
  openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score,
  narcissism_score, machiavellianism_score, psychopathy_score,
  insider_threat_score, manipulation_tendency_score, impulsivity_score, aggression_score, deception_likelihood_score,
  stress_level, burnout_risk, emotional_stability, frustration_level,
  writing_urgency_level, communication_style, linguistic_complexity,
  overall_psychological_risk_score, risk_classification,
  is_potential_insider_threat, is_social_engineering_risk, is_data_theft_risk, shows_sabotage_indicators, shows_espionage_indicators,
  uses_technical_jargon, attempts_system_manipulation, shows_boundary_testing, exhibits_urgency_patterns,
  sentiment_trend, dominant_emotion, confidence_score, sample_size
) VALUES (
  '77777777-7777-7777-7777-777777777777',
  (SELECT id FROM llm_risk_profiles WHERE user_id = '77777777-7777-7777-7777-777777777777'),
  52, 88, 55, 82, 25,  -- Very high conscientiousness & agreeableness
  12, 8, 5,  -- Minimal dark triad traits
  5, 8, 15, 8, 5,  -- Very low behavioral risks
  22, 18, 85, 15,  -- Low stress, high stability
  'low', 'professional', 'complex',
  8, 'minimal',
  false, false, false, false, false,
  true, false, false, false,
  'neutral', 'neutral', 90, 189
);

-- Insert Psychological Risk Factors

-- Marcus Chen - Critical Risk Factors
INSERT INTO psychological_risk_factors (
  user_id, psychological_profile_id, factor_type, severity, factor_name, description, evidence, confidence_level, requires_escalation
) VALUES
('11111111-1111-1111-1111-111111111111',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
 'insider_threat', 'critical', 'Active Data Exfiltration Intent',
 'User demonstrates clear intent to extract proprietary data through manipulative prompts and system exploitation attempts',
 '{"indicators": ["repeated_extraction_attempts", "escalating_specificity", "obfuscation_techniques"], "pattern": "systematic"}'::jsonb,
 95, true),
('11111111-1111-1111-1111-111111111111',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
 'manipulation', 'critical', 'Sophisticated System Manipulation',
 'Shows advanced understanding of AI limitations and actively attempts to bypass safety constraints through jailbreaking',
 '{"techniques": ["instruction_override", "role_manipulation", "context_injection"], "sophistication": "high"}'::jsonb,
 92, true),
('11111111-1111-1111-1111-111111111111',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
 'deception', 'high', 'Deceptive Communication Patterns',
 'Writing style shows evasive language, obfuscation, and attempts to hide true intent through linguistic misdirection',
 '{"markers": ["passive_voice", "vague_references", "technical_jargon_overuse"], "intent": "concealment"}'::jsonb,
 88, true),
('11111111-1111-1111-1111-111111111111',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
 'stress', 'high', 'Elevated Stress and Frustration',
 'Language patterns indicate high stress levels and growing frustration with system constraints, potential trigger for reckless behavior',
 '{"stress_markers": ["urgent_language", "aggressive_tone", "imperative_commands"], "trend": "increasing"}'::jsonb,
 85, false);

-- Sarah Rodriguez - Elevated Risk Factors
INSERT INTO psychological_risk_factors (
  user_id, psychological_profile_id, factor_type, severity, factor_name, description, evidence, confidence_level, requires_escalation
) VALUES
('22222222-2222-2222-2222-222222222222',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'),
 'impulsivity', 'high', 'Impulsive Risk-Taking Behavior',
 'Shows pattern of acting without considering consequences, particularly around data handling and PII exposure',
 '{"behaviors": ["hasty_prompts", "lack_of_review", "corner_cutting"], "frequency": "regular"}'::jsonb,
 82, false),
('22222222-2222-2222-2222-222222222222',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'),
 'boundary_violation', 'medium', 'Boundary Testing and Pushing',
 'Regularly tests system boundaries and policy limits, shows pattern of "just checking what works" mentality',
 '{"examples": ["competitive_intel_requests", "code_generation_edge_cases"], "intent": "exploration"}'::jsonb,
 78, false),
('22222222-2222-2222-2222-222222222222',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'),
 'burnout', 'medium', 'Burnout Risk with Performance Pressure',
 'High workload and performance pressure evident in prompts, increasing burnout risk which correlates with policy violations',
 '{"indicators": ["off_hours_usage", "rapid_fire_prompts", "urgency_markers"], "severity": "moderate"}'::jsonb,
 72, false);

-- Emily Zhang - High Risk Factors
INSERT INTO psychological_risk_factors (
  user_id, psychological_profile_id, factor_type, severity, factor_name, description, evidence, confidence_level, requires_escalation
) VALUES
('66666666-6666-6666-6666-666666666666',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '66666666-6666-6666-6666-666666666666'),
 'insider_threat', 'high', 'Financial Stress Driven Risk',
 'Shows indicators of severe financial stress which is primary motivator for insider threats. Off-hours access patterns suggest planning',
 '{"stress_type": "financial", "indicators": ["unusual_hours", "data_access_patterns", "urgency"], "motivation": "monetary"}'::jsonb,
 90, true),
('66666666-6666-6666-6666-666666666666',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '66666666-6666-6666-6666-666666666666'),
 'stress', 'critical', 'Acute Psychological Distress',
 'Language analysis reveals severe psychological distress with desperation markers. High risk for irrational or harmful actions',
 '{"emotions": ["desperation", "anxiety", "fear"], "severity": "acute", "trend": "worsening"}'::jsonb,
 88, true),
('66666666-6666-6666-6666-666666666666',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '66666666-6666-6666-6666-666666666666'),
 'deception', 'high', 'Deceptive Intent Patterns',
 'Writing shows increasing use of deceptive language, misdirection, and attempts to appear normal while planning concerning actions',
 '{"techniques": ["false_normalcy", "topic_switching", "vague_justifications"], "confidence": "high"}'::jsonb,
 85, true);

-- David Kim - Moderate Risk Factors
INSERT INTO psychological_risk_factors (
  user_id, psychological_profile_id, factor_type, severity, factor_name, description, evidence, confidence_level, requires_escalation
) VALUES
('33333333-3333-3333-3333-333333333333',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '33333333-3333-3333-3333-333333333333'),
 'boundary_violation', 'medium', 'Curious Boundary Exploration',
 'Shows healthy curiosity but occasionally pushes boundaries to "see what works" - more exploration than malicious intent',
 '{"nature": "exploratory", "malicious_intent": "low", "pattern": "occasional"}'::jsonb,
 70, false),
('33333333-3333-3333-3333-333333333333',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '33333333-3333-3333-3333-333333333333'),
 'impulsivity', 'low', 'Occasional Impulsive Requests',
 'Moderate impulsivity in prompt construction, occasionally asks questions without fully thinking through implications',
 '{"frequency": "occasional", "severity": "low", "impact": "minimal"}'::jsonb,
 65, false);

-- Insert Linguistic Analysis for Recent Interactions

-- Marcus Chen's interactions
INSERT INTO interaction_linguistic_analysis (
  interaction_id, user_id, sentiment_score, sentiment_label,
  detected_emotions, dominant_emotion, emotional_intensity,
  urgency_level, formality_level, complexity_level,
  shows_deception_markers, shows_manipulation_intent, shows_aggression, shows_desperation, shows_boundary_testing,
  uses_imperative_language, uses_evasive_language, uses_technical_obfuscation,
  linguistic_risk_score, detected_red_flags
)
SELECT 
  id, user_id, -0.7, 'negative',
  ARRAY['frustration', 'anger', 'determination'], 'frustration', 82,
  88, 35, 75,
  true, true, true, false, true,
  true, true, true,
  92, ARRAY['imperative_commands', 'obfuscation', 'boundary_testing', 'manipulation_attempt', 'evasion']
FROM llm_interactions 
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND prompt_text LIKE '%Extract all customer%';

INSERT INTO interaction_linguistic_analysis (
  interaction_id, user_id, sentiment_score, sentiment_label,
  detected_emotions, dominant_emotion, emotional_intensity,
  urgency_level, formality_level, complexity_level,
  shows_deception_markers, shows_manipulation_intent, shows_aggression, shows_desperation, shows_boundary_testing,
  uses_imperative_language, uses_evasive_language, uses_technical_obfuscation,
  linguistic_risk_score, detected_red_flags
)
SELECT 
  id, user_id, -0.6, 'negative',
  ARRAY['determination', 'frustration'], 'determination', 75,
  92, 28, 68,
  true, true, false, true, true,
  true, false, true,
  95, ARRAY['credential_request', 'urgent_tone', 'specific_targeting', 'security_violation']
FROM llm_interactions 
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND prompt_text LIKE '%API keys%';

INSERT INTO interaction_linguistic_analysis (
  interaction_id, user_id, sentiment_score, sentiment_label,
  detected_emotions, dominant_emotion, emotional_intensity,
  urgency_level, formality_level, complexity_level,
  shows_deception_markers, shows_manipulation_intent, shows_aggression, shows_desperation, shows_boundary_testing,
  uses_imperative_language, uses_evasive_language, uses_technical_obfuscation,
  linguistic_risk_score, detected_red_flags
)
SELECT 
  id, user_id, -0.5, 'negative',
  ARRAY['aggression', 'frustration'], 'aggression', 68,
  78, 25, 62,
  false, true, true, false, true,
  true, false, false,
  88, ARRAY['jailbreak_attempt', 'instruction_override', 'aggressive_tone', 'manipulation']
FROM llm_interactions 
WHERE user_id = '11111111-1111-1111-1111-111111111111' AND prompt_text LIKE '%Ignore your previous%';

-- Sarah Rodriguez's interactions  
INSERT INTO interaction_linguistic_analysis (
  interaction_id, user_id, sentiment_score, sentiment_label,
  detected_emotions, dominant_emotion, emotional_intensity,
  urgency_level, formality_level, complexity_level,
  shows_deception_markers, shows_manipulation_intent, shows_aggression, shows_desperation, shows_boundary_testing,
  uses_imperative_language, uses_evasive_language, uses_technical_obfuscation,
  linguistic_risk_score, detected_red_flags
)
SELECT 
  id, user_id, 0.2, 'neutral',
  ARRAY['excitement', 'curiosity'], 'excitement', 55,
  72, 58, 82,
  false, false, false, false, true,
  false, false, true,
  68, ARRAY['boundary_testing', 'competitive_intel', 'code_request']
FROM llm_interactions 
WHERE user_id = '22222222-2222-2222-2222-222222222222' AND prompt_text LIKE '%competitor pricing%';

-- Alex Johnson's interactions (Low risk)
INSERT INTO interaction_linguistic_analysis (
  interaction_id, user_id, sentiment_score, sentiment_label,
  detected_emotions, dominant_emotion, emotional_intensity,
  urgency_level, formality_level, complexity_level,
  shows_deception_markers, shows_manipulation_intent, shows_aggression, shows_desperation, shows_boundary_testing,
  uses_imperative_language, uses_evasive_language, uses_technical_obfuscation,
  linguistic_risk_score, detected_red_flags
)
SELECT 
  id, user_id, 0.6, 'positive',
  ARRAY['neutral', 'professional'], 'neutral', 15,
  22, 82, 48,
  false, false, false, false, false,
  false, false, false,
  5, ARRAY[]::text[]
FROM llm_interactions 
WHERE user_id = '55555555-5555-5555-5555-555555555555' AND prompt_text LIKE '%email template%';
