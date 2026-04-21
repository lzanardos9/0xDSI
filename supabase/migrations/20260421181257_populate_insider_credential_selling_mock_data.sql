/*
  # Populate Insider Credential Selling Mock Data

  12 detailed credential selling cases spanning multiple detection methods:
  - Willing seller caught via dark web monitoring
  - Multi-operator behavioral analysis detection
  - Financial correlation (incoming crypto payments before handoffs)
  - Internal access selling (VPN, API keys)
  - Confirmed mule recruiter selling banking access
  - Employee selling corporate API credentials

  20 dark web marketplace hits across multiple marketplaces
*/

-- Credential Selling Cases (12 cases)
INSERT INTO credential_selling_cases (case_id, entity_id, entity_name, account_type, seller_confidence, risk_tier, status, detection_method, first_indicator_at, dark_web_intel, behavioral_fingerprints, handoff_timeline, financial_indicators, multi_operator_evidence, credential_rotation_events, network_connections, investigation_notes, created_at) VALUES

-- Case 1: Confirmed seller - banking credentials on dark web
('CS-001', 'CPF-000.111.222-33', 'Vanessa Torres Gomes', 'banking', 94, 'critical', 'confirmed', 'dark_web_hit',
  NOW() - INTERVAL '15 days',
  '{"marketplace":"BreachForums","listing_url":"[REDACTED]","price_usd":350,"seller_handle":"v4n3ss4_br","seller_reputation":4.2,"listing_active":true,"listing_age_days":12,"buyer_count":3,"includes_pix_keys":true,"includes_2fa_method":"SIM clone instructions"}',
  '[{"operator_id":"OP-A","label":"Original Owner","typing_wpm":55,"click_velocity":1.3,"scroll_depth":0.4,"mouse_pattern":"organic","navigation":["dashboard","pix","extract"],"active_hours":[9,18],"sessions_last_30d":45,"last_seen":"2024-12-13T18:00:00Z"},{"operator_id":"OP-B","label":"Buyer 1","typing_wpm":82,"click_velocity":2.4,"scroll_depth":0.12,"mouse_pattern":"scripted","navigation":["pix","pix","pix"],"active_hours":[1,5],"sessions_last_30d":8,"first_seen":"2024-12-08T01:30:00Z","last_seen":"2024-12-13T03:00:00Z"},{"operator_id":"OP-C","label":"Buyer 2","typing_wpm":68,"click_velocity":1.9,"scroll_depth":0.2,"mouse_pattern":"semi-organic","navigation":["dashboard","pix","cards"],"active_hours":[22,4],"sessions_last_30d":5,"first_seen":"2024-12-11T22:00:00Z","last_seen":"2024-12-14T02:00:00Z"}]',
  '[{"timestamp":"2024-12-01T10:00:00Z","event":"dark_web_listing_discovered","detail":"Banking credentials for Vanessa listed on BreachForums by seller v4n3ss4_br for $350. Listing includes PIX keys and SIM clone instructions."},{"timestamp":"2024-12-05T14:00:00Z","event":"credential_match_confirmed","detail":"Listed email and partial CPF match Vanessas account. Password hash from listing matches current stored hash."},{"timestamp":"2024-12-08T01:30:00Z","event":"first_handoff_detected","detail":"New behavioral fingerprint OP-B appeared at 1:30 AM. Typing speed 82 WPM vs baseline 55 WPM. Navigation exclusively PIX-focused."},{"timestamp":"2024-12-10T16:00:00Z","event":"credential_rotation","detail":"Password changed by original owner (OP-A fingerprint). New listing update detected on BreachForums 2h later."},{"timestamp":"2024-12-11T22:00:00Z","event":"second_buyer_detected","detail":"Third distinct fingerprint OP-C appeared. Different from both OP-A and OP-B."},{"timestamp":"2024-12-13T18:00:00Z","event":"owner_last_activity","detail":"Original owner last legitimate session. Account now exclusively used by OP-B and OP-C."}]',
  '[{"type":"crypto_receipt","amount_usd":180,"timestamp":"2024-11-28T20:00:00Z","source":"Bitcoin wallet via Binance P2P","detail":"BTC deposit equivalent to ~$180 received 3 days before dark web listing appeared"},{"type":"pix_incoming","amount_brl":500,"timestamp":"2024-12-07T15:00:00Z","source":"CPF-UNKNOWN-001","detail":"Incoming PIX from unidentified account. Possible partial payment from buyer."},{"type":"crypto_receipt","amount_usd":170,"timestamp":"2024-12-10T18:00:00Z","detail":"Second crypto payment received same day as credential rotation and listing update"}]',
  '{"total_operators_detected":3,"operator_switching_frequency":"2-3 days","overlap_sessions":0,"distinct_device_fingerprints":4,"distinct_ip_ranges":3,"behavioral_divergence_score":0.89,"session_handoff_pattern":"clean_separation","evidence_strength":"strong"}',
  '[{"timestamp":"2024-12-10T16:00:00Z","type":"password_change","initiated_by":"OP-A","correlated_event":"Dark web listing updated 2h later with note: fresh creds"},{"timestamp":"2024-12-05T09:00:00Z","type":"pix_key_addition","initiated_by":"OP-A","correlated_event":"New random PIX key added, possibly for buyer use"}]',
  '[{"entity":"v4n3ss4_br","type":"dark_web_seller","relationship":"self_or_associate","confidence":0.92},{"entity":"CPF-678.901.234-55","type":"mule_account","relationship":"buyer_destination","confidence":0.78},{"entity":"CPF-333.444.555-66","type":"mule_account","relationship":"buyer_destination","confidence":0.65}]',
  'CONFIRMED SELLER: Vanessa is willfully selling banking credentials on BreachForums. Evidence chain: (1) Listing matches her credentials exactly, (2) password hash match, (3) crypto payments received before listing, (4) credential rotation correlated with listing updates, (5) 3 distinct operators detected post-listing. Recommend: account freeze + law enforcement referral.',
  NOW() - INTERVAL '15 days'),

