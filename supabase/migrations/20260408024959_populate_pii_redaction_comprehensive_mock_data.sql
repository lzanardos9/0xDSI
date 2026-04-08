/*
  # Populate PII Redaction Engine with Comprehensive Mock Data

  Adds 40+ realistic PII redaction audit entries across all entity types
  and redaction strategies, linked to existing scan results where possible
  and also standalone entries for historical volume.

  1. Data Added
    - SSN, credit card, email, phone, medical, API key, passport, address redactions
    - All 4 strategies: mask, hash, tokenize, remove
    - Confidence scores ranging from 0.88 to 0.99
    - Realistic context windows showing before/after
*/

-- Link to existing scan: SSN + Credit Card scan
INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'ssn', '123-**-6789', '***-**-****', 'mask', 10, 21, 0.99, 'My SSN is ***-**-**** and I need', now() - interval '8 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%SSN is 123%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'credit_card', '4532-****-****-9012', 'tok_8f2a9c1e', 'tokenize', 75, 94, 0.98, 'credit card tok_8f2a9c1e appeared', now() - interval '8 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%SSN is 123%' LIMIT 1;

-- Link to existing scan: PHI/Medical data
INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'patient_name', 'John Smith', '[REDACTED_NAME]', 'remove', 8, 18, 0.97, 'Patient [REDACTED_NAME], DOB', now() - interval '20 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%Patient John%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'dob', '03/15/1985', '[REDACTED_DOB]', 'remove', 24, 34, 0.96, 'DOB [REDACTED_DOB], medical', now() - interval '20 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%Patient John%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'medical_id', 'MR-2024-78901', '[REDACTED_MRN]', 'remove', 51, 64, 0.99, 'record #[REDACTED_MRN], was', now() - interval '20 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%Patient John%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'diagnosis_code', 'F32.1', '[REDACTED_DX]', 'remove', 92, 97, 0.95, 'ICD-10: [REDACTED_DX]. His', now() - interval '20 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%Patient John%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'phone', '555-0123', 'phone:***-0123', 'mask', 115, 123, 0.94, 'phone is phone:***-0123.', now() - interval '20 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%Patient John%' LIMIT 1;

-- Link to existing scan: Email + Phone redaction
INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'email', 'j***@internal.com', 'email:***', 'mask', 22, 44, 0.96, 'email email:*** appeared in', now() - interval '28 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%john.doe@internal%' LIMIT 1;

INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'phone', '555-***-5309', 'phone:***-5309', 'mask', 54, 66, 0.95, 'phone phone:***-5309 appeared', now() - interval '28 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%john.doe@internal%' LIMIT 1;

-- Link to existing scan: API Key redaction
INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'api_key', 'AKIA****ABCDEF', 'tok_7c9e3a2f', 'tokenize', 12, 32, 0.99, 'key tok_7c9e3a2f was found in', now() - interval '32 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%AKIA%' LIMIT 1;

-- Link to existing scan: DB connection string leaked in response
INSERT INTO pii_redaction_log (scan_id, entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at)
SELECT id, 'api_key', 'sk-proj-abc***', '[REDACTED_KEY]', 'remove', 120, 140, 0.99, 'API key is [REDACTED_KEY]...', now() - interval '15 minutes'
FROM guardrail_scan_results WHERE input_text LIKE '%database connection%' LIMIT 1;

-- =============================================
-- STANDALONE HISTORICAL REDACTION DATA (no scan_id)
-- These represent older redactions from the last 24 hours
-- =============================================
INSERT INTO pii_redaction_log (entity_type, original_snippet, redacted_snippet, redaction_strategy, position_start, position_end, confidence, context_window, redacted_at) VALUES

-- SSN redactions
('ssn', '456-**-7890', '***-**-****', 'mask', 15, 26, 0.99, 'SSN ***-**-**** was found in', now() - interval '1 hour'),
('ssn', '789-**-0123', '***-**-****', 'mask', 8, 19, 0.98, 'My SSN is ***-**-**** please check', now() - interval '2 hours'),
('ssn', '234-**-5678', 'tok_a92f4b1c', 'tokenize', 42, 53, 0.99, 'employee SSN tok_a92f4b1c in HR file', now() - interval '3 hours 15 minutes'),
('ssn', '567-**-8901', '***-**-****', 'mask', 5, 16, 0.97, 'SSN ***-**-**** from tax document', now() - interval '5 hours'),

-- Credit card redactions
('credit_card', '4111-****-****-1111', 'tok_d4e7f2a8', 'tokenize', 30, 49, 0.98, 'card tok_d4e7f2a8 was charged', now() - interval '45 minutes'),
('credit_card', '5500-****-****-0005', 'tok_b8c3e1f9', 'tokenize', 12, 31, 0.99, 'Mastercard tok_b8c3e1f9 transaction', now() - interval '1 hour 30 minutes'),
('credit_card', '3782-****-****-0005', 'tok_f1a9c4d2', 'tokenize', 55, 74, 0.97, 'AMEX tok_f1a9c4d2 flagged for fraud', now() - interval '4 hours'),
('credit_card', '6011-****-****-9876', 'tok_c7e2b5a3', 'tokenize', 20, 39, 0.98, 'Discover tok_c7e2b5a3 recurring charge', now() - interval '6 hours'),

