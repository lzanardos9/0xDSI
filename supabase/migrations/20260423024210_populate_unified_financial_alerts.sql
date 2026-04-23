/*
  # Populate Unified Alerts with Financial Threat Data

  Adds 25 alerts spanning PIX fraud, banking trojans, boleto fraud, social engineering,
  and CPG/supply chain threats so the AI Advisor and alert panels can surface financial
  threat intelligence alongside traditional SIEM alerts.

  1. Alert Types Added
    - `pix_fraud` - PIX instant payment fraud alerts
    - `banking_trojan` - LATAM banking trojan detections
    - `boleto_fraud` - Boleto document fraud
    - `social_engineering` - Social manipulation campaigns
    - `supply_chain` - CPG supply chain attacks
    - `ics_safety` - Industrial control system safety
    - `counterfeit` - Product counterfeit detection
    - `ip_theft` - Intellectual property theft

  2. Each alert includes
    - MITRE ATT&CK mappings
    - Confidence scores
    - Rich metadata with financial details
    - Tags for searchability
    - Proper severity and status
*/

INSERT INTO alerts (alert_id, title, description, severity, status, alert_type, source, rule_name, source_ip, dest_ip, hostname, mitre_tactic, mitre_technique, confidence_score, assigned_to, tags, metadata, created_at)
VALUES
-- PIX Fraud Alerts
('ALR-2026-PIX-001', 'PIX Ghost Hand Attack - R$8,450 Transaction Hijack', 'PixRevolution trojan detected hijacking PIX transfer via Accessibility Service + MediaProjection. Human/AI operator modified recipient at transaction confirmation. Itau Unibanco. Device trust: 12/100.', 'critical', 'investigating', 'pix_fraud', 'Mobile Threat Defense', 'PIX Ghost Hand Detection', '177.42.118.203', '189.100.45.67', 'MOBILE-Android-14', 'TA0040', 'T1417.001', 98, 'Financial Fraud Team', '["pix_fraud", "ghost_hand", "pixrevolution", "android", "brazil"]'::jsonb, '{"amount_brl": 8450, "bank": "Itau Unibanco", "trojan": "PixRevolution", "blocked": true}'::jsonb, NOW() - INTERVAL '4 minutes'),

('ALR-2026-PIX-002', 'PIX Mule Cascade - 17 Splits in 8 Seconds (R$23K)', 'Automated mule cascade: R$23,000 split across 17 accounts in 8 seconds. Express kidnapping pattern. Nighttime transfer at 02:47 AM from high-risk zone. Immediate crypto conversion attempted.', 'critical', 'investigating', 'pix_fraud', 'Transaction Monitoring', 'Mule Cascade Velocity Detection', '200.155.89.42', '10.0.0.1', 'PIX-BACEN-GATEWAY', 'TA0040', 'T1537', 99, 'Financial Fraud Team', '["pix_fraud", "mule_cascade", "express_kidnapping", "crypto", "brazil"]'::jsonb, '{"amount_brl": 23000, "mule_accounts": 17, "splitting_seconds": 8, "nighttime": true, "crypto_conversion": true}'::jsonb, NOW() - INTERVAL '5 minutes'),

('ALR-2026-PIX-003', 'PIX QR Code Substitution at Merchant Terminal', 'BRCode CRC16 checksum mismatch. Recipient is CPF not CNPJ. Geo mismatch: merchant in Curitiba, key owner in Manaus. Tampered dynamic QR code. R$2,340.', 'critical', 'open', 'pix_fraud', 'QR Code Validator', 'BRCode Integrity Check', '172.16.45.89', '189.50.123.45', 'POS-Terminal-BR-042', 'TA0040', 'T1565.002', 94, 'Financial Fraud Team', '["pix_fraud", "qr_code_swap", "merchant_fraud", "brazil"]'::jsonb, '{"amount_brl": 2340, "crc16_valid": false, "recipient_type_mismatch": true, "geo_mismatch": true}'::jsonb, NOW() - INTERVAL '12 minutes'),

('ALR-2026-PIX-004', 'Fake Bank Employee Call - Caller ID Spoofing Itau', 'Voice analysis detected spoofed caller ID (4004-4828 Itau). Victim transferring R$5,670 during active call to protonmail PIX key. Social engineering keywords: bloqueio, seguranca, urgente.', 'high', 'investigating', 'pix_fraud', 'Voice Analysis Engine', 'Fake Central Detection', '45.33.22.11', '189.100.45.67', 'VOIP-GATEWAY-BR', 'TA0001', 'T1566.004', 91, 'SOC Team Alpha', '["pix_fraud", "fake_central", "vishing", "caller_id_spoofing", "brazil"]'::jsonb, '{"amount_brl": 5670, "spoofed_number": "4004-4828", "bank": "Nubank"}'::jsonb, NOW() - INTERVAL '23 minutes'),

