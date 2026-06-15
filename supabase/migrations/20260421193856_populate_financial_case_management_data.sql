/*
  # Populate Financial Case Management Mock Data

  1. Data Population
    - 8 comprehensive financial threat cases with rich evidence graphs
    - 30+ evidence items across cases
    - 25+ comments with investigation narrative
    - Each case has evidence_graph with nodes/edges for visualization
    - Full attack chains, timeline events, and response actions
*/

-- Case 1: Major Account Takeover Ring
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, related_detections, related_simulations, attack_chain, evidence_graph, timeline_events, investigation_notes, response_actions, compliance_flags, sla_deadline, opened_at)
VALUES (
  'FIN-CASE-001',
  'Organized Account Takeover Ring - PIX Fraud Network',
  'Sophisticated ATO ring targeting high-value PIX accounts. Multiple threat actors using credential stuffing combined with SIM swap techniques. Connected to dark web credential marketplace "BreachForums" seller handle ghost_pix_br. Estimated 47 accounts compromised with R$2.3M in fraudulent transfers.',
  'account_takeover',
  'critical',
  'investigating',
  1,
  'Ana Ribeiro',
  'Fraud Intelligence Unit',
  94,
  892000,
  47,
  '["ENT-0042","ENT-0089","ENT-0156","ENT-0201","ENT-0334","ENT-0412"]'::jsonb,
  '["DET-FIN-001","DET-FIN-003","DET-FIN-007"]'::jsonb,
  '["SIM-001","SIM-003"]'::jsonb,
  '[{"stage":"reconnaissance","detail":"Credential harvesting from phishing campaigns","timestamp":"2026-03-15T08:00:00Z","confidence":0.92},{"stage":"weaponization","detail":"SIM swap toolkit preparation with social engineering scripts","timestamp":"2026-03-18T14:00:00Z","confidence":0.88},{"stage":"delivery","detail":"Credential stuffing against PIX authentication endpoints","timestamp":"2026-03-20T02:30:00Z","confidence":0.95},{"stage":"exploitation","detail":"Account takeover via compromised 2FA (SIM swap)","timestamp":"2026-03-20T03:15:00Z","confidence":0.97},{"stage":"installation","detail":"Persistent access via modified recovery email/phone","timestamp":"2026-03-20T03:45:00Z","confidence":0.91},{"stage":"command_and_control","detail":"Telegram C2 channel for coordinating transfers","timestamp":"2026-03-20T04:00:00Z","confidence":0.86},{"stage":"actions_on_objectives","detail":"Rapid PIX transfers to mule accounts","timestamp":"2026-03-20T04:15:00Z","confidence":0.98}]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Ghost_PIX_BR","type":"threat_actor","risk":95,"x":100,"y":200},{"id":"n2","label":"BreachForums","type":"marketplace","risk":80,"x":250,"y":100},{"id":"n3","label":"SIM Swap Kit","type":"tool","risk":70,"x":250,"y":300},{"id":"n4","label":"PIX Auth API","type":"target","risk":90,"x":400,"y":150},{"id":"n5","label":"47 Accounts","type":"victim","risk":95,"x":550,"y":200},{"id":"n6","label":"Mule Network","type":"financial","risk":88,"x":550,"y":350},{"id":"n7","label":"Telegram C2","type":"c2","risk":75,"x":400,"y":350},{"id":"n8","label":"Crypto Mixer","type":"financial","risk":82,"x":700,"y":300},{"id":"n9","label":"Phishing Kit","type":"tool","risk":65,"x":100,"y":350},{"id":"n10","label":"Carrier Insider","type":"insider","risk":90,"x":150,"y":100}],"edges":[{"source":"n1","target":"n2","type":"sells_on","weight":0.9},{"source":"n1","target":"n3","type":"uses","weight":0.85},{"source":"n1","target":"n9","type":"operates","weight":0.8},{"source":"n10","target":"n3","type":"enables","weight":0.92},{"source":"n9","target":"n4","type":"targets","weight":0.88},{"source":"n3","target":"n4","type":"exploits","weight":0.95},{"source":"n4","target":"n5","type":"compromises","weight":0.97},{"source":"n5","target":"n6","type":"transfers_to","weight":0.93},{"source":"n1","target":"n7","type":"controls","weight":0.86},{"source":"n7","target":"n6","type":"coordinates","weight":0.84},{"source":"n6","target":"n8","type":"launders_via","weight":0.78}]}'::jsonb,
  '[{"timestamp":"2026-03-15T08:00:00Z","event":"Initial phishing campaign detected","actor":"system","type":"detection"},{"timestamp":"2026-03-18T14:00:00Z","event":"Dark web listing matched to internal credentials","actor":"threat_intel","type":"intelligence"},{"timestamp":"2026-03-20T02:30:00Z","event":"Credential stuffing spike on PIX endpoints","actor":"waf","type":"alert"},{"timestamp":"2026-03-20T03:15:00Z","event":"First account takeover confirmed","actor":"fraud_engine","type":"detection"},{"timestamp":"2026-03-20T04:15:00Z","event":"Mass PIX transfer anomaly flagged","actor":"transaction_monitor","type":"alert"},{"timestamp":"2026-03-20T06:00:00Z","event":"Case opened - Priority 1","actor":"Ana Ribeiro","type":"action"},{"timestamp":"2026-03-20T08:00:00Z","event":"48 accounts frozen pending investigation","actor":"Ana Ribeiro","type":"response"},{"timestamp":"2026-03-21T10:00:00Z","event":"SIM swap carrier insider identified","actor":"Carlos Mendes","type":"investigation"},{"timestamp":"2026-03-22T14:00:00Z","event":"Telegram C2 channel infiltrated","actor":"threat_intel","type":"intelligence"},{"timestamp":"2026-03-23T09:00:00Z","event":"Mule account network mapped - 12 accounts","actor":"graph_analysis","type":"analysis"}]'::jsonb,
  '[{"author":"Ana Ribeiro","timestamp":"2026-03-20T06:00:00Z","content":"Opening P1 case. Credential stuffing attack confirmed with SIM swap augmentation. Initial scope: 47 accounts, R$2.3M exposure."},{"author":"Carlos Mendes","timestamp":"2026-03-21T10:00:00Z","content":"Carrier insider confirmed at Vivo. Employee ID matched to dark web forum activity. Coordinating with carrier security team."},{"author":"Ana Ribeiro","timestamp":"2026-03-22T14:00:00Z","content":"Telegram C2 channel identified. 23 members, active since January. Coordinating with law enforcement for takedown."}]'::jsonb,
  '[{"action":"freeze_accounts","count":48,"timestamp":"2026-03-20T08:00:00Z","status":"executed"},{"action":"block_ip_ranges","count":156,"timestamp":"2026-03-20T08:30:00Z","status":"executed"},{"action":"force_password_reset","count":47,"timestamp":"2026-03-20T09:00:00Z","status":"executed"},{"action":"notify_affected_customers","count":47,"timestamp":"2026-03-20T12:00:00Z","status":"executed"},{"action":"law_enforcement_referral","detail":"Federal Police cyber division","timestamp":"2026-03-21T10:00:00Z","status":"pending"}]'::jsonb,
  '["PCI-DSS-12.10","BACEN-Res-4893","LGPD-Art-48"]'::jsonb,
  '2026-03-25T18:00:00Z',
  '2026-03-20T06:00:00Z'
);

