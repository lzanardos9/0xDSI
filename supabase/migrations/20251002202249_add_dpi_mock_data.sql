/*
  # Add Mock Data for DPI and DLP System

  1. Mock Data Overview
    - Active network flows with various content types
    - Packet captures showing data in transit
    - DLP detections with risk classifications
    - Realistic scenarios: email transfers, file uploads, data exfiltration attempts

  2. Scenarios Covered
    - **Email with PII**: Employee sending email with SSN/credit card info
    - **Large File Transfer**: Database backup being exfiltrated
    - **Image Upload**: User uploading screenshots to cloud storage
    - **Video Streaming**: Internal video conference recording
    - **Document Transfer**: Confidential contract being emailed externally
    - **Malicious Activity**: Encrypted data being sent to suspicious IP
    - **Normal Traffic**: Regular HTTP/HTTPS web browsing

  3. DLP Risk Levels
    - Critical: PII leak, confidential data exfiltration, malware
    - High: Policy violations, unauthorized transfers
    - Medium: Suspicious patterns, compliance concerns
    - Low: Normal business operations with monitoring

  4. Content Types
    - Email (SMTP), Images (JPEG/PNG), Videos (MP4)
    - Documents (PDF/DOCX), Compressed files (ZIP)
    - Database backups, Encrypted payloads
*/

-- ============================================================================
-- Mock DPI Flows
-- ============================================================================

INSERT INTO dpi_flows (flow_id, source_ip, destination_ip, source_zone, destination_zone, protocol, total_packets, total_bytes, start_time, status, content_summary)
VALUES
  -- Email with PII (Critical Risk)
  ('FLOW-001', '10.30.11.100', '10.1.0.40', 'Office', 'DMZ', 'SMTP', 47, 125840, NOW() - INTERVAL '2 minutes', 'active', 
   '{"content_type": "email", "subject": "Customer Database Export", "attachments": ["customers.csv"], "has_sensitive_data": true}'::jsonb),
  
  -- Database Backup Exfiltration (Critical Risk)
  ('FLOW-002', '10.10.2.10', '203.0.113.50', 'Production', 'External', 'HTTPS', 1523, 52428800, NOW() - INTERVAL '5 minutes', 'blocked',
   '{"content_type": "compressed", "filename": "prod_backup_2025.zip", "contains": "database dump", "encryption": false}'::jsonb),
  
  -- Image Upload to Cloud (Medium Risk)
  ('FLOW-003', '10.30.10.50', '10.1.0.30', 'Office', 'DMZ', 'HTTPS', 234, 4194304, NOW() - INTERVAL '1 minute', 'active',
   '{"content_type": "image", "files": ["screenshot_dashboard.png", "network_diagram.jpg"], "cloud_service": "AWS S3"}'::jsonb),
  
  -- Video Conference Recording (Low Risk)
  ('FLOW-004', '10.20.5.30', '10.10.3.10', 'Internal', 'Production', 'HTTP', 3421, 157286400, NOW() - INTERVAL '8 minutes', 'completed',
   '{"content_type": "video", "format": "MP4", "duration_seconds": 1800, "resolution": "1920x1080"}'::jsonb),
  
  -- Confidential Contract (High Risk)
  ('FLOW-005', '10.30.10.51', '203.0.113.75', 'Office', 'External', 'SMTP', 89, 2097152, NOW() - INTERVAL '30 seconds', 'active',
   '{"content_type": "document", "filename": "Merger_Agreement_CONFIDENTIAL.pdf", "classification": "confidential"}'::jsonb),
  
  -- Encrypted Suspicious Transfer (Critical Risk)
  ('FLOW-006', '10.10.1.12', '185.220.101.42', 'Production', 'External', 'TCP', 892, 10485760, NOW() - INTERVAL '3 minutes', 'blocked',
   '{"content_type": "encrypted", "encryption_type": "AES-256", "destination_reputation": "suspicious", "tor_exit_node": true}'::jsonb),
  
  -- Normal Web Browsing (Low Risk)
  ('FLOW-007', '10.30.11.101', '10.1.0.20', 'Office', 'DMZ', 'HTTPS', 145, 524288, NOW() - INTERVAL '10 seconds', 'active',
   '{"content_type": "http", "domain": "github.com", "page": "/trending", "user_agent": "Mozilla/5.0"}'::jsonb);