-- Case 2: Suspected seller - corporate API credentials
('CS-002', 'EMP-TECH-042', 'Ricardo Mendes Santos', 'api_key', 78, 'high', 'suspected', 'financial_correlation',
  NOW() - INTERVAL '8 days',
  '{"marketplace":"Telegram Channel","channel":"@br_access_shop","listing_type":"Corporate API with admin scope","price_usd":2500,"seller_handle":"r1c4rd0_dev","listing_active":true}',
  '[{"operator_id":"OP-LEGIT","label":"Employee (Ricardo)","typing_wpm":62,"click_velocity":0.8,"api_usage_pattern":"development","endpoints_accessed":["/api/v3/users","/api/v3/transactions","/api/v3/reports"],"active_hours":[9,18],"sessions_last_30d":120},{"operator_id":"OP-EXTERNAL","label":"External Operator","typing_wpm":45,"click_velocity":1.5,"api_usage_pattern":"enumeration","endpoints_accessed":["/api/v3/users/export","/api/v3/transactions/bulk","/api/v3/admin/config","/api/v3/admin/keys"],"active_hours":[23,4],"sessions_last_30d":15,"first_seen":"2024-12-07T23:15:00Z"}]',
  '[{"timestamp":"2024-12-03T12:00:00Z","event":"unusual_api_key_generation","detail":"Ricardo generated 3 new API keys in one day. Normal rate: 1 per month. Keys have admin scope."},{"timestamp":"2024-12-05T20:00:00Z","event":"telegram_listing_detected","detail":"Listing in @br_access_shop Telegram channel offering corporate API access with admin scope matching our systems capabilities."},{"timestamp":"2024-12-07T23:15:00Z","event":"external_usage_detected","detail":"One of the generated API keys used from non-corporate IP at 11:15 PM. Accessing /admin/config endpoint."},{"timestamp":"2024-12-10T01:00:00Z","event":"data_enumeration","detail":"Bulk export of 15,000 user records via /users/export endpoint using Ricardos API key from external IP."}]',
  '[{"type":"crypto_receipt","amount_usd":1200,"timestamp":"2024-12-06T21:00:00Z","source":"Monero wallet","detail":"XMR deposit equivalent to ~$1,200 received day after Telegram listing appeared. Matches typical 50% upfront payment pattern."},{"type":"pix_incoming","amount_brl":3000,"timestamp":"2024-12-09T14:00:00Z","source":"CNPJ-SHELL-001","detail":"PIX from shell company. Possible second installment payment."}]',
  '{"total_operators_detected":2,"api_key_sharing_detected":true,"external_ip_usage":true,"admin_endpoint_access_by_external":true,"data_exfiltration_volume":"15,000 records","evidence_strength":"strong"}',
  '[{"timestamp":"2024-12-03T12:00:00Z","type":"api_key_generation","count":3,"scope":"admin","normal_rate":"1/month"},{"timestamp":"2024-12-08T09:00:00Z","type":"api_key_rotation","initiated_by":"OP-LEGIT","detail":"Rotated key after external usage detected; generated replacement immediately"}]',
  '[{"entity":"r1c4rd0_dev","type":"telegram_seller","relationship":"strong_match","confidence":0.85},{"entity":"IP-185.220.101.xx","type":"buyer_infrastructure","relationship":"api_consumer","confidence":0.9}]',
  'SUSPECTED: Ricardo likely selling corporate API credentials via Telegram. Key evidence: (1) Unusual API key generation pattern, (2) Telegram listing matches our API capabilities, (3) External IP using his API keys for admin access and data export, (4) Crypto payment received day after listing, (5) Key rotation after detection suggests awareness. Awaiting legal review before escalation.',
  NOW() - INTERVAL '8 days'),

-- Case 3: Confirmed mule recruiter selling banking access
('CS-003', 'CPF-901.234.567-88', 'Camila Rodrigues Pinto', 'banking', 87, 'critical', 'confirmed', 'multi_operator',
  NOW() - INTERVAL '20 days',
  '{"marketplace":"WhatsApp Group","group_name":"Renda Extra Facil","members_estimate":450,"recruitment_method":"social_media_ads","payment_per_account":"R$500-2000","volume":"recruiting 5-10 sellers per week"}',
  '[{"operator_id":"OP-CAMILA","label":"Account Holder (Camila)","typing_wpm":48,"click_velocity":0.9,"scroll_depth":0.6,"mouse_pattern":"organic","navigation":["dashboard","pix","cards","cashback"],"active_hours":[10,22],"sessions_last_30d":35},{"operator_id":"OP-RECRUITER","label":"Mule Network Operator","typing_wpm":75,"click_velocity":2.2,"scroll_depth":0.08,"mouse_pattern":"efficient","navigation":["pix"],"active_hours":[0,6],"sessions_last_30d":18,"first_seen":"2024-11-25T00:30:00Z"}]',
  '[{"timestamp":"2024-11-20T00:00:00Z","event":"recruitment_detected","detail":"Camilas phone number found in WhatsApp group Renda Extra Facil, a known mule recruitment channel offering R$500-2000 per account."},{"timestamp":"2024-11-25T00:30:00Z","event":"first_external_operator","detail":"New behavioral fingerprint detected at 12:30 AM. Navigation exclusively PIX-focused. Typing speed 57% faster than Camila."},{"timestamp":"2024-11-28T14:00:00Z","event":"device_sharing","detail":"Camilas account accessed from device DEV-020 (known mule network device shared across 3 synthetic accounts)."},{"timestamp":"2024-12-01T03:00:00Z","event":"mule_transfer_pattern","detail":"Series of incoming PIX from compromised accounts, immediately forwarded. Classic mule layering."},{"timestamp":"2024-12-10T16:00:00Z","event":"recruitment_escalation","detail":"Camilas account now used as a recruitment demo showing potential sellers how the scheme works."}]',
  '[{"type":"pix_incoming","amount_brl":1500,"timestamp":"2024-11-22T18:00:00Z","source":"CPF-UNKNOWN-RECRUITER","detail":"Payment from suspected recruiter for providing account access"},{"type":"pix_incoming","amount_brl":800,"timestamp":"2024-12-01T20:00:00Z","source":"CPF-UNKNOWN-RECRUITER","detail":"Second recruitment payment"},{"type":"crypto_receipt","amount_usd":250,"timestamp":"2024-12-05T22:00:00Z","detail":"Crypto bonus payment for successful mule activity"}]',
  '{"total_operators_detected":2,"device_shared_with_mule_network":true,"mule_transfer_volume":"R$45,000 in 20 days","recruitment_evidence":true,"whatsapp_group_membership":true,"evidence_strength":"very_strong"}',
  '[{"timestamp":"2024-11-24T10:00:00Z","type":"password_change","detail":"Changed password before first external access. Likely provided new credentials to buyer."},{"timestamp":"2024-12-03T09:00:00Z","type":"pix_key_change","detail":"Added CPF-based PIX key. Original phone-based key retained. Dual-key setup for operator flexibility."}]',
  '[{"entity":"Renda Extra Facil (WhatsApp)","type":"recruitment_channel","relationship":"active_member","confidence":0.95},{"entity":"CPF-678.901.234-55","type":"mule_network_node","relationship":"transfer_destination","confidence":0.92},{"entity":"CPF-333.444.555-66","type":"synthetic_mule","relationship":"network_member","confidence":0.88}]',
  'CONFIRMED MULE RECRUITER ACCESS: Camila is actively participating in the Renda Extra Facil recruitment network. She provides account access to mule operators in exchange for R$500-2000 payments. Her account has processed R$45,000 in mule transfers over 20 days. Device DEV-020 links her directly to the synthetic identity cluster. Law enforcement notified. COAF report filed.',
  NOW() - INTERVAL '20 days'),