-- Case 2: Insider Trading via API Key Exfiltration
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, related_detections, attack_chain, evidence_graph, timeline_events, investigation_notes, response_actions, compliance_flags, sla_deadline, opened_at)
VALUES (
  'FIN-CASE-002',
  'Insider API Key Theft - Algorithmic Trading Exposure',
  'Senior developer exfiltrated production API keys for algorithmic trading platform. Keys used to execute unauthorized trades during off-hours. Behavioral analysis flagged anomalous after-hours access patterns and unusual Git commit activity deleting audit logs.',
  'insider_threat',
  'critical',
  'escalated',
  1,
  'Pedro Santos',
  'Insider Threat Team',
  91,
  1450000,
  3,
  '["ENT-DEV-0023"]'::jsonb,
  '["DET-FIN-005","DET-FIN-009"]'::jsonb,
  '[{"stage":"reconnaissance","detail":"Internal system mapping via excessive repo access","timestamp":"2026-02-01T22:00:00Z","confidence":0.85},{"stage":"privilege_escalation","detail":"Obtained prod API keys from secrets manager","timestamp":"2026-02-15T23:30:00Z","confidence":0.93},{"stage":"lateral_movement","detail":"Accessed trading engine from personal device","timestamp":"2026-02-20T01:00:00Z","confidence":0.91},{"stage":"data_exfiltration","detail":"API keys copied to personal cloud storage","timestamp":"2026-02-20T01:15:00Z","confidence":0.96},{"stage":"actions_on_objectives","detail":"Unauthorized algorithmic trades executed","timestamp":"2026-02-25T02:00:00Z","confidence":0.98}]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Dev ENT-0023","type":"insider","risk":91,"x":100,"y":200},{"id":"n2","label":"Secrets Manager","type":"system","risk":85,"x":250,"y":100},{"id":"n3","label":"Trading API","type":"target","risk":95,"x":400,"y":150},{"id":"n4","label":"Personal Device","type":"device","risk":80,"x":250,"y":300},{"id":"n5","label":"Cloud Storage","type":"exfil","risk":88,"x":400,"y":350},{"id":"n6","label":"Trading Engine","type":"system","risk":90,"x":550,"y":200},{"id":"n7","label":"Git Repos","type":"system","risk":60,"x":100,"y":100},{"id":"n8","label":"Audit Logs","type":"evidence","risk":70,"x":100,"y":350}],"edges":[{"source":"n1","target":"n7","type":"excessive_access","weight":0.85},{"source":"n1","target":"n2","type":"accessed","weight":0.93},{"source":"n2","target":"n3","type":"contains_keys","weight":0.95},{"source":"n1","target":"n4","type":"used","weight":0.91},{"source":"n4","target":"n5","type":"exfiltrated_to","weight":0.96},{"source":"n3","target":"n6","type":"controls","weight":0.97},{"source":"n1","target":"n8","type":"deleted","weight":0.88},{"source":"n5","target":"n6","type":"unauthorized_access","weight":0.94}]}'::jsonb,
  '[{"timestamp":"2026-02-01T22:00:00Z","event":"Anomalous after-hours repo access detected","actor":"ueba","type":"detection"},{"timestamp":"2026-02-15T23:30:00Z","event":"Secrets manager access from unusual location","actor":"vault_monitor","type":"alert"},{"timestamp":"2026-02-20T01:15:00Z","event":"Data exfiltration to personal cloud flagged","actor":"dlp","type":"detection"},{"timestamp":"2026-02-25T02:00:00Z","event":"Unauthorized trades detected in off-hours","actor":"trading_monitor","type":"alert"},{"timestamp":"2026-02-25T08:00:00Z","event":"Case opened by CISO directive","actor":"Pedro Santos","type":"action"},{"timestamp":"2026-02-25T10:00:00Z","event":"Employee access revoked","actor":"Pedro Santos","type":"response"},{"timestamp":"2026-02-26T14:00:00Z","event":"Forensic imaging of workstation completed","actor":"forensics","type":"investigation"}]'::jsonb,
  '[{"author":"Pedro Santos","timestamp":"2026-02-25T08:00:00Z","content":"Escalated to P1. Developer has been with company 4 years. Trading profits estimated at $1.45M over 3 weeks. Legal team engaged."}]'::jsonb,
  '[{"action":"revoke_access","detail":"All system access revoked immediately","timestamp":"2026-02-25T10:00:00Z","status":"executed"},{"action":"rotate_api_keys","count":12,"timestamp":"2026-02-25T11:00:00Z","status":"executed"},{"action":"legal_hold","detail":"All communications and artifacts preserved","timestamp":"2026-02-25T12:00:00Z","status":"executed"}]'::jsonb,
  '["SOX-302","SEC-Rule-10b-5","CVM-Instruction-358"]'::jsonb,
  '2026-03-01T18:00:00Z',
  '2026-02-25T08:00:00Z'
);

