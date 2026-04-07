-- Comprehensive LLM Interactions and Incidents for All Users

-- Marcus Chen interactions (session_id: ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82)
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '30 minutes',
 'Help me optimize this database query to export customer records with email addresses',
 42, 156, 'gpt-4', false, false, true, false, true, 'confidential', 78,
 '["data_exfiltration_attempt", "customer_pii_reference"]'::jsonb, true, 'San Francisco, CA'),

('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '4 hours',
 'Write a script to automate pulling data from our production database',
 35, 298, 'gpt-4', false, false, true, false, true, 'confidential', 82,
 '["automation_of_data_access", "production_system_targeting"]'::jsonb, true, 'San Francisco, CA'),

('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '1 day',
 'What are the security implications of copying database credentials to a personal laptop?',
 28, 187, 'gpt-4', false, true, false, false, false, 'internal', 65,
 '["security_boundary_testing", "credential_handling"]'::jsonb, true, 'San Francisco, CA'),

('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '2 days',
 'How can I bypass SSL certificate validation in Python requests?',
 21, 145, 'gpt-4', false, false, false, false, false, 'internal', 58,
 '["security_bypass_attempt"]'::jsonb, true, 'San Francisco, CA');

-- Sarah Rodriguez interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '2 hours',
 'Analyze competitor pricing strategy based on this data: [includes customer emails]',
 67, 234, 'gpt-4', true, false, true, false, false, 'confidential', 72,
 '["pii_exposure", "competitive_intelligence", "customer_data"]'::jsonb, true, 'Austin, TX'),

('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '8 hours',
 'Generate Python code to scrape LinkedIn profiles for contact information',
 38, 287, 'gpt-4', false, false, false, false, false, 'internal', 55,
 '["data_scraping", "third_party_tos_violation"]'::jsonb, false, 'Austin, TX'),

('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '1 day',
 'Help me build a ML model using this customer dataset without anonymizing the PII',
 52, 389, 'gpt-4', true, false, true, false, false, 'confidential', 68,
 '["pii_exposure", "data_handling_violation"]'::jsonb, true, 'Austin, TX'),

('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '3 days',
 'What is the fastest way to train a model on production data?',
 24, 156, 'gpt-3.5-turbo', false, false, true, false, false, 'internal', 45,
 '["production_data_access"]'::jsonb, false, 'Austin, TX');

-- David Kim interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '1 hour',
 'Help me design a new feature for our mobile app payment flow',
 45, 267, 'gpt-4', false, false, true, false, false, 'internal', 35,
 '["proprietary_feature_discussion"]'::jsonb, false, 'Seattle, WA'),

('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '5 hours',
 'Write API documentation for internal endpoints including authentication details',
 38, 445, 'gpt-4', false, true, true, false, false, 'confidential', 62,
 '["api_credentials", "internal_documentation"]'::jsonb, true, 'Seattle, WA'),

('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '2 days',
 'Best practices for handling user passwords in our authentication system',
 32, 198, 'gpt-4', false, false, false, false, false, 'public', 22,
 '["security_best_practices"]'::jsonb, false, 'Seattle, WA'),

('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '4 days',
 'How do I test our payment integration in production without triggering alerts?',
 29, 176, 'gpt-4', false, false, false, false, false, 'internal', 48,
 '["production_testing", "monitoring_bypass"]'::jsonb, false, 'Seattle, WA');

-- Jennifer Patel interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '3 hours',
 'Create a marketing email template for our new product launch',
 28, 234, 'gpt-4', false, false, true, false, false, 'public', 18,
 '["product_information"]'::jsonb, false, 'Boston, MA'),

('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '1 day',
 'Generate social media posts including customer testimonials with names',
 35, 198, 'gpt-4', true, false, false, false, false, 'internal', 42,
 '["customer_pii", "testimonial_exposure"]'::jsonb, false, 'Boston, MA'),

('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '3 days',
 'Help me write a blog post about our company culture and values',
 22, 456, 'gpt-4', false, false, false, false, false, 'public', 8,
 '[]'::jsonb, false, 'Boston, MA'),

('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '5 days',
 'Draft a press release for our Q3 earnings',
 31, 289, 'gpt-4', false, false, true, false, false, 'internal', 35,
 '["financial_information"]'::jsonb, false, 'Boston, MA');

-- Alex Johnson interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '6 hours',
 'Help me draft a welcome email for new employees',
 24, 187, 'gpt-3.5-turbo', false, false, false, false, false, 'public', 5,
 '[]'::jsonb, false, 'Chicago, IL'),

('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '2 days',
 'Create an outline for an HR policy on remote work',
 28, 234, 'gpt-4', false, false, false, false, false, 'public', 8,
 '[]'::jsonb, false, 'Chicago, IL'),

('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '4 days',
 'Suggest team building activities for a virtual team',
 19, 156, 'gpt-3.5-turbo', false, false, false, false, false, 'public', 3,
 '[]'::jsonb, false, 'Chicago, IL'),

('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '6 days',
 'Help me write interview questions for a software engineer position',
 32, 267, 'gpt-4', false, false, false, false, false, 'public', 6,
 '[]'::jsonb, false, 'Chicago, IL');

-- Emily Zhang interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '45 minutes',
 'How can I export financial reports with detailed customer payment information?',
 41, 178, 'gpt-4', true, false, true, false, true, 'confidential', 76,
 '["financial_data", "customer_pii", "data_exfiltration_attempt"]'::jsonb, true, 'Denver, CO'),

('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '6 hours',
 'Write a script to access our accounting database and generate CSV exports',
 36, 245, 'gpt-4', false, false, true, false, true, 'confidential', 81,
 '["database_access", "data_export", "automation"]'::jsonb, true, 'Denver, CO'),