-- Case 4: Employee selling VPN credentials
('CS-004', 'EMP-IT-017', 'Lucas Ferreira de Oliveira', 'vpn', 72, 'high', 'suspected', 'behavioral_analysis',
  NOW() - INTERVAL '5 days',
  '{"marketplace":"RaidForums successor","listing_type":"Corporate VPN + AD credentials","price_usd":5000,"listing_active":true}',
  '[{"operator_id":"OP-LUCAS","label":"Employee (Lucas)","vpn_hours":[8,18],"typical_destinations":["internal-wiki","jira","gitlab","slack"],"avg_data_transfer_mb":45,"sessions_last_30d":22},{"operator_id":"OP-INTRUDER","label":"External Actor","vpn_hours":[1,5],"typical_destinations":["ad-controller","file-server","financial-db","hr-system"],"avg_data_transfer_mb":2800,"sessions_last_30d":6,"first_seen":"2024-12-10T01:15:00Z"}]',
  '[{"timestamp":"2024-12-08T17:00:00Z","event":"vpn_config_export","detail":"Lucas exported VPN configuration file. Unusual - config auto-distributes via MDM."},{"timestamp":"2024-12-10T01:15:00Z","event":"off_hours_vpn_session","detail":"VPN session from non-corporate IP at 1:15 AM. Destination: AD controller. Lucas has never accessed AD directly."},{"timestamp":"2024-12-11T02:00:00Z","event":"data_access_anomaly","detail":"Financial database accessed via VPN. 2.8GB transferred. Lucas has no business reason for financial DB access."},{"timestamp":"2024-12-12T03:30:00Z","event":"hr_system_enumeration","detail":"HR system accessed. Employee PII bulk export attempted. Blocked by DLP but attempt logged."}]',
  '[{"type":"crypto_receipt","amount_usd":2500,"timestamp":"2024-12-09T20:00:00Z","source":"Bitcoin via P2P exchange","detail":"BTC payment received day after VPN config export and day before first external usage"}]',
  '{"total_operators_detected":2,"vpn_sharing_detected":true,"off_hours_access":true,"unusual_destinations":true,"data_exfil_attempted":true,"evidence_strength":"moderate_to_strong"}',
  '[{"timestamp":"2024-12-08T16:55:00Z","type":"vpn_config_export","detail":"Manual export of .ovpn configuration"},{"timestamp":"2024-12-12T09:00:00Z","type":"password_change","detail":"Changed AD password after external sessions. New password potentially shared."}]',
  '[{"entity":"dark_web_listing_ID-44821","type":"marketplace_listing","relationship":"credential_match","confidence":0.75}]',
  'SUSPECTED: Lucas appears to be selling VPN + AD credentials. Key indicators: (1) VPN config export with no business justification, (2) crypto payment day before external usage began, (3) external operator accessing high-value targets (AD, financial DB, HR) during off-hours via Lucas credentials, (4) AD password change post-detection suggests ongoing credential refresh cycle. Recommend: credential revocation + forensic workstation analysis.',
  NOW() - INTERVAL '5 days'),