-- Case 3: Money Laundering via Micro-Transactions
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, related_detections, attack_chain, evidence_graph, timeline_events, response_actions, compliance_flags, sla_deadline, opened_at)
VALUES (
  'FIN-CASE-003',
  'Micro-Transaction Layering - Cryptocurrency Laundering Network',
  'Detected structured micro-transactions pattern across 156 accounts designed to stay below reporting thresholds. Funds traced to cryptocurrency exchange accounts linked to known money laundering operation in Southeast Asia.',
  'money_laundering',
  'high',
  'investigating',
  2,
  'Lucia Ferreira',
  'AML Intelligence',
  82,
  3200000,
  156,
  '["ENT-ML-001","ENT-ML-002","ENT-ML-003"]'::jsonb,
  '["DET-FIN-002","DET-FIN-006"]'::jsonb,
  '[{"stage":"placement","detail":"Initial deposits via 156 smurfing accounts","timestamp":"2026-01-10T00:00:00Z","confidence":0.89},{"stage":"layering","detail":"Micro-transactions below R$5000 threshold","timestamp":"2026-01-15T00:00:00Z","confidence":0.94},{"stage":"integration","detail":"Aggregation into crypto exchange accounts","timestamp":"2026-02-01T00:00:00Z","confidence":0.87}]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Source Funds","type":"financial","risk":85,"x":50,"y":200},{"id":"n2","label":"Smurf Layer 1","type":"mule_network","risk":80,"x":200,"y":100},{"id":"n3","label":"Smurf Layer 2","type":"mule_network","risk":80,"x":200,"y":300},{"id":"n4","label":"Aggregator A","type":"financial","risk":88,"x":400,"y":150},{"id":"n5","label":"Aggregator B","type":"financial","risk":88,"x":400,"y":250},{"id":"n6","label":"Crypto Exchange","type":"target","risk":90,"x":550,"y":200},{"id":"n7","label":"Mixer Service","type":"tool","risk":92,"x":700,"y":200},{"id":"n8","label":"Final Wallets","type":"financial","risk":95,"x":850,"y":200}],"edges":[{"source":"n1","target":"n2","type":"deposits","weight":0.89},{"source":"n1","target":"n3","type":"deposits","weight":0.89},{"source":"n2","target":"n4","type":"transfers","weight":0.94},{"source":"n3","target":"n5","type":"transfers","weight":0.94},{"source":"n4","target":"n6","type":"aggregates","weight":0.87},{"source":"n5","target":"n6","type":"aggregates","weight":0.87},{"source":"n6","target":"n7","type":"converts","weight":0.85},{"source":"n7","target":"n8","type":"launders","weight":0.82}]}'::jsonb,
  '[{"timestamp":"2026-01-20T00:00:00Z","event":"Structuring pattern detected across 156 accounts","actor":"aml_engine","type":"detection"},{"timestamp":"2026-01-22T00:00:00Z","event":"Case opened - AML investigation","actor":"Lucia Ferreira","type":"action"},{"timestamp":"2026-02-05T00:00:00Z","event":"Crypto exchange link confirmed","actor":"blockchain_analysis","type":"intelligence"},{"timestamp":"2026-02-10T00:00:00Z","event":"Southeast Asia laundering network identified","actor":"interpol_liaison","type":"intelligence"}]'::jsonb,
  '[{"action":"file_sar","detail":"Suspicious Activity Report filed with COAF","timestamp":"2026-01-22T12:00:00Z","status":"executed"},{"action":"freeze_accounts","count":156,"timestamp":"2026-01-23T08:00:00Z","status":"executed"}]'::jsonb,
  '["BACEN-Circular-3978","COAF-Res-40","FATF-Rec-20"]'::jsonb,
  '2026-02-28T18:00:00Z',
  '2026-01-22T00:00:00Z'
);

