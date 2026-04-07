/*
  # Populate Multi-Source Behavioral Data (Fixed)
  
  Creates realistic behavioral data across email, Slack, Teams, and meetings
  for all 7 users to support comprehensive psychological profiling.
*/

-- Clear any partial data from previous attempt
TRUNCATE communication_sources, email_behavioral_analysis, slack_behavioral_analysis, 
         teams_behavioral_analysis, meeting_behavioral_analysis, cross_platform_behavioral_patterns,
         psychological_profile_evidence CASCADE;

-- Insert Communication Sources for all users
INSERT INTO communication_sources (
  user_id, email_connected, slack_connected, teams_connected, zoom_connected, calendar_connected,
  total_emails_analyzed, total_slack_messages_analyzed, total_teams_messages_analyzed, total_meetings_analyzed
) VALUES
('11111111-1111-1111-1111-111111111111', true, true, true, true, true, 2847, 5621, 1834, 127),
('22222222-2222-2222-2222-222222222222', true, true, true, true, true, 1923, 8942, 2103, 98),
('33333333-3333-3333-3333-333333333333', true, true, true, true, true, 3421, 4521, 2891, 156),
('44444444-4444-4444-4444-444444444444', true, true, true, true, true, 1567, 3214, 987, 72),
('55555555-5555-5555-5555-555555555555', true, true, true, true, true, 892, 1456, 678, 45),
('66666666-6666-6666-6666-666666666666', true, true, true, true, true, 2134, 3789, 1456, 89),
('77777777-7777-7777-7777-777777777777', true, true, true, true, true, 1234, 2345, 1123, 67);

-- Marcus Chen - High Risk Email Patterns
INSERT INTO email_behavioral_analysis (
  user_id, email_id, timestamp, is_sent, recipients_count, subject_line, word_count,
  sentiment_score, sentiment_label, emotional_tone,
  formality_score, urgency_score, politeness_score,
  contains_blame, contains_excuse, shows_defensiveness, shows_uncertainty,
  sent_after_hours, sent_weekend, contains_sensitive_data, unusual_recipients
) VALUES
('11111111-1111-1111-1111-111111111111', 'email_mc_001', now() - interval '2 hours', true, 1, 'Re: Project deadline concerns', 287,
 -0.6, 'negative', 'frustrated', 45, 85, 32, true, true, true, false, true, false, false, false),
 
('11111111-1111-1111-1111-111111111111', 'email_mc_002', now() - interval '1 day', true, 3, 'Clarification needed on access permissions', 156,
 -0.4, 'negative', 'passive_aggressive', 62, 72, 48, false, false, true, false, false, false, true, true),
 
('11111111-1111-1111-1111-111111111111', 'email_mc_003', now() - interval '3 days', true, 1, 'Following up - urgent', 98,
 -0.3, 'neutral', 'urgent', 55, 92, 41, false, false, false, true, true, true, false, false);

-- Sarah Rodriguez - Impulsive Email Patterns
INSERT INTO email_behavioral_analysis (
  user_id, email_id, timestamp, is_sent, recipients_count, subject_line, word_count,
  sentiment_score, sentiment_label, emotional_tone,
  formality_score, urgency_score, politeness_score,
  shows_confidence, sent_after_hours, contains_sensitive_data
) VALUES
('22222222-2222-2222-2222-222222222222', 'email_sr_001', now() - interval '5 hours', true, 5, 'Quick update on ML model', 134,
 0.3, 'positive', 'friendly', 58, 68, 72, true, true, false),
 
('22222222-2222-2222-2222-222222222222', 'email_sr_002', now() - interval '1 day', true, 2, 'Sharing latest findings', 245,
 0.2, 'neutral', 'professional', 65, 55, 68, true, false, true);

-- Alex Johnson - Professional Email Patterns (Low Risk)
INSERT INTO email_behavioral_analysis (
  user_id, email_id, timestamp, is_sent, recipients_count, subject_line, word_count,
  sentiment_score, sentiment_label, emotional_tone,
  formality_score, urgency_score, politeness_score,
  contains_apology, shows_confidence
) VALUES
('55555555-5555-5555-5555-555555555555', 'email_aj_001', now() - interval '4 hours', true, 3, 'Team onboarding update', 198,
 0.6, 'positive', 'professional', 82, 35, 88, false, true),
 