-- Case 5: Banking employee selling customer credentials
('CS-005', 'EMP-BANK-089', 'Adriana Costa Vieira', 'internal_access', 91, 'critical', 'confirmed', 'peer_report',
  NOW() - INTERVAL '30 days',
  '{"marketplace":"Telegram + Dark Web Forum","channels":["@bank_access_premium","Genesis Market successor"],"listing_type":"Customer banking sessions with cookies","price_per_account_usd":50,"volume":"~200 accounts listed","seller_handle":"adri_insider"}',
  '[{"operator_id":"OP-ADRIANA","label":"Bank Employee","system_access_pattern":"customer_service","avg_accounts_accessed_daily":35,"typical_actions":["view_balance","process_dispute","update_contact"],"active_hours":[8,17]},{"operator_id":"OP-PATTERN-ANOMALY","label":"Anomalous Access Pattern","accounts_accessed_burst":200,"actions":["export_session","copy_cookies","screenshot_2fa"],"active_hours":[12,13],"detail":"Lunch hour bulk access pattern"}]',
  '[{"timestamp":"2024-11-15T00:00:00Z","event":"peer_report","detail":"Anonymous tip from colleague: Adriana bragging about side income from selling bank account access."},{"timestamp":"2024-11-18T12:15:00Z","event":"lunch_hour_anomaly_detected","detail":"Adriana accessed 45 customer accounts in 48 minutes during lunch. Normal rate: 3-4 per hour. Actions included session export and cookie capture."},{"timestamp":"2024-11-22T12:00:00Z","event":"pattern_confirmed","detail":"Second lunch-hour burst: 38 accounts accessed with identical export pattern."},{"timestamp":"2024-11-25T20:00:00Z","event":"dark_web_correlation","detail":"200 customer session cookies from our institution appeared on Genesis Market successor. Timing and account overlap matches Adrianas access logs."},{"timestamp":"2024-12-01T00:00:00Z","event":"honeypot_triggered","detail":"Canary account inserted into Adrianas queue was accessed and exported. Session appeared on dark web 4 hours later."},{"timestamp":"2024-12-05T09:00:00Z","event":"confirmed_and_terminated","detail":"Employee terminated. Credentials revoked. All affected customer accounts flagged for password reset."}]',
  '[{"type":"pix_incoming","amount_brl":8500,"timestamp":"2024-11-20T19:00:00Z","source":"Multiple small PIX from 12 different senders","detail":"Micro-payments pattern consistent with per-account pricing (R$50 = ~$10 per account x many buyers)"},{"type":"crypto_receipt","amount_usd":3200,"timestamp":"2024-11-28T21:00:00Z","source":"Monero wallet","detail":"Large XMR payment. Likely bulk purchase payment from dark web buyer."},{"type":"cash_deposit","amount_brl":5000,"timestamp":"2024-12-02T14:00:00Z","detail":"Cash deposit at ATM. Possible cash-out from in-person credential sales."}]',
  '{"insider_access_abused":true,"customer_accounts_compromised":200,"session_cookies_exported":true,"honeypot_confirmed":true,"peer_report_corroborated":true,"evidence_strength":"conclusive"}',
  '[]',
  '[{"entity":"adri_insider","type":"dark_web_seller","relationship":"confirmed_identity","confidence":0.97},{"entity":"Genesis Market successor","type":"marketplace","relationship":"active_seller","confidence":0.95},{"entity":"@bank_access_premium","type":"telegram_channel","relationship":"operator","confidence":0.9}]',
  'CONFIRMED INSIDER THREAT: Adriana was systematically exporting customer session cookies during lunch breaks and selling them on dark web marketplaces. ~200 customer accounts compromised. Honeypot confirmation achieved. Employee terminated. Law enforcement referral completed. All affected customers notified and credentials reset. COAF and BACEN reports filed.',
  NOW() - INTERVAL '30 days'),

-- Case 6: Suspected email credential selling
('CS-006', 'CPF-445.556.778-89', 'Aline Marques Ribeiro', 'banking', 52, 'medium', 'monitoring', 'behavioral_analysis',
  NOW() - INTERVAL '3 days',
  '{}',
  '[{"operator_id":"OP-ALINE","label":"Account Holder","typing_wpm":50,"click_velocity":1.0,"scroll_depth":0.5,"mouse_pattern":"organic","active_hours":[6,23],"sessions_last_30d":40},{"operator_id":"OP-UNKNOWN","label":"Possible Second Operator","typing_wpm":63,"click_velocity":1.7,"scroll_depth":0.3,"mouse_pattern":"semi-organic","active_hours":[2,5],"sessions_last_30d":3,"first_seen":"2024-12-12T02:00:00Z"}]',
  '[{"timestamp":"2024-12-12T02:00:00Z","event":"off_hours_session","detail":"Session at 2 AM from Alines usual device but different behavioral fingerprint. Typing 26% faster, navigation more direct."},{"timestamp":"2024-12-13T03:30:00Z","event":"second_off_hours_session","detail":"Similar pattern. Different fingerprint. Accessed PIX and added 1 new recipient."},{"timestamp":"2024-12-14T18:00:00Z","event":"transaction_frequency_spike","detail":"Transaction frequency doubled. 3 new recipients added. Progressive amount increases."}]',
  '[{"type":"pix_incoming","amount_brl":300,"timestamp":"2024-12-11T20:00:00Z","source":"CPF-UNKNOWN-002","detail":"Small incoming PIX from unknown sender day before first anomalous session"}]',
  '{"total_operators_detected":2,"confidence_in_second_operator":0.65,"behavioral_divergence_score":0.52,"evidence_strength":"moderate"}',
  '[]',
  '[]',
  'MONITORING: Early indicators of possible credential sharing. Two distinct behavioral fingerprints detected, but divergence score is moderate (0.52). The off-hours sessions and incoming payment before first anomalous session are concerning but not conclusive. Continuing behavioral monitoring with enhanced session fingerprinting.',
  NOW() - INTERVAL '3 days'),