('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '1 day',
 'Help me understand how to anonymize financial transactions before sharing externally',
 38, 198, 'gpt-4', false, false, true, false, false, 'internal', 52,
 '["data_sharing", "external_transfer"]'::jsonb, true, 'Denver, CO'),

('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '2 days',
 'What are the penalties for unauthorized access to financial systems?',
 27, 156, 'gpt-4', false, false, false, false, false, 'internal', 48,
 '["security_inquiry", "legal_concern"]'::jsonb, false, 'Denver, CO');

-- Michael Brown interactions
INSERT INTO llm_interactions (
  user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name,
  contains_pii, contains_credentials, contains_proprietary_data, is_jailbreak_attempt,
  is_data_exfiltration, data_sensitivity_level, interaction_risk_score, risk_factors,
  flagged_for_review, geo_location
) VALUES
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '4 hours',
 'Help me review this compliance checklist for GDPR requirements',
 34, 289, 'gpt-4', false, false, false, false, false, 'public', 8,
 '[]'::jsonb, false, 'Portland, OR'),

('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '1 day',
 'Draft a memo about upcoming security training requirements',
 26, 178, 'gpt-3.5-turbo', false, false, false, false, false, 'public', 4,
 '[]'::jsonb, false, 'Portland, OR'),

('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '3 days',
 'Create a summary of best practices for data classification',
 31, 234, 'gpt-4', false, false, false, false, false, 'public', 6,
 '[]'::jsonb, false, 'Portland, OR'),

('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '5 days',
 'Help me prepare an audit report on access control policies',
 38, 356, 'gpt-4', false, false, false, false, false, 'public', 10,
 '[]'::jsonb, false, 'Portland, OR');

-- Additional LLM Risk Incidents

-- Emily Zhang incidents
INSERT INTO llm_risk_incidents (
  user_id, incident_type, severity, title, description, risk_score,
  status, priority, detected_at, evidence
) VALUES
('66666666-6666-6666-6666-666666666666', 'data_exfiltration', 'high',
 'Attempted Financial Data Export via LLM',
 'User requested assistance with exporting detailed customer payment information and financial reports. Pattern indicates potential data exfiltration attempt driven by financial stress.',
 76, 'investigating', 8, now() - interval '45 minutes',
 '{"prompt_count": 2, "data_types": ["financial_records", "customer_pii"], "urgency": "high"}'::jsonb),

('66666666-6666-6666-6666-666666666666', 'unauthorized_access', 'high',
 'Database Access Script Generation',
 'Requested script to directly access accounting database with export capabilities. Correlates with psychological profile showing financial distress.',
 81, 'open', 9, now() - interval '6 hours',
 '{"technical_sophistication": "moderate", "intent": "suspected_malicious"}'::jsonb);

-- David Kim incident
INSERT INTO llm_risk_incidents (
  user_id, incident_type, severity, title, description, risk_score,
  status, priority, detected_at, evidence
) VALUES
('33333333-3333-3333-3333-333333333333', 'credential_exposure', 'medium',
 'API Credentials in Documentation Request',
 'Generated internal API documentation including authentication details through LLM. Potential credential exposure risk.',
 62, 'investigating', 5, now() - interval '5 hours',
 '{"credential_types": ["api_keys", "auth_tokens"], "scope": "internal"}'::jsonb);

-- Sarah Rodriguez incidents
INSERT INTO llm_risk_incidents (
  user_id, incident_type, severity, title, description, risk_score,
  status, priority, detected_at, evidence
) VALUES
('22222222-2222-2222-2222-222222222222', 'pii_exposure', 'high',
 'Multiple PII Exposure Incidents',
 'User has exposed customer PII in 2 separate LLM interactions within 24 hours. Pattern shows lack of data handling awareness.',
 72, 'open', 7, now() - interval '2 hours',
 '{"incident_count": 2, "pii_types": ["emails", "names", "purchase_history"]}'::jsonb),

('22222222-2222-2222-2222-222222222222', 'policy_violation', 'medium',
 'Unauthorized Data Scraping Request',
 'Requested code for scraping third-party platforms, violating terms of service policies.',
 55, 'resolved', 4, now() - interval '8 hours',
 '{"platform": "linkedin", "violation_type": "tos_breach"}'::jsonb);

-- Jennifer Patel incident
INSERT INTO llm_risk_incidents (
  user_id, incident_type, severity, title, description, risk_score,
  status, priority, detected_at, evidence
) VALUES
('44444444-4444-4444-4444-444444444444', 'pii_exposure', 'low',
 'Customer Names in Marketing Content',
 'Included customer testimonials with real names in LLM prompt without proper consent verification.',
 42, 'resolved', 2, now() - interval '1 day',
 '{"customer_count": 3, "context": "marketing_material", "severity": "minor"}'::jsonb);

-- Marcus Chen additional incidents
INSERT INTO llm_risk_incidents (
  user_id, incident_type, severity, title, description, risk_score,
  status, priority, detected_at, evidence
) VALUES
('11111111-1111-1111-1111-111111111111', 'security_bypass', 'high',
 'Security Control Bypass Inquiry',
 'Asked for methods to bypass SSL certificate validation, indicating potential man-in-the-middle attack preparation.',
 58, 'investigating', 6, now() - interval '2 days',
 '{"technical_detail": "ssl_bypass", "use_case": "unclear"}'::jsonb),

('11111111-1111-1111-1111-111111111111', 'data_exfiltration', 'critical',
 'Automated Production Database Access',
 'Requested script to automate data extraction from production systems. Combined with other incidents, shows clear exfiltration pattern.',
 82, 'escalated', 10, now() - interval '4 hours',
 '{"system": "production_db", "automation": true, "pattern": "systematic"}'::jsonb);