-- ============================================================================
-- Mock Packet Captures
-- ============================================================================

-- FLOW-001: Email with PII
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '2 minutes', '10.30.11.100', '10.1.0.40', 49523, 25, 'SMTP', 1420, 'email', 
   '{"from": "john.smith@company.com", "to": "external@partner.com", "subject": "Customer Database Export", "body_preview": "Please find attached customer list with contact details...", "attachment_name": "customers.csv", "attachment_size": 124000}'::jsonb, 
   'FLOW-001', 'completed'),
  (NOW() - INTERVAL '115 seconds', '10.30.11.100', '10.1.0.40', 49523, 25, 'SMTP', 8192, 'email',
   '{"chunk": 1, "total_chunks": 16, "contains": ["SSN: 123-45-6789", "SSN: 987-65-4321", "Credit Card: 4532-****-****-1234"]}'::jsonb,
   'FLOW-001', 'completed'),
  (NOW() - INTERVAL '110 seconds', '10.30.11.100', '10.1.0.40', 49523, 25, 'SMTP', 8192, 'email',
   '{"chunk": 2, "total_chunks": 16, "contains": ["email@domain.com", "phone: 555-0123"]}'::jsonb,
   'FLOW-001', 'completed');

-- FLOW-002: Database Backup Exfiltration
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '5 minutes', '10.10.2.10', '203.0.113.50', 52341, 443, 'HTTPS', 1460, 'compressed',
   '{"filename": "prod_backup_2025.zip", "compression": "zip", "encrypted": false, "size_bytes": 52428800}'::jsonb,
   'FLOW-002', 'completed'),
  (NOW() - INTERVAL '290 seconds', '10.10.2.10', '203.0.113.50', 52341, 443, 'HTTPS', 1460, 'compressed',
   '{"chunk": 1, "contains_tables": ["users", "payments", "transactions", "customer_data"]}'::jsonb,
   'FLOW-002', 'completed');

-- FLOW-003: Image Upload
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '1 minute', '10.30.10.50', '10.1.0.30', 51234, 443, 'HTTPS', 1460, 'image',
   '{"filename": "screenshot_dashboard.png", "format": "PNG", "resolution": "2560x1440", "size_bytes": 2894562, "contains_text": true}'::jsonb,
   'FLOW-003', 'completed'),
  (NOW() - INTERVAL '55 seconds', '10.30.10.50', '10.1.0.30', 51234, 443, 'HTTPS', 1460, 'image',
   '{"filename": "network_diagram.jpg", "format": "JPEG", "resolution": "1920x1080", "size_bytes": 1299742, "metadata": {"camera": "iPhone", "location": "Office"}}'::jsonb,
   'FLOW-003', 'completed');

-- FLOW-004: Video Conference Recording
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '8 minutes', '10.20.5.30', '10.10.3.10', 48123, 80, 'HTTP', 1460, 'video',
   '{"filename": "board_meeting_2025.mp4", "codec": "H.264", "duration_seconds": 1800, "resolution": "1920x1080", "bitrate": "8 Mbps"}'::jsonb,
   'FLOW-004', 'completed');

-- FLOW-005: Confidential Contract
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '30 seconds', '10.30.10.51', '203.0.113.75', 49876, 25, 'SMTP', 1460, 'document',
   '{"filename": "Merger_Agreement_CONFIDENTIAL.pdf", "format": "PDF", "pages": 45, "classification_header": "CONFIDENTIAL - DO NOT DISTRIBUTE", "contains_keywords": ["merger", "acquisition", "$50M", "trade secret"]}'::jsonb,
   'FLOW-005', 'reconstructing');

-- FLOW-006: Encrypted Suspicious Transfer
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '3 minutes', '10.10.1.12', '185.220.101.42', 54321, 9001, 'TCP', 1460, 'encrypted',
   '{"encryption": "AES-256", "size_bytes": 10485760, "entropy_score": 7.99, "suspicious_indicators": ["tor_network", "unknown_destination", "off_hours_transfer"]}'::jsonb,
   'FLOW-006', 'completed');