-- Case 7: Corporate email credentials
('CS-007', 'EMP-FIN-023', 'Marcelo Augusto Teixeira', 'email', 65, 'medium', 'suspected', 'dark_web_hit',
  NOW() - INTERVAL '10 days',
  '{"marketplace":"Russian Forum","listing_type":"Corporate email with financial system SSO","price_usd":800,"seller_handle":"marce_corp","listing_description":"Brazilian fintech corporate email. SSO access to internal financial systems, Slack, Confluence, GitLab. Fresh credentials, updated weekly."}',
  '[{"operator_id":"OP-MARCELO","label":"Employee","email_pattern":"normal","login_hours":[8,18],"typical_actions":["email","confluence","slack"]},{"operator_id":"OP-EXTERNAL","label":"External Access","login_hours":[22,3],"typical_actions":["sso_financial_system","confluence_export","slack_channel_scrape"],"first_seen":"2024-12-05T22:00:00Z"}]',
  '[{"timestamp":"2024-12-01T00:00:00Z","event":"dark_web_listing_found","detail":"Corporate email credentials matching Marcelos format found on Russian forum. Listing promises weekly updates."},{"timestamp":"2024-12-05T22:00:00Z","event":"sso_off_hours","detail":"SSO authentication to financial system at 10 PM from non-corporate IP. Marcelo has no history of after-hours financial system access."},{"timestamp":"2024-12-08T23:00:00Z","event":"confluence_bulk_export","detail":"150 pages exported from internal Confluence space via SSO at 11 PM. Includes system architecture documentation."},{"timestamp":"2024-12-10T01:00:00Z","event":"slack_scrape_detected","detail":"Automated scraping of 3 Slack channels (engineering, incidents, deployments) detected via SSO session."}]',
  '[{"type":"crypto_receipt","amount_usd":400,"timestamp":"2024-11-29T19:00:00Z","source":"Bitcoin","detail":"BTC payment 2 days before dark web listing appeared"}]',
  '{"sso_abuse_detected":true,"off_hours_financial_access":true,"bulk_documentation_export":true,"slack_scraping":true,"evidence_strength":"moderate_to_strong"}',
  '[{"timestamp":"2024-12-04T09:00:00Z","type":"password_change","detail":"Password changed. Dark web listing updated same day with note: refreshed."},{"timestamp":"2024-12-09T09:00:00Z","type":"password_change","detail":"Second password change. Consistent with weekly refresh promise in listing."}]',
  '[{"entity":"marce_corp","type":"dark_web_seller","relationship":"probable_match","confidence":0.78}]',
  'SUSPECTED: Marcelos corporate credentials appear on Russian forum with promise of weekly updates. Password rotation pattern matches listing claims. SSO abuse detected for financial system, Confluence, and Slack access during off-hours. Crypto payment received before listing. Recommend: immediate credential revocation + security interview.',
  NOW() - INTERVAL '10 days'),

-- Case 8: Account holder selling to specific criminal group
('CS-008', 'CPF-555.666.777-88', 'Marcos Vinicius Ramos', 'banking', 45, 'medium', 'monitoring', 'financial_correlation',
  NOW() - INTERVAL '7 days',
  '{}',
  '[{"operator_id":"OP-MARCOS","label":"Account Holder","typing_wpm":35,"click_velocity":1.6,"scroll_depth":0.25,"active_hours":[10,16],"sessions_last_30d":12}]',
  '[{"timestamp":"2024-12-08T00:00:00Z","event":"financial_anomaly","detail":"Three incoming PIX payments of R$200, R$300, R$500 from unknown accounts within 2 hours. No apparent business reason."},{"timestamp":"2024-12-10T00:00:00Z","event":"sim_swap_occurred","detail":"SIM swap attack on Marcos phone. However, investigation shows SIM swap may have been facilitated by Marcos himself (no social engineering of carrier detected)."},{"timestamp":"2024-12-10T01:00:00Z","event":"credential_handoff_suspected","detail":"Post-SIM-swap behavior could indicate willing handoff disguised as attack to claim victim status."}]',
  '[{"type":"pix_incoming","amount_brl":200,"timestamp":"2024-12-08T14:00:00Z","source":"CPF-UNKNOWN-003","detail":"First of 3 payments from unknown sources"},{"type":"pix_incoming","amount_brl":300,"timestamp":"2024-12-08T15:00:00Z","source":"CPF-UNKNOWN-004","detail":"Second payment"},{"type":"pix_incoming","amount_brl":500,"timestamp":"2024-12-08T16:00:00Z","source":"CPF-UNKNOWN-005","detail":"Third payment. Total R$1,000 received before SIM swap."}]',
  '{"total_operators_detected":1,"sim_swap_self_facilitated_probability":0.6,"insurance_fraud_indicators":true,"evidence_strength":"moderate"}',
  '[]',
  '[{"entity":"CPF-UNKNOWN-003","type":"possible_buyer","relationship":"payment_source","confidence":0.55}]',
  'MONITORING: Unusual pattern - Marcos may be staging a SIM swap as victim cover while actually selling credentials. The incoming payments before the SIM swap and the lack of social engineering evidence at the carrier are suspicious. Could also be genuine victim with coincidental payments. Need more data.',
  NOW() - INTERVAL '7 days'),

-- Case 9: API integration credentials being resold
('CS-009', 'API-INT-001', 'PaymentGateway API v3', 'api_key', 83, 'high', 'suspected', 'behavioral_analysis',
  NOW() - INTERVAL '12 days',
  '{"marketplace":"Exploit.in","listing_type":"Payment gateway API credentials with transaction capabilities","price_usd":15000,"high_value":true}',
  '[{"operator_id":"OP-LEGIT","label":"Legitimate Integration","request_pattern":"standard","endpoints":["/pix/initiate","/pix/status","/balance"],"avg_requests_min":450,"error_rate":0.02},{"operator_id":"OP-MALICIOUS","label":"Unauthorized Usage","request_pattern":"enumeration_then_exploit","endpoints":["/admin/config","/admin/keys","/pix/initiate","/users/export"],"avg_requests_min":1200,"error_rate":0.15,"first_seen":"2024-12-03T05:00:00Z"}]',
  '[{"timestamp":"2024-12-01T00:00:00Z","event":"dark_web_listing","detail":"Payment gateway API credentials listed on Exploit.in for $15,000. Description matches our API capabilities."},{"timestamp":"2024-12-03T05:00:00Z","event":"unauthorized_usage_spike","detail":"API usage 3.2x normal. Admin endpoints accessed. Possible credential sharing with buyer for testing."},{"timestamp":"2024-12-05T00:00:00Z","event":"enumeration_detected","detail":"Systematic endpoint enumeration from new IP range. Consistent with buyer performing capability assessment."}]',
  '[]',
  '{"legitimate_vs_malicious_traffic_ratio":"3:1","admin_endpoint_abuse":true,"new_ip_ranges":2,"data_exfil_via_api":true,"evidence_strength":"strong"}',
  '[{"timestamp":"2024-12-02T10:00:00Z","type":"api_key_regeneration","detail":"Primary API key regenerated. Old key still active for 24h transition period. Both keys used simultaneously from different IPs."}]',
  '[{"entity":"Exploit.in listing #88912","type":"marketplace","relationship":"credential_match","confidence":0.82}]',
  'SUSPECTED: PaymentGateway API credentials appear to have been sold or leaked. Listing on Exploit.in matches our systems. Unauthorized usage from new IP ranges targeting admin endpoints. Key regeneration pattern suggests ongoing credential sharing. Integration partner notified for investigation.',
  NOW() - INTERVAL '12 days'),

