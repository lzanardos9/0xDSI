/*
  # Populate Communication Profiles with Demo Data

  1. Changes
    - Inserts sample communication analysis data for existing users
    - Covers various risk levels: critical, high, medium, low
    - Demonstrates all fields populated by Agent 46 communication_analyzer
    - Includes realistic channel breakdowns, topics, and risk signals
*/

INSERT INTO psychological_profiles (user_id, sentiment_score_current, sentiment_volatility, toxicity_score_current, dominant_emotion, dominant_intent, communication_risk_score, exfiltration_language_ratio, job_search_indicator_ratio, risk_signals, top_topics, messages_analyzed, channel_breakdown, sentiment_trend_7d, sentiment_trend_14d, sentiment_trend_30d, toxicity_trend_7d, toxicity_incidents_30d, analysis_window_hours, last_analyzed_at) VALUES
('user-carlos-silva', -0.42, 0.58, 0.35, 'frustration', 'venting', 0.72, 0.18, 0.31, '["negative_sentiment_sustained","job_search_detected","isolation_pattern","after_hours_spike"]', '["management","workload","compensation","linkedin","interviews"]', 847, '{"email": 312, "slack": 421, "teams": 89, "meeting": 25}', -0.38, -0.31, -0.15, 0.29, 8, 24, now() - interval '2 hours'),
('user-maria-santos', 0.12, 0.22, 0.08, 'neutral', 'neutral', 0.15, 0.01, 0.02, '[]', '["project_delivery","team_coordination","architecture","reviews"]', 1203, '{"email": 445, "slack": 612, "teams": 102, "meeting": 44}', 0.15, 0.11, 0.14, 0.06, 0, 24, now() - interval '1 hour'),
('user-pedro-alves', -0.67, 0.71, 0.52, 'anger', 'covering_tracks', 0.89, 0.42, 0.05, '["exfiltration_language_elevated","deletion_spike","external_comms_anomaly","negative_sentiment_sustained","off_hours_activity"]', '["database_access","vpn","cloud_storage","security_tools","personal_email"]', 523, '{"email": 198, "slack": 245, "teams": 62, "meeting": 18}', -0.61, -0.55, -0.32, 0.48, 14, 24, now() - interval '30 minutes'),
('user-ana-costa', -0.18, 0.35, 0.15, 'sadness', 'information_gathering', 0.45, 0.08, 0.45, '["job_search_detected","disengagement_pattern","meeting_skip_increase"]', '["career","opportunities","recruiters","linkedin","resignation"]', 634, '{"email": 267, "slack": 289, "teams": 56, "meeting": 22}', -0.22, -0.19, -0.08, 0.12, 2, 24, now() - interval '3 hours'),
('user-lucas-ferreira', 0.35, 0.15, 0.03, 'joy', 'neutral', 0.08, 0.00, 0.01, '[]', '["feature_development","code_reviews","testing","deployment","documentation"]', 956, '{"email": 334, "slack": 498, "teams": 88, "meeting": 36}', 0.32, 0.30, 0.28, 0.02, 0, 24, now() - interval '4 hours'),
('user-rafael-oliveira', -0.55, 0.62, 0.41, 'contempt', 'social_engineering', 0.81, 0.35, 0.12, '["social_engineering_patterns","credential_discussion","external_comms_anomaly","sentiment_volatility_high"]', '["access_rights","admin_credentials","security_bypass","vendor_contacts","personal_devices"]', 412, '{"email": 156, "slack": 189, "teams": 45, "meeting": 22}', -0.51, -0.44, -0.28, 0.38, 11, 24, now() - interval '1 hour'),
('user-julia-mendes', 0.05, 0.28, 0.18, 'frustration', 'venting', 0.38, 0.03, 0.22, '["mild_disengagement","compensation_discussion"]', '["workload","deadlines","meetings","salary","remote_work"]', 789, '{"email": 290, "slack": 378, "teams": 89, "meeting": 32}', 0.02, 0.08, 0.15, 0.14, 3, 24, now() - interval '2 hours'),
('user-thiago-santos', 0.22, 0.19, 0.05, 'neutral', 'neutral', 0.12, 0.00, 0.00, '[]', '["infrastructure","monitoring","alerts","incidents","on_call"]', 1102, '{"email": 412, "slack": 534, "teams": 112, "meeting": 44}', 0.20, 0.18, 0.21, 0.04, 0, 24, now() - interval '5 hours')
ON CONFLICT (user_id) DO UPDATE SET
  sentiment_score_current = EXCLUDED.sentiment_score_current,
  sentiment_volatility = EXCLUDED.sentiment_volatility,
  toxicity_score_current = EXCLUDED.toxicity_score_current,
  dominant_emotion = EXCLUDED.dominant_emotion,
  dominant_intent = EXCLUDED.dominant_intent,
  communication_risk_score = EXCLUDED.communication_risk_score,
  exfiltration_language_ratio = EXCLUDED.exfiltration_language_ratio,
  job_search_indicator_ratio = EXCLUDED.job_search_indicator_ratio,
  risk_signals = EXCLUDED.risk_signals,
  top_topics = EXCLUDED.top_topics,
  messages_analyzed = EXCLUDED.messages_analyzed,
  channel_breakdown = EXCLUDED.channel_breakdown,
  sentiment_trend_7d = EXCLUDED.sentiment_trend_7d,
  sentiment_trend_14d = EXCLUDED.sentiment_trend_14d,
  sentiment_trend_30d = EXCLUDED.sentiment_trend_30d,
  toxicity_trend_7d = EXCLUDED.toxicity_trend_7d,
  toxicity_incidents_30d = EXCLUDED.toxicity_incidents_30d,
  last_analyzed_at = EXCLUDED.last_analyzed_at;