-- FLOW-007: Normal Web Browsing
INSERT INTO packet_captures (capture_time, source_ip, destination_ip, source_port, destination_port, protocol, packet_size, content_type, reconstructed_content, flow_id, status)
VALUES
  (NOW() - INTERVAL '10 seconds', '10.30.11.101', '10.1.0.20', 50123, 443, 'HTTPS', 1460, 'http',
   '{"domain": "github.com", "path": "/trending", "method": "GET", "tls_version": "1.3", "user_agent": "Mozilla/5.0"}'::jsonb,
   'FLOW-007', 'completed');

-- ============================================================================
-- Mock DLP Detections
-- ============================================================================

-- Critical: Email with PII
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id, 
  'FLOW-001', 
  'critical', 
  'pii_leak',
  ARRAY['SSN', 'Credit Card Number', 'Personal Email'],
  'Personally Identifiable Information (PII)',
  'alert',
  98.5,
  '{"patterns_found": {"ssn_count": 2, "credit_card_count": 1, "email_count": 45}, "compliance_impact": ["GDPR", "PCI-DSS", "HIPAA"], "recipient_external": true, "recommendation": "Block and quarantine immediately"}'::jsonb,
  NOW() - INTERVAL '110 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-001' AND content_type = 'email' LIMIT 1;

-- Critical: Database Exfiltration
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id,
  'FLOW-002',
  'critical',
  'data_exfiltration',
  ARRAY['Database Backup', 'Customer Records', 'Payment Data'],
  'Confidential Database Export',
  'block',
  99.8,
  '{"tables_detected": ["users", "payments", "transactions"], "record_count_estimate": 500000, "destination_reputation": "unknown", "size_anomaly": true, "recommendation": "Blocked - Investigate immediately"}'::jsonb,
  NOW() - INTERVAL '290 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-002' LIMIT 1;

-- Medium: Image Upload with Sensitive Content
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id,
  'FLOW-003',
  'medium',
  'policy_violation',
  ARRAY['Dashboard Screenshot', 'Network Diagram', 'Internal IP Addresses'],
  'Proprietary Technical Information',
  'alert',
  76.3,
  '{"ocr_detected": ["internal IPs", "server names", "architecture diagram"], "cloud_destination": "AWS S3", "user_authorized": true, "recommendation": "Monitor and log"}'::jsonb,
  NOW() - INTERVAL '55 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-003' AND reconstructed_content->>'filename' = 'screenshot_dashboard.png';

-- High: Confidential Document to External Party
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id,
  'FLOW-005',
  'high',
  'confidential_data',
  ARRAY['Merger Agreement', 'Trade Secret', 'Financial Terms'],
  'Confidential Legal Document',
  'quarantine',
  94.2,
  '{"document_classification": "CONFIDENTIAL", "keywords": ["merger", "acquisition", "trade secret"], "recipient_domain": "external", "authorized_transfer": false, "recommendation": "Quarantine pending approval"}'::jsonb,
  NOW() - INTERVAL '25 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-005';

-- Critical: Malicious Encrypted Transfer
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id,
  'FLOW-006',
  'critical',
  'malware',
  ARRAY['Tor Network', 'Suspicious Destination', 'High Entropy Data'],
  'Potential Data Exfiltration / Malware C2',
  'block',
  97.8,
  '{"threat_indicators": ["tor_exit_node", "high_entropy", "production_source"], "destination_ip": "185.220.101.42", "threat_intel_match": true, "ioc_type": "C2 Communication", "recommendation": "Blocked - Initiate incident response"}'::jsonb,
  NOW() - INTERVAL '170 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-006';

-- Low: Normal Web Traffic
INSERT INTO dlp_detections (packet_id, flow_id, risk_level, violation_type, detected_patterns, content_classification, action_taken, confidence_score, details, detected_at)
SELECT 
  id,
  'FLOW-007',
  'low',
  'policy_violation',
  ARRAY['Code Repository Access'],
  'Developer Activity',
  'allow',
  45.0,
  '{"domain": "github.com", "category": "development", "policy_compliant": true, "user_authorized": true, "recommendation": "Allow - Normal business activity"}'::jsonb,
  NOW() - INTERVAL '8 seconds'
FROM packet_captures WHERE flow_id = 'FLOW-007';