-- Case 10: Small-time seller - banking for quick cash
('CS-010', 'CPF-012.345.678-99', 'Thiago Nascimento Silva', 'banking', 35, 'medium', 'monitoring', 'multi_operator',
  NOW() - INTERVAL '4 days',
  '{}',
  '[{"operator_id":"OP-THIAGO","label":"Account Holder","typing_wpm":32,"click_velocity":0.8,"mouse_pattern":"organic","active_hours":[11,15],"sessions_last_30d":8},{"operator_id":"OP-POSSIBLE-2","label":"Possible Second User","typing_wpm":105,"click_velocity":2.8,"mouse_pattern":"bot","active_hours":[2,4],"sessions_last_30d":2,"first_seen":"2024-12-11T02:45:00Z"}]',
  '[{"timestamp":"2024-12-11T02:45:00Z","event":"behavioral_shift","detail":"Dramatic behavioral change: typing 3.3x faster, bot-like mouse patterns. However, this could also indicate malware rather than credential selling."},{"timestamp":"2024-12-12T00:00:00Z","event":"malware_vs_selling_analysis","detail":"Session analysis inconclusive. Bot patterns could be RAT overlay or could be automated tool used by credential buyer. Both hypotheses being tracked."}]',
  '[]',
  '{"total_operators_detected":2,"malware_probability":0.6,"selling_probability":0.35,"false_positive_probability":0.05,"evidence_strength":"weak_to_moderate"}',
  '[]',
  '[]',
  'MONITORING: Behavioral anomaly detected but unclear if this is credential selling or malware infection. The bot-like patterns are more consistent with banking RAT (see DET-005 for malware analysis), but the selling hypothesis cannot be ruled out. Dual-track investigation ongoing.',
  NOW() - INTERVAL '4 days'),

-- Case 11: Confirmed internal access seller - contractor
('CS-011', 'EMP-CONT-005', 'Daniel Rodrigues Almeida', 'internal_access', 96, 'critical', 'neutralized', 'dark_web_hit',
  NOW() - INTERVAL '45 days',
  '{"marketplace":"Multiple (BreachForums, Telegram, Direct sales)","listing_type":"Full internal network access + database credentials","price_usd":25000,"seller_handle":"d4n_access","buyer_count":2,"confirmed_sales":true}',
  '[{"operator_id":"OP-DANIEL","label":"Contractor","access_level":"database_admin","systems_accessed":["production_db","staging_db","backup_systems","monitoring"],"active_hours":[9,18]},{"operator_id":"OP-BUYER-1","label":"First Buyer","systems_accessed":["production_db","customer_pii_tables"],"active_hours":[3,6],"data_exfil":"450GB over 2 weeks"},{"operator_id":"OP-BUYER-2","label":"Second Buyer","systems_accessed":["production_db","financial_transactions","api_keys_table"],"active_hours":[0,4],"data_exfil":"120GB over 5 days"}]',
  '[{"timestamp":"2024-11-01T00:00:00Z","event":"dark_web_listing","detail":"Internal database access offered on multiple platforms for $25,000 by seller d4n_access."},{"timestamp":"2024-11-05T00:00:00Z","event":"credential_verified","detail":"Credentials in listing sample match Daniels database admin account."},{"timestamp":"2024-11-08T03:00:00Z","event":"first_buyer_access","detail":"External access to production DB at 3 AM. 450GB exfiltrated over 2 weeks."},{"timestamp":"2024-11-22T00:00:00Z","event":"second_buyer_access","detail":"Second buyer. 120GB exfiltrated targeting financial transactions and API keys."},{"timestamp":"2024-12-01T00:00:00Z","event":"contractor_terminated","detail":"Contract terminated. All credentials revoked. Database passwords rotated. Full incident response."}]',
  '[{"type":"wire_transfer","amount_usd":12500,"timestamp":"2024-10-30T00:00:00Z","source":"Foreign wire via intermediary bank","detail":"$12,500 wire transfer from offshore account 2 days before listing appeared"},{"type":"crypto_receipt","amount_usd":12500,"timestamp":"2024-11-20T00:00:00Z","source":"Bitcoin","detail":"Second payment matching $25,000 total for full access package"}]',
  '{"contractor_access_abused":true,"data_exfil_total_gb":570,"customer_records_exposed":"estimated 2.5M","financial_data_exposed":true,"api_keys_compromised":true,"evidence_strength":"conclusive"}',
  '[{"timestamp":"2024-11-03T09:00:00Z","type":"credential_creation","detail":"Created secondary admin account for persistence"},{"timestamp":"2024-11-15T09:00:00Z","type":"password_rotation","detail":"Rotated passwords and shared new ones with buyer. VPN tunnel credentials also refreshed."}]',
  '[{"entity":"d4n_access","type":"dark_web_seller","relationship":"confirmed","confidence":0.99},{"entity":"Buyer Group A","type":"data_broker","relationship":"customer","confidence":0.9},{"entity":"Buyer Group B","type":"cybercrime_syndicate","relationship":"customer","confidence":0.85}]',
  'NEUTRALIZED: Daniel (contractor) sold full database admin access for $25,000 to two separate buyers. Total data exfiltration: 570GB including ~2.5M customer records and financial transaction data. Contractor terminated, credentials revoked, all database passwords rotated, affected customers notified. Law enforcement referral completed. Civil lawsuit filed. Full incident response executed.',
  NOW() - INTERVAL '45 days'),