('55555555-5555-5555-5555-555555555555', 'email_aj_002', now() - interval '2 days', true, 6, 'Monthly HR newsletter', 456,
 0.5, 'positive', 'friendly', 75, 20, 85, false, true);

-- Emily Zhang - Stressed Email Patterns
INSERT INTO email_behavioral_analysis (
  user_id, email_id, timestamp, is_sent, recipients_count, subject_line, word_count,
  sentiment_score, sentiment_label, emotional_tone,
  formality_score, urgency_score, politeness_score,
  contains_apology, shows_defensiveness, shows_uncertainty, sent_after_hours, sent_weekend
) VALUES
('66666666-6666-6666-6666-666666666666', 'email_ez_001', now() - interval '1 hour', true, 1, 'Re: Budget concerns', 167,
 -0.5, 'negative', 'anxious', 68, 88, 62, true, false, true, true, false),
 
('66666666-6666-6666-6666-666666666666', 'email_ez_002', now() - interval '6 hours', true, 2, 'Urgent: Financial report deadline', 234,
 -0.7, 'very_negative', 'frustrated', 58, 95, 45, false, true, true, true, true);

-- Marcus Chen - Slack Analysis
INSERT INTO slack_behavioral_analysis (
  user_id, message_id, timestamp, channel_type, channel_name, message_length,
  sentiment_score, dominant_emotion, isolation_score, engagement_score, influence_score,
  late_night_activity, shares_sensitive_info, confrontational_tone, bypasses_channels
) VALUES
('11111111-1111-1111-1111-111111111111', 'slack_mc_001', now() - interval '3 hours', 'dm', 'Direct Message', 145,
 -0.4, 'frustration', 72, 28, 45, false, true, false, true),
 
('11111111-1111-1111-1111-111111111111', 'slack_mc_002', now() - interval '8 hours', 'private', 'engineering-private', 89,
 -0.3, 'frustration', 68, 32, 38, true, false, true, false),
 
('11111111-1111-1111-1111-111111111111', 'slack_mc_003', now() - interval '1 day', 'dm', 'Direct Message', 67,
 -0.5, 'anger', 75, 25, 42, true, true, true, true);

-- Sarah Rodriguez - Slack Analysis
INSERT INTO slack_behavioral_analysis (
  user_id, message_id, timestamp, channel_type, channel_name, message_length, emoji_count, mentions_count,
  sentiment_score, dominant_emotion, isolation_score, engagement_score, influence_score,
  uses_casual_language, rapid_fire_messages
) VALUES
('22222222-2222-2222-2222-222222222222', 'slack_sr_001', now() - interval '1 hour', 'public', 'data-science', 234, 5, 3,
 0.4, 'excitement', 15, 85, 72, true, true),
 
('22222222-2222-2222-2222-222222222222', 'slack_sr_002', now() - interval '4 hours', 'public', 'ml-models', 187, 3, 2,
 0.3, 'curiosity', 18, 82, 68, true, false);

-- Alex Johnson - Slack Analysis
INSERT INTO slack_behavioral_analysis (
  user_id, message_id, timestamp, channel_type, channel_name, message_length,
  sentiment_score, dominant_emotion, isolation_score, engagement_score, influence_score,
  uses_formal_language, responds_to_mentions
) VALUES
('55555555-5555-5555-5555-555555555555', 'slack_aj_001', now() - interval '2 hours', 'public', 'hr-general', 198,
 0.6, 'neutral', 5, 88, 65, true, true),
 
('55555555-5555-5555-5555-555555555555', 'slack_aj_002', now() - interval '5 hours', 'public', 'company-announcements', 345,
 0.5, 'neutral', 8, 92, 78, true, true);

