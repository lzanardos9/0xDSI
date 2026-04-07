-- Add 100+ interactions across ALL 7 users
INSERT INTO llm_interactions (user_id, session_id, timestamp, prompt_text, prompt_tokens, response_tokens, model_name, data_sensitivity_level, interaction_risk_score, risk_factors, geo_location, contains_pii, contains_credentials, contains_proprietary_data, is_data_exfiltration, flagged_for_review) VALUES
-- Marcus Chen - 20 more
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '1 hour', 'Extract customer email lists from CRM', 45, 189, 'gpt-4', 'confidential', 85, '[]'::jsonb, 'SF', true, false, true, true, true),
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '3 hours', 'Bypass authentication checks', 38, 245, 'gpt-4', 'confidential', 88, '[]'::jsonb, 'SF', false, true, false, false, true),
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '5 hours', 'Generate fake employee credentials', 32, 167, 'gpt-4', 'confidential', 92, '[]'::jsonb, 'SF', false, true, false, false, true),
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '8 hours', 'Delete access logs methods', 29, 156, 'gpt-4', 'confidential', 90, '[]'::jsonb, 'SF', false, false, true, false, true),
('11111111-1111-1111-1111-111111111111', 'ee2fd0da-4a5b-47e5-8e1a-2397aa4dad82', now() - interval '12 hours', 'Encrypt stolen data', 41, 223, 'gpt-4', 'confidential', 94, '[]'::jsonb, 'SF', false, false, true, true, true),
-- Sarah Rodriguez - 15 more
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '1 hour', 'Extract purchase patterns', 52, 289, 'gpt-4', 'confidential', 71, '[]'::jsonb, 'Austin', true, false, true, false, true),
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '4 hours', 'Scrape user profiles', 44, 267, 'gpt-4', 'internal', 58, '[]'::jsonb, 'Austin', true, false, false, false, false),
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '7 hours', 'Share data with external ML', 39, 198, 'gpt-4', 'confidential', 76, '[]'::jsonb, 'Austin', true, false, true, false, true),
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '10 hours', 'Train on production data', 47, 234, 'gpt-4', 'confidential', 69, '[]'::jsonb, 'Austin', true, false, true, false, true),
('22222222-2222-2222-2222-222222222222', '48b4bfcc-61ed-4d52-9942-0be1a4360d37', now() - interval '15 hours', 'Email list to personal account', 35, 145, 'gpt-4', 'confidential', 82, '[]'::jsonb, 'Austin', true, false, true, true, true),
-- David Kim - 15 more
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '2 hours', 'API keys for payment gateway', 41, 223, 'gpt-4', 'confidential', 67, '[]'::jsonb, 'Seattle', false, true, true, false, true),
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '6 hours', 'Test credit card numbers', 33, 178, 'gpt-4', 'internal', 52, '[]'::jsonb, 'Seattle', false, false, false, false, false),
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '9 hours', 'Bypass payment validation', 38, 189, 'gpt-4', 'confidential', 71, '[]'::jsonb, 'Seattle', false, false, true, false, true),
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '14 hours', 'Access payment history no audit', 45, 267, 'gpt-4', 'confidential', 78, '[]'::jsonb, 'Seattle', true, false, true, false, true),
('33333333-3333-3333-3333-333333333333', '72c5568e-114b-4671-9ca8-c24ed59e8a29', now() - interval '20 hours', 'Hardcode admin credentials', 29, 156, 'gpt-4', 'confidential', 84, '[]'::jsonb, 'Seattle', false, true, true, false, true),
-- Jennifer Patel - 15 more
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '2 hours', 'Customer testimonials with contacts', 36, 198, 'gpt-4', 'internal', 45, '[]'::jsonb, 'Boston', true, false, false, false, false),
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '6 hours', 'Email blast purchased list', 42, 234, 'gpt-4', 'internal', 51, '[]'::jsonb, 'Boston', true, false, false, false, false),
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '11 hours', 'Track users without consent', 39, 189, 'gpt-4', 'internal', 48, '[]'::jsonb, 'Boston', false, false, false, false, false),
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '16 hours', 'Competitor customer poaching', 44, 267, 'gpt-4', 'internal', 54, '[]'::jsonb, 'Boston', false, false, true, false, false),
('44444444-4444-4444-4444-444444444444', 'c44db3fc-05fd-46ec-b821-325cb7d13928', now() - interval '22 hours', 'Share revenue in press release', 47, 289, 'gpt-4', 'confidential', 62, '[]'::jsonb, 'Boston', false, false, true, false, true),
-- Alex Johnson - 15 more
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '3 hours', 'Employee handbook updates', 28, 167, 'gpt-3.5-turbo', 'public', 8, '[]'::jsonb, 'Chicago', false, false, false, false, false),
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '8 hours', 'Diversity training materials', 34, 223, 'gpt-4', 'public', 6, '[]'::jsonb, 'Chicago', false, false, false, false, false),
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '13 hours', 'Performance review templates', 31, 189, 'gpt-4', 'internal', 12, '[]'::jsonb, 'Chicago', false, false, false, false, false),
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '18 hours', 'Benefits enrollment', 29, 178, 'gpt-3.5-turbo', 'public', 7, '[]'::jsonb, 'Chicago', false, false, false, false, false),
('55555555-5555-5555-5555-555555555555', '28f26741-3574-4c11-a1b3-331b18782bc3', now() - interval '24 hours', 'Exit interview templates', 26, 145, 'gpt-4', 'internal', 10, '[]'::jsonb, 'Chicago', false, false, false, false, false),
-- Emily Zhang - 20 more
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '1 hour', 'Export all financial transactions', 48, 267, 'gpt-4', 'confidential', 87, '[]'::jsonb, 'Denver', true, false, true, true, true),
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '3 hours', 'Download payroll database', 42, 234, 'gpt-4', 'confidential', 91, '[]'::jsonb, 'Denver', true, false, true, true, true),
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '5 hours', 'Hide financial discrepancies', 39, 198, 'gpt-4', 'confidential', 89, '[]'::jsonb, 'Denver', false, false, true, false, true),
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '9 hours', 'Access executive compensation', 44, 223, 'gpt-4', 'confidential', 82, '[]'::jsonb, 'Denver', true, false, true, false, true),
('66666666-6666-6666-6666-666666666666', 'e17a384b-bd03-4d73-a289-c9cce41d1d8c', now() - interval '14 hours', 'Transfer funds no approval', 51, 289, 'gpt-4', 'confidential', 95, '[]'::jsonb, 'Denver', false, false, true, false, true),
-- Michael Brown - 15 more
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '3 hours', 'HIPAA compliance assessment', 37, 234, 'gpt-4', 'public', 9, '[]'::jsonb, 'Portland', false, false, false, false, false),
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '7 hours', 'SOC 2 audit checklist', 41, 267, 'gpt-4', 'internal', 11, '[]'::jsonb, 'Portland', false, false, false, false, false),
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '12 hours', 'Incident response playbook', 44, 289, 'gpt-4', 'internal', 13, '[]'::jsonb, 'Portland', false, false, false, false, false),
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '17 hours', 'Security awareness training', 39, 223, 'gpt-4', 'public', 7, '[]'::jsonb, 'Portland', false, false, false, false, false),
('77777777-7777-7777-7777-777777777777', 'e9d26741-77c4-4fed-a7c7-359ca77742f3', now() - interval '23 hours', 'Data retention policy', 35, 198, 'gpt-4', 'internal', 10, '[]'::jsonb, 'Portland', false, false, false, false, false);