('ALR-2026-PIX-005', 'MED 2.0 Cascading Block - 17 Mule Accounts Frozen', 'MED claim MED-2026-0847291 triggered cascading blocks across 5 banks. R$8,450 of R$23,000 recovered. Remaining funds traced to crypto mixer. 80-hour recovery window active.', 'high', 'acknowledged', 'pix_fraud', 'MED 2.0 System', 'MED Recovery Pipeline', '10.0.100.1', '10.0.100.2', 'MED-BACEN-PROD', 'TA0040', 'T1537', 95, 'Financial Fraud Team', '["pix_fraud", "med_recovery", "mule_freeze", "bcb", "brazil"]'::jsonb, '{"claim_id": "MED-2026-0847291", "original_brl": 23000, "recovered_brl": 8450, "mules_frozen": 17}'::jsonb, NOW() - INTERVAL '12 hours'),

-- Banking Trojan Alerts
('ALR-2026-TRJ-001', 'Grandoreiro Banking Trojan - DLL Side-Loading Detected', 'Grandoreiro MaaS variant: dbghelp.dll side-loaded by signed MSI installer. DGA generating 12 C2 domains/day via DNS-over-HTTPS. Targets 1,700 banks in 45 countries. XOR key identified.', 'critical', 'investigating', 'banking_trojan', 'EDR', 'Grandoreiro DLL Side-Load', '192.168.1.42', '185.234.56.78', 'WS-FIN-042', 'TA0002', 'T1574.002', 97, 'Malware Analysis Team', '["banking_trojan", "grandoreiro", "dll_sideloading", "maas", "tetrade", "brazil"]'::jsonb, '{"trojan": "Grandoreiro", "hash": "ff908727cc1b5335e541fbcd80a327565f308bc7", "target_banks": 1700}'::jsonb, NOW() - INTERVAL '12 seconds'),

('ALR-2026-TRJ-002', 'PixRevolution Android Trojan - Real-Time PIX Hijack', 'Human/AI operator-driven Android trojan: MediaProjection + Accessibility combo for real-time PIX transaction modification. Zimperium zero-day composite signal detection.', 'critical', 'investigating', 'banking_trojan', 'Mobile Threat Defense', 'PixRevolution Composite Detection', '177.42.118.203', '45.33.89.12', 'MOBILE-Android-14', 'TA0002', 'T1417.001', 96, 'Malware Analysis Team', '["banking_trojan", "pixrevolution", "android", "operator_driven", "brazil"]'::jsonb, '{"trojan": "PixRevolution", "operator_type": "human_ai_hybrid", "target_banks": 42}'::jsonb, NOW() - INTERVAL '34 seconds'),

('ALR-2026-TRJ-003', 'Casbaneiro Wormable Email Propagation', 'Casbaneiro/Metamorfo Outlook COM hijack propagating phishing to all contacts. Concurrent WhatsApp worm active. Horabot companion malware. Augmented Marauder group. 234 emails already sent.', 'high', 'investigating', 'banking_trojan', 'Email Gateway', 'Casbaneiro Email Worm', '192.168.3.7', '187.45.123.89', 'WS-HR-007', 'TA0008', 'T1534', 93, 'Incident Response Team', '["banking_trojan", "casbaneiro", "wormable", "outlook_hijack", "horabot", "brazil"]'::jsonb, '{"trojan": "Casbaneiro", "emails_sent": 234, "whatsapp_active": true}'::jsonb, NOW() - INTERVAL '2 minutes'),

('ALR-2026-TRJ-004', 'Guildma Trojan Using YouTube C2 Channel', 'Guildma/Astaroth using BITSAdmin LOLBin chain. C2 encoded in YouTube video descriptions, rotating every 48h. 10+ dynamically loaded modules. Targeting banking + Netflix + social media credentials.', 'high', 'open', 'banking_trojan', 'EDR', 'Guildma YouTube C2 Detection', '192.168.8.91', '142.250.80.14', 'WS-FIN-091', 'TA0011', 'T1102', 91, 'Malware Analysis Team', '["banking_trojan", "guildma", "astaroth", "youtube_c2", "lolbin", "tetrade", "brazil"]'::jsonb, '{"trojan": "Guildma", "c2_channel": "YouTube", "c2_rotation_hours": 48, "modules": 10}'::jsonb, NOW() - INTERVAL '4 minutes'),