-- Case 12: New emerging case - early signals
('CS-012', 'CPF-999.000.111-22', 'Rodrigo Almeida Neto', 'banking', 28, 'low', 'monitoring', 'behavioral_analysis',
  NOW() - INTERVAL '1 day',
  '{}',
  '[{"operator_id":"OP-RODRIGO","label":"Account Holder","typing_wpm":47,"click_velocity":0.85,"mouse_pattern":"organic","active_hours":[9,17],"sessions_last_30d":25}]',
  '[{"timestamp":"2024-12-14T15:00:00Z","event":"social_engineering_call","detail":"Rodrigo received spoofed bank call. Post-call transfer to new recipient. Could be social engineering victim OR could be coordinating with attacker."},{"timestamp":"2024-12-14T16:00:00Z","event":"behavioral_consistency","detail":"Post-call session maintained Rodrigos behavioral fingerprint. If this were credential selling, we would expect the same fingerprint since Rodrigo would be the one making the transfer under guidance."}]',
  '[{"type":"pix_incoming","amount_brl":150,"timestamp":"2024-12-13T22:00:00Z","source":"CPF-UNKNOWN-006","detail":"Small incoming PIX the night before the spoofed call. Could be coincidence or payment for cooperation."}]',
  '{"total_operators_detected":1,"social_engineering_vs_complicity":"unclear","evidence_strength":"very_weak"}',
  '[]',
  '[]',
  'EARLY MONITORING: Single weak indicator - incoming payment before social engineering call. The social engineering attack on Rodrigo could be genuine victimization, or Rodrigo could be complicit (performing the transfer himself under agreement with attackers). Behavioral fingerprint consistency during the transfer suggests Rodrigo himself was operating the session. Needs more data points before escalation.',
  NOW() - INTERVAL '1 day');

-- Dark Web Marketplace Hits (20 records)
INSERT INTO credential_dark_web_hits (hit_id, marketplace, listing_type, entity_id, listing_price, currency, seller_handle, seller_reputation, listing_description, verification_status, credential_freshness, includes_2fa_bypass, sample_data, discovered_at, last_checked_at) VALUES

('DW-001', 'BreachForums', 'banking_credentials', 'CPF-000.111.222-33', 350, 'USD', 'v4n3ss4_br', 4.2, 'Brazilian banking account. Full PIX access. Includes all PIX keys, session cookies, and SIM clone instructions for 2FA bypass. Balance ~R$5,000. Fresh credentials, password updated weekly.', 'credential_match', 'current', true, '{"email_partial":"van***@gmail.com","cpf_partial":"000.111.***-33","bank":"Major Brazilian Bank","account_type":"checking"}', NOW() - INTERVAL '12 days', NOW() - INTERVAL '1 hour'),

('DW-002', 'BreachForums', 'banking_credentials', 'CPF-000.111.222-33', 350, 'USD', 'v4n3ss4_br', 4.2, '[UPDATED] Fresh credentials as of today. New password. PIX keys active. Verified by 3 buyers. Fast support via Telegram.', 'active_listing', 'current', true, '{"email_partial":"van***@gmail.com","verified_buyers":3}', NOW() - INTERVAL '5 days', NOW() - INTERVAL '30 minutes'),

('DW-003', 'Telegram Channel', 'banking_credentials', 'CPF-901.234.567-88', 500, 'BRL', 'renda_extra_facil_admin', 0, 'Conta bancaria completa para movimentacao. PIX ativo. Dono cooperativo - troca senha quando precisar. R$500 por semana de uso.', 'credential_match', 'current', false, '{"bank":"Digital Bank","account_type":"checking","pix_active":true}', NOW() - INTERVAL '18 days', NOW() - INTERVAL '2 hours'),