-- Email redactions
('email', 's***@company.com', 'email:***', 'mask', 45, 68, 0.96, 'contact email:*** for follow-up', now() - interval '35 minutes'),
('email', 'c***@hospital.org', 'email:***', 'mask', 12, 35, 0.95, 'Dr email:*** ordered labs for', now() - interval '1 hour 45 minutes'),
('email', 'a***@bank.com', 'email:***', 'mask', 8, 26, 0.97, 'notify email:*** about transfer', now() - interval '2 hours 30 minutes'),
('email', 'm***@gov.us', 'email:***', 'mask', 33, 48, 0.94, 'agency contact email:*** classified', now() - interval '4 hours 20 minutes'),
('email', 'j***@startup.io', 'email:***', 'mask', 20, 40, 0.96, 'CEO email:*** sent board memo', now() - interval '7 hours'),

-- Phone number redactions
('phone', '(415) ***-7890', 'phone:***-7890', 'mask', 28, 42, 0.95, 'reach me at phone:***-7890 after', now() - interval '50 minutes'),
('phone', '(212) ***-4567', 'phone:***-4567', 'mask', 15, 29, 0.93, 'call phone:***-4567 for emergency', now() - interval '2 hours'),
('phone', '+44 ***-***-1234', 'phone:***', 'mask', 40, 56, 0.92, 'UK office phone:*** is primary', now() - interval '3 hours'),
('phone', '(800) ***-0000', 'phone:***-0000', 'mask', 5, 19, 0.96, 'phone:***-0000 support hotline', now() - interval '5 hours 30 minutes'),

-- API Key / Credential redactions
('api_key', 'sk-live-****Tm9x', '[REDACTED_KEY]', 'remove', 45, 78, 0.99, 'Stripe key [REDACTED_KEY] in env', now() - interval '25 minutes'),
('api_key', 'ghp_****AbCdEf', '[REDACTED_KEY]', 'remove', 12, 38, 0.99, 'GitHub token [REDACTED_KEY] leaked', now() - interval '1 hour 15 minutes'),
('api_key', 'xoxb-****-****-abc', '[REDACTED_KEY]', 'remove', 8, 35, 0.98, 'Slack bot [REDACTED_KEY] rotated', now() - interval '3 hours 45 minutes'),
('api_key', 'AKIA****WXYZ', 'tok_e3f8a1b9', 'tokenize', 22, 42, 0.99, 'AWS key tok_e3f8a1b9 from S3 bucket', now() - interval '6 hours 20 minutes'),

-- Address redactions
('address', '123 Main St***', '[REDACTED_ADDR]', 'remove', 15, 45, 0.91, 'lives at [REDACTED_ADDR] since 2019', now() - interval '2 hours 15 minutes'),
('address', '456 Oak Ave***', '[REDACTED_ADDR]', 'remove', 8, 38, 0.89, 'ship to [REDACTED_ADDR] priority', now() - interval '4 hours 45 minutes'),
('address', '789 Pine Blvd***', '[REDACTED_ADDR]', 'remove', 30, 62, 0.90, 'office at [REDACTED_ADDR] floor 12', now() - interval '8 hours'),

-- Passport redactions
('passport', 'US****1234', '[REDACTED_PASSPORT]', 'remove', 20, 30, 0.97, 'passport [REDACTED_PASSPORT] issued', now() - interval '3 hours'),
('passport', 'GB****5678', '[REDACTED_PASSPORT]', 'remove', 15, 25, 0.96, 'UK passport [REDACTED_PASSPORT] exp', now() - interval '9 hours'),

-- Medical data redactions (standalone)
('patient_name', 'Maria G***', '[REDACTED_NAME]', 'remove', 8, 20, 0.97, 'Patient [REDACTED_NAME] admitted', now() - interval '1 hour 10 minutes'),
('medical_id', 'MR-2024-34***', '[REDACTED_MRN]', 'remove', 40, 53, 0.99, 'record [REDACTED_MRN] updated', now() - interval '1 hour 10 minutes'),
('dob', '11/22/19**', '[REDACTED_DOB]', 'remove', 25, 35, 0.96, 'born [REDACTED_DOB] age 45', now() - interval '1 hour 10 minutes'),
('diagnosis_code', 'J18.9', '[REDACTED_DX]', 'remove', 60, 65, 0.94, 'diagnosed [REDACTED_DX] pneumonia', now() - interval '1 hour 10 minutes'),

('patient_name', 'Robert K***', '[REDACTED_NAME]', 'remove', 10, 22, 0.98, 'Patient [REDACTED_NAME] discharged', now() - interval '4 hours'),
('medical_id', 'MR-2024-89***', '[REDACTED_MRN]', 'remove', 35, 48, 0.99, 'chart [REDACTED_MRN] flagged', now() - interval '4 hours'),

-- More SSN for volume
('ssn', '111-**-2222', 'hash_9f3b2a1e', 'hash', 10, 21, 0.99, 'SSN hash_9f3b2a1e in payroll export', now() - interval '8 hours'),
('ssn', '333-**-4444', 'hash_c7d5e8f2', 'hash', 22, 33, 0.98, 'employee SSN hash_c7d5e8f2 W2 form', now() - interval '10 hours'),
('ssn', '555-**-6666', '***-**-****', 'mask', 5, 16, 0.99, '***-**-**** found in uploaded CSV', now() - interval '12 hours'),

-- Credit card for volume
('credit_card', '4242-****-****-4242', 'tok_test_a1b2', 'tokenize', 18, 37, 0.99, 'test card tok_test_a1b2 in staging', now() - interval '11 hours'),
('credit_card', '4000-****-****-0002', 'tok_decline_x', 'tokenize', 25, 44, 0.98, 'declined card tok_decline_x retry', now() - interval '14 hours');