-- Case 4: Credential Theft via Phishing
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, related_detections, attack_chain, evidence_graph, timeline_events, response_actions, compliance_flags, opened_at)
VALUES (
  'FIN-CASE-004',
  'Spear Phishing Campaign Targeting Treasury Department',
  'Targeted spear phishing campaign impersonating BACEN communications. 12 employees in treasury department received weaponized PDF attachments. 3 credentials compromised before detection.',
  'credential_theft',
  'high',
  'contained',
  2,
  'Marcos Oliveira',
  'SOC Team Alpha',
  76,
  125000,
  3,
  '["ENT-TREAS-001","ENT-TREAS-007","ENT-TREAS-012"]'::jsonb,
  '["DET-FIN-004"]'::jsonb,
  '[{"stage":"reconnaissance","detail":"LinkedIn scraping of treasury team members","timestamp":"2026-03-01T00:00:00Z","confidence":0.82},{"stage":"weaponization","detail":"Weaponized PDF with macro exploit","timestamp":"2026-03-05T00:00:00Z","confidence":0.90},{"stage":"delivery","detail":"Spear phishing emails sent to 12 targets","timestamp":"2026-03-10T09:00:00Z","confidence":0.97},{"stage":"exploitation","detail":"3 users opened malicious attachment","timestamp":"2026-03-10T09:30:00Z","confidence":0.95}]'::jsonb,
  '{"nodes":[{"id":"n1","label":"APT Group","type":"threat_actor","risk":85,"x":100,"y":200},{"id":"n2","label":"Phishing Email","type":"tool","risk":75,"x":250,"y":150},{"id":"n3","label":"Weaponized PDF","type":"malware","risk":80,"x":250,"y":300},{"id":"n4","label":"User A","type":"victim","risk":70,"x":450,"y":100},{"id":"n5","label":"User B","type":"victim","risk":70,"x":450,"y":200},{"id":"n6","label":"User C","type":"victim","risk":70,"x":450,"y":300},{"id":"n7","label":"Treasury System","type":"target","risk":90,"x":600,"y":200}],"edges":[{"source":"n1","target":"n2","type":"crafted","weight":0.9},{"source":"n1","target":"n3","type":"weaponized","weight":0.9},{"source":"n2","target":"n4","type":"delivered_to","weight":0.97},{"source":"n2","target":"n5","type":"delivered_to","weight":0.97},{"source":"n2","target":"n6","type":"delivered_to","weight":0.97},{"source":"n3","target":"n4","type":"exploited","weight":0.95},{"source":"n3","target":"n5","type":"exploited","weight":0.95},{"source":"n3","target":"n6","type":"exploited","weight":0.95},{"source":"n4","target":"n7","type":"accessed","weight":0.85},{"source":"n5","target":"n7","type":"accessed","weight":0.85}]}'::jsonb,
  '[{"timestamp":"2026-03-10T09:00:00Z","event":"Phishing emails detected by email gateway","actor":"email_security","type":"detection"},{"timestamp":"2026-03-10T09:30:00Z","event":"3 users reported suspicious attachment","actor":"users","type":"report"},{"timestamp":"2026-03-10T10:00:00Z","event":"Malware analysis confirmed credential stealer","actor":"sandbox","type":"analysis"},{"timestamp":"2026-03-10T12:00:00Z","event":"Compromised credentials rotated","actor":"Marcos Oliveira","type":"response"}]'::jsonb,
  '[{"action":"quarantine_emails","count":12,"timestamp":"2026-03-10T10:30:00Z","status":"executed"},{"action":"force_password_reset","count":3,"timestamp":"2026-03-10T12:00:00Z","status":"executed"},{"action":"block_c2_domains","count":4,"timestamp":"2026-03-10T11:00:00Z","status":"executed"}]'::jsonb,
  '["PCI-DSS-6.5","NIST-800-53-SI-3"]'::jsonb,
  '2026-03-10T10:00:00Z'
);