('DW-004', 'Russian Forum', 'full_identity', 'CPF-000.111.222-33', 800, 'USD', 'brazil_ids_premium', 3.8, 'Full Brazilian identity package: CPF, banking credentials, selfie with document for verification, utility bills. Can pass most KYC checks.', 'active_listing', 'current', true, '{"includes":"cpf,rg,selfie,proof_of_address,banking"}', NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 hours'),

('DW-005', 'Exploit.in', 'api_key', 'API-INT-001', 15000, 'USD', 'api_broker_br', 4.5, 'Brazilian payment gateway API credentials. Admin scope. Can initiate PIX transfers, access user data, modify configurations. Tested and working. Includes documentation.', 'credential_match', 'current', false, '{"api_type":"payment_gateway","scope":"admin","endpoints":["pix","users","config"]}', NOW() - INTERVAL '14 days', NOW() - INTERVAL '1 hour'),

('DW-006', 'Genesis Market Successor', 'banking_credentials', 'VICTIM-BATCH-001', 50, 'USD', 'adri_insider', 4.8, 'Brazilian bank session cookies. Fresh daily. Includes authenticated session, all cookies, browser fingerprint. Just load into anti-detect browser and you are in. Batch of 50 available.', 'active_listing', 'current', true, '{"bank":"Major Brazilian Bank","session_type":"authenticated_cookies","batch_size":50}', NOW() - INTERVAL '25 days', NOW() - INTERVAL '1 day'),

('DW-007', 'Genesis Market Successor', 'banking_credentials', 'VICTIM-BATCH-002', 50, 'USD', 'adri_insider', 4.8, 'New batch - 50 more accounts. Same bank. Premium quality session cookies with full fingerprint. Regular customers get priority.', 'active_listing', 'current', true, '{"batch_size":50,"repeat_seller":true}', NOW() - INTERVAL '20 days', NOW() - INTERVAL '1 day'),

('DW-008', 'Dark Web Forum', 'internal_system', 'EMP-CONT-005', 25000, 'USD', 'd4n_access', 3.5, 'PREMIUM: Full database admin access to Brazilian financial institution. Production + staging + backups. Includes VPN credentials, SSH keys, DB passwords. Ongoing access - I rotate creds weekly. 2 slots available.', 'credential_match', 'current', false, '{"access_type":"database_admin","systems":["production","staging","backup"],"includes_vpn":true}', NOW() - INTERVAL '45 days', NOW() - INTERVAL '30 days'),

('DW-009', 'Telegram Channel', 'vpn_access', 'EMP-IT-017', 5000, 'USD', 'corp_access_br', 0, 'Corporate VPN access to Brazilian fintech. AD credentials included. Can access internal wiki, financial systems, HR data. Fresh creds, updated when needed.', 'active_listing', 'current', false, '{"access_type":"vpn+ad","systems":["financial","hr","wiki","gitlab"]}', NOW() - INTERVAL '6 days', NOW() - INTERVAL '2 hours'),

('DW-010', 'Russian Forum', 'banking_credentials', 'CPF-789.012.345-66', 200, 'USD', 'phish_master_br', 3.2, 'Phished Brazilian banking credentials. Account holder clicked link yesterday. Credentials verified working. May need fast action before owner notices.', 'credential_match', 'recent', false, '{"obtained_via":"phishing","time_since_phish":"24h","password_changed":false}', NOW() - INTERVAL '19 hours', NOW() - INTERVAL '4 hours'),

('DW-011', 'BreachForums', 'banking_credentials', 'CPF-345.678.901-22', 150, 'USD', 'cred_dump_2024', 2.8, 'Brazilian bank account credentials from recent data breach. Not tested individually. Sold as-is. Discount for bulk.', 'credential_match', 'recent', false, '{"source":"data_breach","tested":false}', NOW() - INTERVAL '3 days', NOW() - INTERVAL '6 hours'),

('DW-012', 'Telegram Channel', 'banking_credentials', 'CPF-UNKNOWN-BATCH', 100, 'BRL', 'renda_extra_facil_admin', 0, 'Procuramos pessoas com conta bancaria ativa para renda extra. R$500-2000 por semana. Apenas empreste sua conta por algumas horas. Sem risco. Contato: @mule_recruit', 'active_listing', 'current', false, '{"type":"recruitment_ad","payment_range":"R$500-2000/week"}', NOW() - INTERVAL '22 days', NOW() - INTERVAL '1 hour'),

('DW-013', 'Russian Forum', 'api_key', 'EMP-FIN-023', 800, 'USD', 'marce_corp', 2.5, 'Brazilian fintech corporate email with SSO. Access financial systems, Confluence (architecture docs), Slack (incident channels), GitLab (source code). Fresh creds updated weekly as promised.', 'active_listing', 'current', false, '{"access_type":"corporate_email_sso","systems":["financial","confluence","slack","gitlab"]}', NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 hours'),

('DW-014', 'Dark Web Forum', 'banking_credentials', 'CPF-567.890.123-44', 300, 'USD', 'ato_specialist', 3.9, 'Premium ATO account. Brazilian bank, high balance (~R$15,000). Full access with session. Owner credentials obtained via targeted attack. 2FA bypassed.', 'credential_match', 'current', true, '{"balance_estimate":"R$15,000","2fa_status":"bypassed"}', NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 hours'),

('DW-015', 'BreachForums', 'full_identity', 'CPF-678.901.234-55', 50, 'USD', 'synthetic_factory', 4.0, 'Synthetic Brazilian identity with active bank account. Ready for immediate use. PIX active. Perfect for fund forwarding. Includes CPF, selfie, proof of address.', 'active_listing', 'current', true, '{"identity_type":"synthetic","bank_account":"active","pix":"active"}', NOW() - INTERVAL '16 hours', NOW() - INTERVAL '2 hours'),

('DW-016', 'Telegram Channel', 'banking_credentials', 'CPF-333.444.555-66', 50, 'USD', 'synthetic_factory', 4.0, 'Another synthetic. Same quality as always. Active PIX, fresh registration. Bulk discount: 5 for $200.', 'active_listing', 'current', false, '{"identity_type":"synthetic","bulk_available":true}', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '1 hour'),

('DW-017', 'Dark Web Forum', 'internal_system', 'EMP-GENERIC-001', 8000, 'USD', 'insider_access_latam', 3.0, 'Brazilian financial institution internal access. Junior level but can view customer data and transactions. Perfect for reconnaissance. Seller is employee willing to look up specific accounts on request.', 'unverified', 'unknown', false, '{"access_level":"junior","capabilities":["view_customer_data","view_transactions"]}', NOW() - INTERVAL '2 days', NOW() - INTERVAL '8 hours'),

('DW-018', 'BreachForums', 'banking_credentials', 'CPF-777.888.999-00', 250, 'USD', 'ransom_crew_br', 3.3, 'Banking credentials obtained during ransomware operation. Account holder is corporate user with access to financial systems. Credentials may also provide internal network access.', 'credential_match', 'recent', false, '{"source":"ransomware","dual_use":true}', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours'),

('DW-019', 'Telegram Channel', 'banking_credentials', 'CPF-UNKNOWN-RECRUIT-2', 0, 'BRL', 'easy_money_br', 0, 'Quer ganhar R$1000 por dia? Empreste sua conta bancaria por 2 horas e receba PIX na hora! 100% seguro, sem risco. Chama no privado.', 'active_listing', 'current', false, '{"type":"recruitment_ad","promised_payment":"R$1000/day","scam_level":"high"}', NOW() - INTERVAL '1 day', NOW() - INTERVAL '30 minutes'),

('DW-020', 'Russian Forum', 'banking_credentials', 'CPF-223.344.556-67', 0, 'USD', 'automated_factory', 4.6, 'Automated synthetic account with pre-loaded PIX forwarding script. Just fund and it auto-distributes to your wallets. Tor-based. Full automation package. $500 for the bot + account combo.', 'active_listing', 'current', true, '{"type":"automated_mule","includes_bot":true,"tor_based":true}', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour');