-- Boleto Fraud Alerts
('ALR-2026-BOL-001', 'Boleto Malware Interception - Bank Code Modification', 'Trojan modified Boleto barcode in browser. Bank routing code 341 (Itau) changed to 077 (mule). DOM mutation on payment page. Visual identical. R$3,450 blocked.', 'critical', 'investigating', 'boleto_fraud', 'Browser Security', 'Boleto DOM Mutation Detection', '192.168.1.42', '200.155.89.42', 'WS-FIN-042', 'TA0009', 'T1185', 95, 'Financial Fraud Team', '["boleto_fraud", "malware_interception", "barcode_modification", "brazil"]'::jsonb, '{"amount_brl": 3450, "bank_code_original": "341", "bank_code_modified": "077"}'::jsonb, NOW() - INTERVAL '30 minutes'),

('ALR-2026-BOL-002', 'Boleto BEC Swap - R$67K B2B Transaction', 'Vendor email compromised. Boleto PDF replaced in active thread. PDF metadata mismatch (Foxit vs Adobe). B2B procurement: R$67,000.', 'critical', 'investigating', 'boleto_fraud', 'Email Security', 'Boleto PDF Hash Mismatch', '45.67.89.12', '192.168.10.50', 'WS-PROC-010', 'TA0009', 'T1114.002', 93, 'Financial Fraud Team', '["boleto_fraud", "bec", "pdf_swap", "b2b_fraud", "brazil"]'::jsonb, '{"amount_brl": 67000, "vendor_compromised": true, "pdf_mismatch": true}'::jsonb, NOW() - INTERVAL '3 hours'),

('ALR-2026-BOL-003', 'Accounting Software Compromise - 47 Client GRFs Modified', 'Contmatic Phoenix DLL modification via fake update. Batch FGTS/DARF tax Boletos redirected for 47 clients. R$418K total at risk.', 'critical', 'open', 'boleto_fraud', 'Software Integrity', 'GRF Batch Modification', '192.168.4.5', '103.78.45.12', 'WS-CONTAB-001', 'TA0001', 'T1195.002', 97, 'Incident Response Team', '["boleto_fraud", "grf_interception", "tax_fraud", "supply_chain", "brazil"]'::jsonb, '{"amount_brl": 418000, "software": "Contmatic Phoenix", "clients_affected": 47}'::jsonb, NOW() - INTERVAL '5 hours'),

-- Social Engineering Alerts
('ALR-2026-SOC-001', 'Fake Investment Ponzi - R$12M Collected via Telegram', 'Fake crypto platform with 52K Telegram members. Ponzi promising 3% daily returns. Withdrawal freeze imminent. CVM unregistered.', 'critical', 'investigating', 'social_engineering', 'Financial Fraud Intel', 'Ponzi Pattern Detection', '95.217.45.67', '177.42.300.45', 'TELEGRAM-MONITOR', 'TA0001', 'T1566.003', 92, 'Financial Crimes Unit', '["social_engineering", "ponzi", "fake_investment", "telegram", "crypto", "brazil"]'::jsonb, '{"total_collected_brl": 12000000, "members": 52000, "platform": "Telegram"}'::jsonb, NOW() - INTERVAL '5 hours'),

('ALR-2026-SOC-002', 'WhatsApp Job Scam Campaign - 456K Monthly Attempts', 'Mass WhatsApp campaign: fake R$300/day job offers. Advance-fee variant with escalating deposits. 18% success rate.', 'high', 'open', 'social_engineering', 'Messaging Security', 'Mass WhatsApp Scam Detection', '177.71.45.89', '189.100.45.67', 'WHATSAPP-MONITOR', 'TA0001', 'T1566.001', 88, 'SOC Team Alpha', '["social_engineering", "job_scam", "whatsapp", "advance_fee", "brazil"]'::jsonb, '{"monthly_attempts": 456000, "success_rate": "18%", "avg_loss_brl": 2300}'::jsonb, NOW() - INTERVAL '3 hours'),