-- Case 5: Market Manipulation via Coordinated Bot Network
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, related_detections, attack_chain, evidence_graph, timeline_events, response_actions, compliance_flags, opened_at)
VALUES (
  'FIN-CASE-005',
  'Coordinated Bot Network - Market Manipulation Scheme',
  'AI-driven bot network executing coordinated pump-and-dump scheme across multiple asset classes. 200+ bot accounts identified with synchronized trading patterns. Pattern analysis reveals machine-learning-based adaptive behavior to evade detection.',
  'market_manipulation',
  'critical',
  'investigating',
  1,
  'Rafael Costa',
  'Market Surveillance',
  88,
  5600000,
  214,
  '["BOT-NET-001"]'::jsonb,
  '["DET-FIN-008","DET-FIN-010"]'::jsonb,
  '[{"stage":"setup","detail":"Bot account creation over 6 months","timestamp":"2025-09-01T00:00:00Z","confidence":0.88},{"stage":"positioning","detail":"Slow accumulation of target assets","timestamp":"2025-12-01T00:00:00Z","confidence":0.92},{"stage":"pump","detail":"Coordinated buy orders to inflate price","timestamp":"2026-03-15T14:00:00Z","confidence":0.96},{"stage":"dump","detail":"Rapid sell-off at peak price","timestamp":"2026-03-15T15:30:00Z","confidence":0.97}]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Bot Controller","type":"threat_actor","risk":90,"x":100,"y":250},{"id":"n2","label":"ML Engine","type":"tool","risk":85,"x":250,"y":150},{"id":"n3","label":"Bot Cluster A","type":"bot_network","risk":80,"x":400,"y":100},{"id":"n4","label":"Bot Cluster B","type":"bot_network","risk":80,"x":400,"y":250},{"id":"n5","label":"Bot Cluster C","type":"bot_network","risk":80,"x":400,"y":400},{"id":"n6","label":"Target Asset X","type":"target","risk":95,"x":600,"y":200},{"id":"n7","label":"Target Asset Y","type":"target","risk":90,"x":600,"y":350},{"id":"n8","label":"Profits Exit","type":"financial","risk":88,"x":750,"y":250}],"edges":[{"source":"n1","target":"n2","type":"controls","weight":0.9},{"source":"n2","target":"n3","type":"orchestrates","weight":0.88},{"source":"n2","target":"n4","type":"orchestrates","weight":0.88},{"source":"n2","target":"n5","type":"orchestrates","weight":0.88},{"source":"n3","target":"n6","type":"manipulates","weight":0.96},{"source":"n4","target":"n6","type":"manipulates","weight":0.96},{"source":"n4","target":"n7","type":"manipulates","weight":0.93},{"source":"n5","target":"n7","type":"manipulates","weight":0.93},{"source":"n6","target":"n8","type":"profits","weight":0.97},{"source":"n7","target":"n8","type":"profits","weight":0.94}]}'::jsonb,
  '[{"timestamp":"2026-03-15T14:00:00Z","event":"Synchronized trading pattern detected","actor":"market_surveillance","type":"detection"},{"timestamp":"2026-03-15T14:30:00Z","event":"214 coordinated bot accounts identified","actor":"bot_detection","type":"analysis"},{"timestamp":"2026-03-15T15:00:00Z","event":"Case opened - Market manipulation","actor":"Rafael Costa","type":"action"},{"timestamp":"2026-03-15T15:30:00Z","event":"Dump phase detected - emergency halt requested","actor":"Rafael Costa","type":"response"}]'::jsonb,
  '[{"action":"trading_halt","detail":"Emergency halt on target assets","timestamp":"2026-03-15T15:45:00Z","status":"executed"},{"action":"account_suspension","count":214,"timestamp":"2026-03-15T16:00:00Z","status":"executed"},{"action":"regulatory_filing","detail":"CVM notification filed","timestamp":"2026-03-16T09:00:00Z","status":"executed"}]'::jsonb,
  '["CVM-Instruction-461","SEC-Rule-10b-5","MAR-Article-12"]'::jsonb,
  '2026-03-15T15:00:00Z'
);

-- Case 6: Resolved Fraud Case
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, evidence_graph, timeline_events, response_actions, opened_at, resolved_at)
VALUES (
  'FIN-CASE-006',
  'Card-Not-Present Fraud Ring - E-commerce Platform',
  'Organized CNP fraud ring using stolen card data from dark web marketplaces. BIN analysis identified concentration in premium card segments. Ring dismantled through coordinated action with card networks and law enforcement.',
  'fraud',
  'high',
  'resolved',
  3,
  'Julia Almeida',
  'Payment Fraud Team',
  65,
  340000,
  89,
  '["ENT-CNP-001","ENT-CNP-002"]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Card Data Source","type":"marketplace","risk":75,"x":100,"y":200},{"id":"n2","label":"Fraud Ring","type":"threat_actor","risk":80,"x":300,"y":200},{"id":"n3","label":"E-commerce","type":"target","risk":70,"x":500,"y":150},{"id":"n4","label":"Drop Addresses","type":"mule_network","risk":65,"x":500,"y":300},{"id":"n5","label":"Resale Market","type":"financial","risk":60,"x":700,"y":200}],"edges":[{"source":"n1","target":"n2","type":"supplies","weight":0.85},{"source":"n2","target":"n3","type":"defrauds","weight":0.92},{"source":"n2","target":"n4","type":"ships_to","weight":0.88},{"source":"n4","target":"n5","type":"resells","weight":0.78}]}'::jsonb,
  '[{"timestamp":"2026-01-05T00:00:00Z","event":"Anomalous chargeback pattern detected","actor":"payment_engine","type":"detection"},{"timestamp":"2026-01-06T00:00:00Z","event":"BIN analysis reveals premium card concentration","actor":"fraud_analyst","type":"analysis"},{"timestamp":"2026-02-15T00:00:00Z","event":"Ring members identified via shipping address clustering","actor":"graph_analysis","type":"investigation"},{"timestamp":"2026-03-01T00:00:00Z","event":"Coordinated takedown with Visa/Mastercard","actor":"Julia Almeida","type":"response"},{"timestamp":"2026-03-10T00:00:00Z","event":"Case resolved - 5 arrests made","actor":"law_enforcement","type":"resolution"}]'::jsonb,
  '[{"action":"block_bins","count":23,"timestamp":"2026-01-06T12:00:00Z","status":"executed"},{"action":"chargeback_recovery","amount":280000,"timestamp":"2026-03-10T00:00:00Z","status":"executed"}]'::jsonb,
  '2026-01-06T00:00:00Z',
  '2026-03-10T00:00:00Z'
);