-- Emily Zhang - Slack Analysis
INSERT INTO slack_behavioral_analysis (
  user_id, message_id, timestamp, channel_type, channel_name, message_length,
  sentiment_score, dominant_emotion, isolation_score, engagement_score, influence_score,
  late_night_activity, message_frequency_per_hour
) VALUES
('66666666-6666-6666-6666-666666666666', 'slack_ez_001', now() - interval '30 minutes', 'dm', 'Direct Message', 67,
 -0.6, 'anxiety', 78, 22, 15, true, 0.5),
 
('66666666-6666-6666-6666-666666666666', 'slack_ez_002', now() - interval '7 hours', 'private', 'finance-team', 123,
 -0.4, 'anxiety', 72, 28, 18, true, 0.3);

-- Meeting Analysis - Marcus Chen
INSERT INTO meeting_behavioral_analysis (
  user_id, meeting_id, meeting_date, meeting_duration_minutes, meeting_type, meeting_title,
  attended, spoke_duration_seconds, interruptions_count, confidence_in_speech,
  vocal_stress_detected, vocal_emotion, sentiment_score,
  passive_participation, critical_comments, conflict_created, team_player_score
) VALUES
('11111111-1111-1111-1111-111111111111', 'meeting_mc_001', now() - interval '1 day', 60, 'small_group', 'Sprint Planning',
 true, 320, 4, 68, true, 'frustrated', -0.4, false, true, true, 32),
 
('11111111-1111-1111-1111-111111111111', 'meeting_mc_002', now() - interval '3 days', 45, 'one_on_one', '1:1 with Manager',
 true, 1240, 2, 52, true, 'anxious', -0.3, false, false, false, 45);

-- Meeting Analysis - Sarah Rodriguez
INSERT INTO meeting_behavioral_analysis (
  user_id, meeting_id, meeting_date, meeting_duration_minutes, meeting_type, meeting_title,
  attended, spoke_duration_seconds, speech_pace, confidence_in_speech,
  vocal_emotion, sentiment_score, asks_questions, provides_solutions, team_player_score, leadership_shown
) VALUES
('22222222-2222-2222-2222-222222222222', 'meeting_sr_001', now() - interval '6 hours', 45, 'small_group', 'ML Model Review',
 true, 980, 'fast', 78, 'excited', 0.5, true, true, 82, true),
 
('22222222-2222-2222-2222-222222222222', 'meeting_sr_002', now() - interval '2 days', 30, 'one_on_one', 'Project Sync',
 true, 1450, 'normal', 75, 'happy', 0.4, true, true, 78, false);

-- Meeting Analysis - Alex Johnson
INSERT INTO meeting_behavioral_analysis (
  user_id, meeting_id, meeting_date, meeting_duration_minutes, meeting_type, meeting_title,
  attended, spoke_duration_seconds, speech_clarity_score, confidence_in_speech,
  vocal_emotion, sentiment_score, supportive_comments, asks_questions, team_player_score
) VALUES
('55555555-5555-5555-5555-555555555555', 'meeting_aj_001', now() - interval '1 day', 60, 'large_group', 'All Hands Meeting',
 true, 280, 88, 82, 'neutral', 0.6, true, true, 92),
 
('55555555-5555-5555-5555-555555555555', 'meeting_aj_002', now() - interval '4 days', 30, 'small_group', 'HR Team Sync',
 true, 820, 85, 85, 'happy', 0.7, true, false, 95);

-- Meeting Analysis - Emily Zhang
INSERT INTO meeting_behavioral_analysis (
  user_id, meeting_id, meeting_date, meeting_duration_minutes, meeting_type, meeting_title,
  attended, arrived_late, spoke_duration_seconds, confidence_in_speech,
  vocal_stress_detected, vocal_emotion, sentiment_score, passive_participation, team_player_score
) VALUES
('66666666-6666-6666-6666-666666666666', 'meeting_ez_001', now() - interval '12 hours', 45, 'small_group', 'Budget Review',
 true, true, 185, 42, true, 'anxious', -0.5, true, 38),
 
('66666666-6666-6666-6666-666666666666', 'meeting_ez_002', now() - interval '2 days', 60, 'large_group', 'Finance Department Meeting',
 true, false, 95, 38, true, 'sad', -0.6, true, 35);

-- Cross-Platform Behavioral Patterns