-- Supply Chain / CPG Alerts
('ALR-2026-SCH-001', 'EDI ASN Injection - $23.4M Duplicate Procurement Orders', 'Compromised 3PL EDI gateway. Falsified ASN across 14 DCs. SAP S/4HANA MRP auto-generated duplicate POs.', 'critical', 'investigating', 'supply_chain', 'EDI Monitor', 'EDI 856 Anomaly Detection', '10.100.50.42', '10.100.50.1', 'EDI-GATEWAY-PROD', 'TA0001', 'T1195.002', 96, 'Supply Chain Security', '["supply_chain", "edi_injection", "sap", "cpg"]'::jsonb, '{"loss_estimate_usd": 23400000, "distribution_centers": 14}'::jsonb, NOW() - INTERVAL '4 minutes'),

('ALR-2026-SCH-002', 'Cold Chain IoT Compromise - 12K Pallets at Risk', 'MQTT broker spoofing temperature telemetry on 847 containers. Dairy contamination risk (Listeria). FreshLife Dairy EU.', 'critical', 'investigating', 'supply_chain', 'IoT Security', 'Cold Chain Telemetry Anomaly', '10.200.45.89', '10.200.45.1', 'MQTT-BROKER-EU', 'TA0040', 'T1565.002', 94, 'Supply Chain Security', '["supply_chain", "cold_chain", "iot", "mqtt", "food_safety", "cpg"]'::jsonb, '{"containers": 847, "pallets_at_risk": 12000, "contamination": "Listeria"}'::jsonb, NOW() - INTERVAL '18 minutes'),

-- ICS Safety Alerts
('ALR-2026-ICS-001', 'HACCP Violation - CIP Caustic Reduced to Ineffective Level', 'CIP setpoint: 2.0% NaOH reduced to 0.3% via HMI compromise. Listeria survival in bottling lines. Beverage Plant Atlanta.', 'critical', 'acknowledged', 'ics_safety', 'ICS Monitor', 'CIP Setpoint Anomaly', '10.50.100.42', '10.50.100.1', 'CIP-CONTROLLER-ATL', 'TA0040', 'T0836', 97, 'ICS Security Team', '["ics_safety", "cip_sabotage", "haccp", "listeria", "cpg"]'::jsonb, '{"original_setpoint": "2.0%", "modified_setpoint": "0.3%", "pathogen": "Listeria"}'::jsonb, NOW() - INTERVAL '8 minutes'),

('ALR-2026-ICS-002', 'Fryer Safety Interlock Bypassed + Fire Suppression Disabled', 'Dual-vector coordinated attack: SIL-2 interlock bypass + fire suppression disabled. Oil temp exceeding flash point. Snack Factory Dallas.', 'critical', 'investigating', 'ics_safety', 'Safety Interlock Monitor', 'Dual-Vector Safety Attack', '10.50.300.7', '10.50.300.1', 'FRYER-PLC-DAL', 'TA0040', 'T0816', 98, 'ICS Security Team', '["ics_safety", "interlock_bypass", "fire_risk", "coordinated_attack", "cpg"]'::jsonb, '{"oil_temp_c": 330, "flash_point_c": 315, "fire_suppression": "disabled"}'::jsonb, NOW() - INTERVAL '15 minutes'),

-- Counterfeit Alerts
('ALR-2026-CNT-001', 'Counterfeit Infant Formula - Lead 47x Safe Limit', '34,500 counterfeit infant formula units seized. Lead contamination 47x safe limit. Infant mortality risk. Amazon + Pinduoduo.', 'critical', 'acknowledged', 'counterfeit', 'Anti-Counterfeit Platform', 'Product Safety Alert', '10.0.50.42', '10.0.50.1', 'ANTI-COUNTERFEIT-SYS', 'TA0040', 'T1565.001', 99, 'Brand Protection', '["counterfeit", "infant_formula", "lead", "health_risk", "cpg"]'::jsonb, '{"units": 34500, "contaminant": "lead", "level": "47x safe limit"}'::jsonb, NOW() - INTERVAL '1 hour'),

-- IP Theft Alerts
('ALR-2026-IPT-001', 'APT41 Formula Theft - $340M Competitive Advantage at Risk', 'APT41 (Double Dragon) exfiltrated 2.3 GB from PLM/R&D: cola formulation, fermentation IP, consumer test data. Encrypted DNS tunnel.', 'critical', 'investigating', 'ip_theft', 'Threat Intelligence', 'APT Formula Exfiltration', '10.100.10.42', '185.56.78.90', 'RD-PLM-SERVER', 'TA0010', 'T1567.002', 95, 'Threat Intel Team', '["ip_theft", "apt41", "formula_theft", "dns_tunnel", "nation_state", "cpg"]'::jsonb, '{"threat_actor": "APT41", "exfil_gb": 2.3, "valuation_usd": 340000000}'::jsonb, NOW() - INTERVAL '11 hours');