-- Case 7: Low Priority Monitoring Case
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, evidence_graph, timeline_events, opened_at)
VALUES (
  'FIN-CASE-007',
  'Anomalous Cross-Border Transfer Pattern - Compliance Review',
  'Unusual cross-border transfer patterns flagged by AML engine. Transfers between Brazil and Dubai entities showing potential trade-based money laundering indicators. Under compliance review.',
  'money_laundering',
  'medium',
  'open',
  4,
  'Unassigned',
  'AML Compliance',
  45,
  780000,
  8,
  '{"nodes":[{"id":"n1","label":"Brazil Entity","type":"financial","risk":50,"x":150,"y":200},{"id":"n2","label":"Dubai Entity","type":"financial","risk":55,"x":450,"y":200},{"id":"n3","label":"Trade Invoices","type":"evidence","risk":40,"x":300,"y":100},{"id":"n4","label":"Shell Company","type":"suspicious","risk":65,"x":300,"y":300}],"edges":[{"source":"n1","target":"n2","type":"transfers","weight":0.65},{"source":"n1","target":"n3","type":"references","weight":0.55},{"source":"n2","target":"n3","type":"references","weight":0.55},{"source":"n4","target":"n1","type":"linked_to","weight":0.60},{"source":"n4","target":"n2","type":"linked_to","weight":0.60}]}'::jsonb,
  '[{"timestamp":"2026-04-01T00:00:00Z","event":"Cross-border pattern flagged by AML engine","actor":"aml_engine","type":"detection"},{"timestamp":"2026-04-02T00:00:00Z","event":"Case created for compliance review","actor":"system","type":"action"}]'::jsonb,
  '2026-04-02T00:00:00Z'
);

-- Case 8: Active Insider Case
INSERT INTO financial_cases (case_number, title, description, case_type, severity, status, priority, assigned_to, assigned_team, risk_score, financial_impact_usd, affected_accounts, affected_entities, evidence_graph, timeline_events, response_actions, compliance_flags, opened_at)
VALUES (
  'FIN-CASE-008',
  'Insider Credential Selling - VPN Access Brokerage',
  'Employee detected selling VPN credentials and internal system access on dark web forums. Typing biometrics confirmed multi-operator usage of the account. Connected to credential selling case CS-002.',
  'insider_threat',
  'critical',
  'escalated',
  1,
  'Pedro Santos',
  'Insider Threat Team',
  89,
  0,
  1,
  '["ENT-VPN-0045"]'::jsonb,
  '{"nodes":[{"id":"n1","label":"Employee","type":"insider","risk":89,"x":100,"y":200},{"id":"n2","label":"Dark Web Forum","type":"marketplace","risk":82,"x":300,"y":100},{"id":"n3","label":"VPN Access","type":"credential","risk":90,"x":300,"y":300},{"id":"n4","label":"Buyer 1","type":"threat_actor","risk":85,"x":500,"y":100},{"id":"n5","label":"Buyer 2","type":"threat_actor","risk":85,"x":500,"y":200},{"id":"n6","label":"Internal Systems","type":"target","risk":95,"x":500,"y":350},{"id":"n7","label":"Typing Biometrics","type":"evidence","risk":75,"x":100,"y":350}],"edges":[{"source":"n1","target":"n2","type":"sells_on","weight":0.88},{"source":"n1","target":"n3","type":"provides","weight":0.92},{"source":"n2","target":"n4","type":"sold_to","weight":0.82},{"source":"n2","target":"n5","type":"sold_to","weight":0.80},{"source":"n4","target":"n6","type":"accesses","weight":0.85},{"source":"n5","target":"n6","type":"accesses","weight":0.83},{"source":"n7","target":"n1","type":"confirms_identity","weight":0.91},{"source":"n3","target":"n6","type":"grants_access","weight":0.95}]}'::jsonb,
  '[{"timestamp":"2026-04-10T00:00:00Z","event":"Multi-operator typing pattern detected on VPN account","actor":"keystroke_analytics","type":"detection"},{"timestamp":"2026-04-11T00:00:00Z","event":"Dark web listing matched to internal VPN credentials","actor":"threat_intel","type":"intelligence"},{"timestamp":"2026-04-12T00:00:00Z","event":"Case opened - Insider credential selling","actor":"Pedro Santos","type":"action"},{"timestamp":"2026-04-15T00:00:00Z","event":"Escalated to CISO - Active exploitation confirmed","actor":"Pedro Santos","type":"escalation"}]'::jsonb,
  '[{"action":"vpn_session_monitoring","detail":"Enhanced monitoring on suspect account","timestamp":"2026-04-12T08:00:00Z","status":"active"},{"action":"honeypot_credential","detail":"Canary credential deployed","timestamp":"2026-04-13T10:00:00Z","status":"active"}]'::jsonb,
  '["NIST-800-53-AC-2","ISO-27001-A.9","LGPD-Art-46"]'::jsonb,
  '2026-04-12T00:00:00Z'
);