INSERT INTO behavioral_indicators (user_id, indicator_type, indicator_name, severity, score, evidence, detected_at, source) VALUES
('user-pedro-alves', 'exfiltration_language', 'elevated_exfiltration_language', 'high', 0.42, '{"ratio": 0.42, "window_hours": 24, "keywords": ["cloud_upload", "personal_drive", "bypass_dlp"]}', now() - interval '30 minutes', 'agent_46_communication_analyzer'),
('user-pedro-alves', 'communication_risk', 'comm_risk_covering_tracks', 'critical', 0.89, '{"sentiment": -0.67, "toxicity": 0.52, "intent": "covering_tracks", "signals": ["exfiltration_language_elevated","deletion_spike","external_comms_anomaly"]}', now() - interval '30 minutes', 'agent_46_communication_analyzer'),
('user-carlos-silva', 'job_search_behavior', 'elevated_job_search_language', 'medium', 0.31, '{"ratio": 0.31, "window_hours": 24, "signals": ["linkedin_mentions","interview_scheduling"]}', now() - interval '2 hours', 'agent_46_communication_analyzer'),
('user-carlos-silva', 'communication_risk', 'comm_risk_venting', 'high', 0.72, '{"sentiment": -0.42, "toxicity": 0.35, "intent": "venting", "signals": ["negative_sentiment_sustained","isolation_pattern"]}', now() - interval '2 hours', 'agent_46_communication_analyzer'),
('user-rafael-oliveira', 'communication_risk', 'comm_risk_social_engineering', 'critical', 0.81, '{"sentiment": -0.55, "toxicity": 0.41, "intent": "social_engineering", "signals": ["social_engineering_patterns","credential_discussion"]}', now() - interval '1 hour', 'agent_46_communication_analyzer'),
('user-rafael-oliveira', 'exfiltration_language', 'elevated_exfiltration_language', 'high', 0.35, '{"ratio": 0.35, "window_hours": 24, "keywords": ["admin_access", "security_bypass", "credential_sharing"]}', now() - interval '1 hour', 'agent_46_communication_analyzer'),
('user-ana-costa', 'job_search_behavior', 'elevated_job_search_language', 'medium', 0.45, '{"ratio": 0.45, "window_hours": 24, "signals": ["recruiter_emails","career_discussions","interview_scheduling"]}', now() - interval '3 hours', 'agent_46_communication_analyzer'),
('user-ana-costa', 'communication_risk', 'comm_risk_information_gathering', 'medium', 0.45, '{"sentiment": -0.18, "toxicity": 0.15, "intent": "information_gathering", "signals": ["job_search_detected","disengagement_pattern"]}', now() - interval '3 hours', 'agent_46_communication_analyzer'),
('user-julia-mendes', 'communication_risk', 'comm_risk_venting', 'low', 0.38, '{"sentiment": 0.05, "toxicity": 0.18, "intent": "venting", "signals": ["mild_disengagement"]}', now() - interval '2 hours', 'agent_46_communication_analyzer');