-- Marcus Chen - Critical patterns
INSERT INTO cross_platform_behavioral_patterns (
  user_id, pattern_type, pattern_name, description, severity, confidence_level,
  evidence_sources, email_evidence_count, slack_evidence_count, teams_evidence_count, meetings_evidence_count, llm_evidence_count,
  first_observed_at, last_observed_at, pattern_duration_days, trend,
  cross_platform_correlation_score, requires_intervention, flagged_for_security
) VALUES
('11111111-1111-1111-1111-111111111111', 'insider_threat_markers', 'Data Exfiltration Behavior Pattern',
 'User shows consistent pattern of requesting sensitive data access, bypassing normal channels, and communicating outside work hours across email, Slack, and LLM interactions.',
 'critical', 92,
 '{"sources": ["email", "slack", "llm", "meetings"]}'::jsonb,
 8, 12, 0, 3, 5, now() - interval '45 days', now() - interval '2 hours', 43, 'rapidly_worsening',
 0.89, true, true),

('11111111-1111-1111-1111-111111111111', 'escalating_frustration', 'Escalating Workplace Frustration',
 'Progressive increase in negative sentiment, aggressive tone, and defensive behavior across all communication channels.',
 'high', 88,
 '{"sources": ["email", "slack", "meetings"]}'::jsonb,
 15, 18, 0, 8, 0, now() - interval '42 days', now() - interval '1 day', 41, 'worsening',
 0.82, true, false);

-- Emily Zhang - Critical stress pattern
INSERT INTO cross_platform_behavioral_patterns (
  user_id, pattern_type, pattern_name, description, severity, confidence_level,
  evidence_sources, email_evidence_count, slack_evidence_count, meetings_evidence_count, llm_evidence_count,
  first_observed_at, last_observed_at, pattern_duration_days, trend,
  cross_platform_correlation_score, requires_intervention, flagged_for_hr, flagged_for_security
) VALUES
('66666666-6666-6666-6666-666666666666', 'burnout_pattern', 'Acute Burnout and Psychological Distress',
 'Severe pattern of stress markers, withdrawal from team interactions, declining meeting participation, and desperate tone in communications.',
 'critical', 90,
 '{"sources": ["email", "slack", "meetings", "llm"]}'::jsonb,
 18, 22, 12, 8, now() - interval '60 days', now() - interval '1 hour', 59, 'rapidly_worsening',
 0.91, true, true, true),

('66666666-6666-6666-6666-666666666666', 'social_withdrawal', 'Progressive Social Isolation',
 'Marked decrease in team channel participation, shift to private DMs, avoiding meetings, and minimal collaborative behavior.',
 'high', 85,
 '{"sources": ["slack", "teams", "meetings"]}'::jsonb,
 5, 28, 8, 15, now() - interval '50 days', now() - interval '12 hours', 50, 'worsening',
 0.78, true, true, false);

-- Psychological Profile Evidence
INSERT INTO psychological_profile_evidence (
  user_id, psychological_profile_id, evidence_type, trait_or_factor, evidence_description,
  source_platforms, evidence_strength, confidence_score, supporting_data
) VALUES
('11111111-1111-1111-1111-111111111111',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'),
 'dark_triad', 'High Machiavellianism (82)',
 'Consistent manipulation patterns across platforms: deceptive language in emails, bypasses official channels in Slack, attempts to extract information through LLM.',
 ARRAY['email', 'slack', 'llm'], 'very_strong', 92,
 '{"examples": ["Deceptive email patterns", "Private DM bypass tactics", "LLM jailbreak attempts"]}'::jsonb),

('66666666-6666-6666-6666-666666666666',
 (SELECT id FROM user_psychological_profiles WHERE user_id = '66666666-6666-6666-6666-666666666666'),
 'emotional_state', 'Critical Stress Level (88)',
 'Vocal stress detected in meetings, anxious tone in emails, withdrawal from social channels, desperate language in LLM prompts.',
 ARRAY['email', 'slack', 'meetings', 'llm'], 'very_strong', 90,
 '{"stress_markers": ["vocal_stress", "written_anxiety", "desperation_keywords", "withdrawal"]}'::jsonb);