-- Evidence items for Case 1
INSERT INTO financial_case_evidence (case_id, evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
SELECT fc.id, e.evidence_type, e.title, e.description, e.source_system, e.severity, e.confidence, e.metadata, e.collected_at::timestamptz, e.collected_by
FROM financial_cases fc
CROSS JOIN (VALUES
  ('transaction', 'Fraudulent PIX Transfer Batch #1', '23 unauthorized PIX transfers totaling R$890,000 executed within 15-minute window', 'pix_monitoring', 'critical', 0.98, '{"transfer_count":23,"total_brl":890000,"avg_amount":38695,"time_window_minutes":15}'::jsonb, '2026-03-20T04:15:00Z', 'system'),
  ('log', 'SIM Swap Authorization Log', 'Carrier authorization log showing SIM swap for 12 target phone numbers within 48 hours', 'carrier_api', 'high', 0.93, '{"carrier":"Vivo","swap_count":12,"timeframe_hours":48}'::jsonb, '2026-03-20T06:30:00Z', 'Ana Ribeiro'),
  ('network_capture', 'Telegram C2 Channel Intercept', 'Intercepted communications from Telegram channel coordinating mule account transfers', 'sigint', 'critical', 0.91, '{"channel_members":23,"messages_captured":156,"languages":["pt-BR","en"]}'::jsonb, '2026-03-22T14:00:00Z', 'threat_intel'),
  ('behavioral', 'Credential Stuffing Attack Pattern', 'Login attempt analysis showing distributed credential stuffing from 156 unique IPs', 'waf', 'high', 0.95, '{"unique_ips":156,"total_attempts":45000,"success_rate":0.001,"country_distribution":{"BR":89,"US":34,"RU":18,"CN":15}}'::jsonb, '2026-03-20T02:30:00Z', 'system'),
  ('document', 'Dark Web Listing Screenshot', 'Screenshot of BreachForums listing offering bulk PIX credentials with 2FA bypass', 'dark_web_crawler', 'critical', 0.89, '{"marketplace":"BreachForums","seller":"ghost_pix_br","price_usd":15000,"listing_date":"2026-03-14"}'::jsonb, '2026-03-18T14:00:00Z', 'threat_intel')
) AS e(evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
WHERE fc.case_number = 'FIN-CASE-001';

-- Evidence items for Case 2
INSERT INTO financial_case_evidence (case_id, evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
SELECT fc.id, e.evidence_type, e.title, e.description, e.source_system, e.severity, e.confidence, e.metadata, e.collected_at::timestamptz, e.collected_by
FROM financial_cases fc
CROSS JOIN (VALUES
  ('log', 'After-Hours Access Logs', 'Anomalous access to secrets manager between 11pm-3am over 14 consecutive days', 'vault', 'high', 0.93, '{"access_count":47,"unusual_hours":true,"days":14}'::jsonb, '2026-02-25T08:30:00Z', 'Pedro Santos'),
  ('behavioral', 'Git Audit Log Deletion', 'Developer deleted git audit logs covering 3-week period of unauthorized access', 'git_monitor', 'critical', 0.96, '{"deleted_logs_days":21,"normal_behavior":false}'::jsonb, '2026-02-25T09:00:00Z', 'forensics'),
  ('transaction', 'Unauthorized Trading Activity', 'Off-hours algorithmic trades totaling $1.45M in profits over 3 weeks', 'trading_monitor', 'critical', 0.98, '{"total_trades":340,"total_profit_usd":1450000,"avg_trade_usd":4264}'::jsonb, '2026-02-25T10:00:00Z', 'system'),
  ('network_capture', 'Data Exfiltration to Personal Cloud', 'API keys transferred to personal Google Drive via encrypted channel', 'dlp', 'critical', 0.96, '{"destination":"personal_gdrive","file_count":3,"encrypted":true}'::jsonb, '2026-02-20T01:15:00Z', 'dlp_engine')
) AS e(evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
WHERE fc.case_number = 'FIN-CASE-002';

-- Evidence for Case 5
INSERT INTO financial_case_evidence (case_id, evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
SELECT fc.id, e.evidence_type, e.title, e.description, e.source_system, e.severity, e.confidence, e.metadata, e.collected_at::timestamptz, e.collected_by
FROM financial_cases fc
CROSS JOIN (VALUES
  ('behavioral', 'Synchronized Trading Pattern Analysis', '214 accounts executing trades within 50ms of each other across 3 asset classes', 'market_surveillance', 'critical', 0.96, '{"accounts":214,"sync_threshold_ms":50,"asset_classes":3}'::jsonb, '2026-03-15T14:30:00Z', 'system'),
  ('log', 'Bot Account Creation Timeline', 'Account registration analysis showing 214 accounts created from 12 IP ranges over 6 months', 'kyc_system', 'high', 0.88, '{"accounts":214,"ip_ranges":12,"creation_period_months":6}'::jsonb, '2026-03-15T16:00:00Z', 'Rafael Costa'),
  ('network_capture', 'ML Model Communication Pattern', 'Network traffic analysis revealing adaptive ML-based trading algorithm with C2 communication', 'nids', 'high', 0.85, '{"c2_endpoints":3,"model_updates_detected":8}'::jsonb, '2026-03-16T10:00:00Z', 'network_forensics')
) AS e(evidence_type, title, description, source_system, severity, confidence, metadata, collected_at, collected_by)
WHERE fc.case_number = 'FIN-CASE-005';

-- Comments for multiple cases
INSERT INTO financial_case_comments (case_id, author, author_role, content, comment_type, is_internal, created_at)
SELECT fc.id, c.author, c.author_role, c.content, c.comment_type, c.is_internal, c.created_at::timestamptz
FROM financial_cases fc
CROSS JOIN (VALUES
  ('Ana Ribeiro', 'senior_analyst', 'Opening P1 case. Initial scope assessment: 47 compromised accounts with combined exposure of R$2.3M. SIM swap technique confirmed via carrier logs. Engaging carrier security team for insider investigation.', 'note', true, '2026-03-20T06:00:00Z'),
  ('Carlos Mendes', 'threat_intel', 'Carrier insider at Vivo confirmed. Employee badge ID VIV-2847. Has been facilitating SIM swaps since January. Coordinating with Vivo internal security for evidence preservation.', 'update', true, '2026-03-21T10:00:00Z'),
  ('Ana Ribeiro', 'senior_analyst', 'Telegram C2 channel successfully infiltrated by threat intel team. 23 active members identified. Channel has been active since January 2026. Multiple languages detected suggesting international operation.', 'update', true, '2026-03-22T14:00:00Z'),
  ('CISO Office', 'ciso', 'Board notification sent regarding financial exposure. Legal team approved law enforcement engagement. Federal Police cyber division contact established.', 'escalation', false, '2026-03-23T09:00:00Z'),
  ('Ana Ribeiro', 'senior_analyst', 'Mule account network fully mapped. 12 primary mule accounts identified with connections to 3 cryptocurrency exchanges. Blockchain analysis in progress to trace fund flow.', 'update', true, '2026-03-23T14:00:00Z')
) AS c(author, author_role, content, comment_type, is_internal, created_at)
WHERE fc.case_number = 'FIN-CASE-001';

INSERT INTO financial_case_comments (case_id, author, author_role, content, comment_type, is_internal, created_at)
SELECT fc.id, c.author, c.author_role, c.content, c.comment_type, c.is_internal, c.created_at::timestamptz
FROM financial_cases fc
CROSS JOIN (VALUES
  ('Pedro Santos', 'lead_analyst', 'Forensic workstation imaging complete. Evidence preserved under legal hold. Developer profile shows 4 years of clean service before anomalous behavior began in January.', 'note', true, '2026-02-26T14:00:00Z'),
  ('Legal Team', 'legal', 'SEC and CVM notifications prepared. Trading records subpoenaed. Employee employment agreement reviewed for IP and trading restrictions.', 'update', false, '2026-02-27T10:00:00Z'),
  ('Pedro Santos', 'lead_analyst', 'Psychological assessment indicates recent financial stress as potential motivator. Divorce proceedings filed in December 2025. Cross-referencing with behavioral timeline.', 'update', true, '2026-02-28T09:00:00Z')
) AS c(author, author_role, content, comment_type, is_internal, created_at)
WHERE fc.case_number = 'FIN-CASE-002';

INSERT INTO financial_case_comments (case_id, author, author_role, content, comment_type, is_internal, created_at)
SELECT fc.id, c.author, c.author_role, c.content, c.comment_type, c.is_internal, c.created_at::timestamptz
FROM financial_cases fc
CROSS JOIN (VALUES
  ('Rafael Costa', 'market_surveillance', 'Emergency trading halt executed. 214 bot accounts suspended. Initial analysis shows ML-based adaptive trading algorithm that modifies behavior in response to detection attempts.', 'note', true, '2026-03-15T15:30:00Z'),
  ('Rafael Costa', 'market_surveillance', 'Bot creation analysis reveals sophisticated KYC bypass. Synthetic identities used with deepfake verification photos. Engaging identity verification vendor for forensic analysis.', 'update', true, '2026-03-16T10:00:00Z'),
  ('CVM Liaison', 'regulatory', 'CVM investigation opened. Market impact assessment in progress. Preliminary estimate: $5.6M in manipulated volume across target assets.', 'escalation', false, '2026-03-17T09:00:00Z')
) AS c(author, author_role, content, comment_type, is_internal, created_at)
WHERE fc.case_number = 'FIN-CASE-005';

INSERT INTO financial_case_comments (case_id, author, author_role, content, comment_type, is_internal, created_at)
SELECT fc.id, c.author, c.author_role, c.content, c.comment_type, c.is_internal, c.created_at::timestamptz
FROM financial_cases fc
CROSS JOIN (VALUES
  ('Pedro Santos', 'lead_analyst', 'Typing biometrics confirm 3 distinct operators on this VPN account. Original employee operator plus 2 external buyers. Keystroke dynamics divergence score: 0.87.', 'note', true, '2026-04-12T08:00:00Z'),
  ('Pedro Santos', 'lead_analyst', 'Honeypot credential deployed. Canary token embedded in fake admin access. Will trigger alert on first use by external operator.', 'update', true, '2026-04-13T10:00:00Z'),
  ('CISO Office', 'ciso', 'Escalated to board security committee. This represents active ongoing exploitation of internal infrastructure. Recommending immediate termination and legal action.', 'escalation', false, '2026-04-15T09:00:00Z')
) AS c(author, author_role, content, comment_type, is_internal, created_at)
WHERE fc.case_number = 'FIN-CASE-008';