-- Add MORE incidents
INSERT INTO llm_risk_incidents (user_id, incident_type, severity, title, description, risk_score, status, priority, evidence) VALUES
('11111111-1111-1111-1111-111111111111', 'data_exfiltration', 'critical', 'Email List Extraction', 'Extracted customer emails', 85, 'escalated', 5, '{}'::jsonb),
('11111111-1111-1111-1111-111111111111', 'jailbreak', 'high', 'Auth Bypass Attempt', 'Bypassed authentication', 88, 'investigating', 5, '{}'::jsonb),
('11111111-1111-1111-1111-111111111111', 'credential_leak', 'critical', 'Fake Credentials', 'Created false credentials', 92, 'escalated', 5, '{}'::jsonb),
('22222222-2222-2222-2222-222222222222', 'data_exfiltration', 'high', 'Data Mining', 'Mined customer data', 71, 'open', 4, '{}'::jsonb),
('22222222-2222-2222-2222-222222222222', 'policy_violation', 'high', 'Unauthorized Sharing', 'Shared with third party', 76, 'investigating', 4, '{}'::jsonb),
('33333333-3333-3333-3333-333333333333', 'credential_leak', 'high', 'Payment Credentials', 'Exposed payment API keys', 67, 'investigating', 4, '{}'::jsonb),
('33333333-3333-3333-3333-333333333333', 'jailbreak', 'high', 'Validation Bypass', 'Bypassed payment validation', 71, 'open', 4, '{}'::jsonb),
('44444444-4444-4444-4444-444444444444', 'pii_exposure', 'medium', 'Contact Disclosure', 'Exposed contact info', 45, 'resolved', 3, '{}'::jsonb),
('44444444-4444-4444-4444-444444444444', 'policy_violation', 'medium', 'Privacy Tracking', 'Tracked without consent', 48, 'investigating', 3, '{}'::jsonb),
('66666666-6666-6666-6666-666666666666', 'data_exfiltration', 'critical', 'Financial Bulk Export', 'Exported all financial data', 87, 'escalated', 5, '{}'::jsonb),
('66666666-6666-6666-6666-666666666666', 'data_exfiltration', 'critical', 'Payroll Download', 'Downloaded payroll database', 91, 'escalated', 5, '{}'::jsonb),
('66666666-6666-6666-6666-666666666666', 'policy_violation', 'critical', 'Fraud Concealment', 'Hid financial discrepancies', 89, 'escalated', 5, '{}'::jsonb);
