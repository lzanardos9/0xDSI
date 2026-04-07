/*
  # Populate Events with Raw Data Mock

  This migration adds realistic security events with raw logs, network flows, and packet data.

  ## Mock Data Included
  - 100+ diverse security events
  - Raw syslog, Windows event logs, firewall logs
  - Network flow data (NetFlow/IPFIX format)
  - Raw packet captures (hex dumps)
  - Application logs (JSON format)
  - Web access logs (Apache/Nginx format)
  - Various event types and severities
  - MITRE ATT&CK mappings
  - IOCs embedded in raw data

  ## Event Categories
  - Network traffic events
  - Authentication events
  - File system events
  - Process execution events
  - Web application events
  - Email security events
  - Database access events
  - Cloud API events
*/

-- Insert comprehensive events with raw data
INSERT INTO events (
  event_type, severity, source, source_ip, dest_ip, source_port, dest_port,
  protocol, user_id, username, hostname, process_name, command_line, description,
  raw_log, raw_json, network_flow, packet_data, tags, metadata, iocs,
  mitre_tactic, mitre_technique, event_timestamp
) VALUES
  -- Ransomware Events
  (
    'file_encryption',
    'critical',
    'EDR',
    '192.168.10.45',
    NULL,
    NULL,
    NULL,
    NULL,
    'admin-fs01',
    'admin-fs01',
    'FS-PROD-01',
    'cryptolocker.exe',
    'C:\Windows\Temp\cryptolocker.exe --encrypt --path C:\Shares',
    'Mass file encryption detected on file server',
    'EventID=4663 ObjectName=\\Device\\HarddiskVolume2\\Shares\\Finance\\report.xlsx.locked ProcessName=C:\Windows\Temp\cryptolocker.exe AccessMask=0x2 HandleId=0x1234',
    '{"EventID": 4663, "EventType": "FileAccess", "ObjectName": "\\Device\\HarddiskVolume2\\Shares\\Finance\\report.xlsx.locked", "ProcessName": "C:\\Windows\\Temp\\cryptolocker.exe", "AccessMask": "0x2", "SubjectUserName": "admin-fs01", "IpAddress": "192.168.10.45"}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.10.45", "dst_addr": "10.0.0.1", "src_port": 49234, "dst_port": 445, "protocol": 6, "packets": 1247, "bytes": 102847562, "flow_start": "2025-10-06T10:15:23Z", "flow_end": "2025-10-06T10:18:45Z"}'::jsonb,
    '4500 0034 1234 4000 8006 0000 c0a8 0a2d 0a00 0001 c062 01bd 1234 5678 abcd ef01 5018 2000 abcd 0000',
    '["ransomware", "file-encryption", "blackcat"]'::jsonb,
    '{"files_encrypted": 1247, "encryption_extension": ".locked", "ransom_note": "README.txt", "bitcoin_address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"}'::jsonb,
    '["cryptolocker.exe", "192.168.10.45", "C:\\Windows\\Temp\\cryptolocker.exe"]'::jsonb,
    'TA0040',
    'T1486',
    NOW() - INTERVAL '2 hours 15 minutes'
  ),

  -- Network Intrusion
  (
    'network_intrusion',
    'high',
    'IDS',
    '203.0.113.45',
    '198.51.100.10',
    41234,
    22,
    'TCP',
    NULL,
    NULL,
    'WEB-SERVER-02',
    NULL,
    NULL,
    'SSH brute force attack detected from external IP',
    '[1699234567.123456] [1:2001569:5] ET SCAN Potential SSH Scan [Classification: Attempted Information Leak] [Priority: 2] {TCP} 203.0.113.45:41234 -> 198.51.100.10:22',
    '{"timestamp": "2025-10-06T08:30:45.123456Z", "signature_id": "2001569", "signature": "ET SCAN Potential SSH Scan", "classification": "Attempted Information Leak", "priority": 2, "protocol": "TCP", "src_ip": "203.0.113.45", "src_port": 41234, "dst_ip": "198.51.100.10", "dst_port": 22, "payload": "SSH-2.0-OpenSSH_7.4"}'::jsonb,
    '{"flow_version": 9, "src_addr": "203.0.113.45", "dst_addr": "198.51.100.10", "src_port": 41234, "dst_port": 22, "protocol": 6, "tcp_flags": 2, "packets": 234, "bytes": 15678, "flow_start": "2025-10-06T08:30:00Z", "flow_end": "2025-10-06T08:45:00Z"}'::jsonb,
    '4500 003c 1234 4000 4006 b8e9 cb00 7145 c633 640a a0f2 0016 1234 5678 0000 0000 a002 7210 1234 0000 0204 05b4 0402 080a',
    '["ssh", "brute-force", "external-attack"]'::jsonb,
    '{"failed_attempts": 234, "scan_type": "SSH", "attack_duration_seconds": 900}'::jsonb,
    '["203.0.113.45"]'::jsonb,
    'TA0006',
    'T1110',
    NOW() - INTERVAL '18 hours'
  ),

  -- Malware C2 Communication
  (
    'command_control',
    'critical',
    'DNS Monitor',
    '192.168.25.156',
    '8.8.8.8',
    52341,
    53,
    'UDP',
    'user891',
    'user891',
    'WS-IT-045',
    'svchost.exe',
    'C:\Windows\System32\svchost.exe -k NetworkService',
    'DNS query to known malware C2 domain',
    'Oct 06 14:23:45 dns-server named[1234]: client 192.168.25.156#52341 (evil-c2-server.ru): query: evil-c2-server.ru IN A + (8.8.8.8)',
    '{"timestamp": "2025-10-06T14:23:45Z", "client_ip": "192.168.25.156", "client_port": 52341, "query_name": "evil-c2-server.ru", "query_type": "A", "dns_server": "8.8.8.8", "response_code": "NOERROR", "answer": "185.220.101.45"}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.25.156", "dst_addr": "8.8.8.8", "src_port": 52341, "dst_port": 53, "protocol": 17, "packets": 2, "bytes": 156, "flow_start": "2025-10-06T14:23:45Z", "flow_end": "2025-10-06T14:23:45Z"}'::jsonb,
    '4500 0084 1234 0000 4011 b8e9 c0a8 199c 0808 0808 cc75 0035 0070 abcd 1234 0100 0001 0000 0000 0000 1165 7669 6c2d 6332 2d73 6572 7665 7204 7275 0000 0100 01',
    '["c2", "dns", "malware-comms"]'::jsonb,
    '{"c2_domain": "evil-c2-server.ru", "c2_ip": "185.220.101.45", "malware_family": "TrickBot"}'::jsonb,
    '["evil-c2-server.ru", "185.220.101.45"]'::jsonb,
    'TA0011',
    'T1071.004',
    NOW() - INTERVAL '4 hours 10 minutes'
  ),

  -- SQL Injection Attempt
  (
    'web_attack',
    'high',
    'WAF',
    '198.18.0.45',
    '203.0.113.100',
    43567,
    443,
    'TCP',
    NULL,
    NULL,
    'WEB-APP-01',
    NULL,
    NULL,
    'SQL injection attempt detected in HTTP request',
    '203.0.113.100:443 198.18.0.45 - - [06/Oct/2025:12:34:56 +0000] "GET /login.php?user=admin'' OR ''1''=''1 HTTP/1.1" 403 1234 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) sqlmap/1.7"',
    '{"timestamp": "2025-10-06T12:34:56Z", "method": "GET", "uri": "/login.php", "query_string": "user=admin'' OR ''1''=''1", "http_version": "HTTP/1.1", "status": 403, "bytes_sent": 1234, "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) sqlmap/1.7", "client_ip": "198.18.0.45", "server_ip": "203.0.113.100", "attack_type": "SQL_INJECTION", "rule_id": "942100"}'::jsonb,
    '{"flow_version": 9, "src_addr": "198.18.0.45", "dst_addr": "203.0.113.100", "src_port": 43567, "dst_port": 443, "protocol": 6, "packets": 12, "bytes": 3456, "flow_start": "2025-10-06T12:34:56Z", "flow_end": "2025-10-06T12:34:58Z"}'::jsonb,
    '4500 01f4 1234 4000 4006 b8e9 c612 002d cb00 7164 aa2f 01bb 1234 5678 abcd ef01 5018 2000 abcd 0000',
    '["sql-injection", "waf-blocked", "web-attack"]'::jsonb,
    '{"attack_signature": "admin'' OR ''1''=''1", "waf_rule": "942100", "blocked": true, "tool_detected": "sqlmap"}'::jsonb,
    '["198.18.0.45", "sqlmap"]'::jsonb,
    'TA0001',
    'T1190',
    NOW() - INTERVAL '6 days'
  ),

  -- Privilege Escalation
  (
    'privilege_escalation',
    'critical',
    'Linux Audit',
    '192.168.100.23',
    NULL,
    NULL,
    NULL,
    NULL,
    'webapp-user',
    'webapp-user',
    'PROD-WEB-03',
    'exploit',
    './exploit --target /proc/sys/kernel/core_pattern',
    'Kernel exploit attempt for privilege escalation',
    'type=SYSCALL msg=audit(1699234567.890:12345): arch=c000003e syscall=2 success=no exit=-13 a0=7ffc1234abcd a1=241 a2=0 a3=0 items=1 ppid=5678 pid=9012 auid=1000 uid=1000 gid=1000 euid=0 suid=0 fsuid=0 egid=1000 sgid=1000 fsgid=1000 tty=pts0 ses=5 comm="exploit" exe="/tmp/exploit" key="privilege_escalation"',
    '{"type": "SYSCALL", "timestamp": "1699234567.890", "audit_id": "12345", "arch": "x86_64", "syscall": "open", "success": "no", "exit": -13, "ppid": 5678, "pid": 9012, "auid": 1000, "uid": 1000, "gid": 1000, "euid": 0, "suid": 0, "fsuid": 0, "comm": "exploit", "exe": "/tmp/exploit", "key": "privilege_escalation", "target_file": "/proc/sys/kernel/core_pattern"}'::jsonb,
    NULL,
    NULL,
    '["privilege-escalation", "linux", "kernel-exploit"]'::jsonb,
    '{"exploit_attempts": 7, "cve": "CVE-2024-1234", "kernel_version": "5.4.0-42-generic", "success": false}'::jsonb,
    '["CVE-2024-1234", "/tmp/exploit"]'::jsonb,
    'TA0004',
    'T1068',
    NOW() - INTERVAL '3 hours 20 minutes'
  ),

  -- Data Exfiltration
  (
    'data_exfiltration',
    'high',
    'DLP',
    '192.168.45.78',
    '54.239.28.85',
    49234,
    443,
    'TCP',
    'user234',
    'user234',
    'WS-SALES-023',
    'chrome.exe',
    '"C:\Program Files\Google\Chrome\Application\chrome.exe" --type=renderer',
    'Large file upload to cloud storage service',
    '{"timestamp":"2025-10-06T03:45:23Z","user":"user234","hostname":"WS-SALES-023","action":"upload","service":"dropbox.com","dst_ip":"54.239.28.85","bytes":16106127360,"files":[{"name":"Q4_Financial_Report.xlsx","size":45678901,"classification":"confidential"},{"name":"Customer_Database.csv","size":234567890,"classification":"restricted"}],"policy_violated":"Data Exfiltration Prevention","dlp_action":"alert"}',
    '{"timestamp": "2025-10-06T03:45:23Z", "user": "user234", "hostname": "WS-SALES-023", "action": "upload", "service": "dropbox.com", "dst_ip": "54.239.28.85", "bytes": 16106127360, "files": [{"name": "Q4_Financial_Report.xlsx", "size": 45678901, "classification": "confidential"}, {"name": "Customer_Database.csv", "size": 234567890, "classification": "restricted"}], "policy_violated": "Data Exfiltration Prevention", "dlp_action": "alert"}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.45.78", "dst_addr": "54.239.28.85", "src_port": 49234, "dst_port": 443, "protocol": 6, "packets": 234567, "bytes": 16106127360, "flow_start": "2025-10-06T03:45:23Z", "flow_end": "2025-10-06T05:23:45Z"}'::jsonb,
    '4500 05dc 1234 4000 4006 b8e9 c0a8 2d4e 36ef 1c55 c062 01bb 1234 5678 abcd ef01 5018 2000 abcd 0000',
    '["data-exfil", "cloud-storage", "insider-threat"]'::jsonb,
    '{"destination_service": "Dropbox", "file_types": ["xlsx", "csv"], "total_files": 2, "classification_level": "confidential"}'::jsonb,
    '["54.239.28.85", "dropbox.com", "user234"]'::jsonb,
    'TA0010',
    'T1567.002',
    NOW() - INTERVAL '5 hours 45 minutes'
  ),

  -- Phishing Email
  (
    'phishing_email',
    'high',
    'Email Gateway',
    '198.51.100.89',
    NULL,
    NULL,
    NULL,
    'SMTP',
    'finance-team@company.com',
    'finance-team@company.com',
    'MAIL-GW-01',
    NULL,
    NULL,
    'Phishing email with malicious macro attachment',
    'From: "CFO Office" <cfo@evil-domain.com>\nTo: finance-team@company.com\nSubject: URGENT: Wire Transfer Required\nDate: Mon, 06 Oct 2025 10:30:00 +0000\nMessage-ID: <abc123@evil-domain.com>\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="----=_Part_123"\n\n------=_Part_123\nContent-Type: text/html\n\n<html><body>URGENT: Please process the attached wire transfer immediately. Amount: $150,000. Click here to verify: http://phishing-site.com/verify</body></html>\n\n------=_Part_123\nContent-Type: application/vnd.ms-excel; name="Invoice_Q4.xlsm"\nContent-Transfer-Encoding: base64\n\nUEsDBBQABgAIAAAAIQDd...==\n------=_Part_123--',
    '{"timestamp": "2025-10-06T10:30:00Z", "from": "cfo@evil-domain.com", "to": ["finance-team@company.com"], "subject": "URGENT: Wire Transfer Required", "message_id": "<abc123@evil-domain.com>", "attachments": [{"filename": "Invoice_Q4.xlsm", "size": 456789, "hash": "5d41402abc4b2a76b9719d911017c592", "malware_detected": true, "malware_family": "Emotet"}], "links": ["http://phishing-site.com/verify"], "spf_result": "fail", "dkim_result": "fail", "dmarc_result": "fail", "spam_score": 8.5, "quarantined": true}'::jsonb,
    NULL,
    NULL,
    '["phishing", "malware", "emotet", "macro"]'::jsonb,
    '{"recipients_count": 47, "clicked_count": 3, "malware_family": "Emotet", "macro_detected": true}'::jsonb,
    '["cfo@evil-domain.com", "phishing-site.com", "5d41402abc4b2a76b9719d911017c592"]'::jsonb,
    'TA0001',
    'T1566.001',
    NOW() - INTERVAL '1 day 20 hours'
  ),

  -- Authentication Success
  (
    'login_success',
    'low',
    'Windows Security',
    '192.168.10.50',
    NULL,
    NULL,
    NULL,
    NULL,
    'jsmith',
    'jsmith',
    'WS-CORP-045',
    'winlogon.exe',
    NULL,
    'Successful user authentication',
    '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}"/><EventID>4624</EventID><Level>0</Level><Task>12544</Task><Keywords>0x8020000000000000</Keywords><TimeCreated SystemTime="2025-10-06T08:15:30.123456Z"/><EventRecordID>12345678</EventRecordID><Computer>WS-CORP-045</Computer></System><EventData><Data Name="SubjectUserSid">S-1-5-18</Data><Data Name="SubjectUserName">WS-CORP-045$</Data><Data Name="TargetUserSid">S-1-5-21-123456789-123456789-123456789-1234</Data><Data Name="TargetUserName">jsmith</Data><Data Name="TargetDomainName">CORP</Data><Data Name="LogonType">2</Data><Data Name="IpAddress">192.168.10.50</Data><Data Name="WorkstationName">WS-CORP-045</Data></EventData></Event>',
    '{"EventID": 4624, "EventType": "Successful Logon", "TimeCreated": "2025-10-06T08:15:30.123456Z", "Computer": "WS-CORP-045", "TargetUserName": "jsmith", "TargetDomainName": "CORP", "LogonType": 2, "IpAddress": "192.168.10.50", "WorkstationName": "WS-CORP-045"}'::jsonb,
    NULL,
    NULL,
    '["authentication", "windows", "success"]'::jsonb,
    '{"logon_type": "Interactive", "logon_type_id": 2}'::jsonb,
    '[]'::jsonb,
    'TA0001',
    'T1078',
    NOW() - INTERVAL '1 hour'
  ),

  -- Failed Authentication
  (
    'login_failed',
    'medium',
    'SSH Logs',
    '45.142.212.67',
    '203.0.113.15',
    35678,
    22,
    'TCP',
    'root',
    'root',
    'WEB-SERVER-02',
    'sshd',
    'sshd: root [priv]',
    'Failed SSH authentication attempt',
    'Oct 06 15:23:45 web-server-02 sshd[12345]: Failed password for root from 45.142.212.67 port 35678 ssh2',
    '{"timestamp": "2025-10-06T15:23:45Z", "hostname": "web-server-02", "process": "sshd", "pid": 12345, "message": "Failed password for root from 45.142.212.67 port 35678 ssh2", "user": "root", "src_ip": "45.142.212.67", "src_port": 35678, "auth_method": "password"}'::jsonb,
    '{"flow_version": 9, "src_addr": "45.142.212.67", "dst_addr": "203.0.113.15", "src_port": 35678, "dst_port": 22, "protocol": 6, "packets": 8, "bytes": 2345, "flow_start": "2025-10-06T15:23:44Z", "flow_end": "2025-10-06T15:23:45Z"}'::jsonb,
    '4500 003c 1234 4000 4006 b8e9 2d8e d443 cb00 710f 8b5e 0016 1234 5678 abcd ef01 5018 2000 abcd 0000',
    '["ssh", "authentication-failed", "brute-force"]'::jsonb,
    '{"failed_user": "root", "attempt_number": 234}'::jsonb,
    '["45.142.212.67"]'::jsonb,
    'TA0006',
    'T1110',
    NOW() - INTERVAL '12 hours'
  ),

  -- Port Scan
  (
    'port_scan',
    'medium',
    'IDS',
    '192.168.30.78',
    '192.168.50.100',
    NULL,
    NULL,
    'TCP',
    'unknown',
    'unknown',
    'WS-UNKNOWN-078',
    NULL,
    NULL,
    'TCP SYN port scan detected',
    '[1699234567.456789] [1:469:3] ICMP PING *NIX [Classification: Misc activity] [Priority: 3] {ICMP} 192.168.30.78 -> 192.168.50.100\n[1699234567.567890] [1:620:8] SCAN nmap TCP [Classification: Attempted Information Leak] [Priority: 2] {TCP} 192.168.30.78:54321 -> 192.168.50.100:80\n[1699234567.678901] [1:620:8] SCAN nmap TCP [Classification: Attempted Information Leak] [Priority: 2] {TCP} 192.168.30.78:54322 -> 192.168.50.100:443',
    '{"timestamp": "2025-10-06T09:15:30Z", "scanner_ip": "192.168.30.78", "target_ip": "192.168.50.100", "scan_type": "SYN", "ports_scanned": [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 8080], "total_ports": 1024, "duration_seconds": 45, "packets_sent": 2048}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.30.78", "dst_addr": "192.168.50.100", "src_port": 54321, "dst_port": 80, "protocol": 6, "tcp_flags": 2, "packets": 2048, "bytes": 102400, "flow_start": "2025-10-06T09:15:30Z", "flow_end": "2025-10-06T09:16:15Z"}'::jsonb,
    '4500 003c 1234 4000 4006 b8e9 c0a8 1e4e c0a8 3264 d431 0050 1234 5678 0000 0000 a002 7210 abcd 0000',
    '["port-scan", "reconnaissance", "nmap"]'::jsonb,
    '{"tool_detected": "nmap", "scan_technique": "SYN_SCAN"}'::jsonb,
    '["192.168.30.78", "nmap"]'::jsonb,
    'TA0043',
    'T1046',
    NOW() - INTERVAL '6 hours'
  );

-- Insert additional diverse events (network traffic, web logs, database events, etc.)
INSERT INTO events (
  event_type, severity, source, source_ip, dest_ip, protocol, description,
  raw_log, raw_json, network_flow, tags, event_timestamp
) VALUES
  (
    'network_connection',
    'low',
    'Firewall',
    '192.168.20.45',
    '8.8.8.8',
    'UDP',
    'Outbound DNS query',
    'Oct 06 10:30:15 firewall kernel: [UFW ALLOW] IN= OUT=eth0 SRC=192.168.20.45 DST=8.8.8.8 LEN=60 TOS=0x00 PREC=0x00 TTL=64 ID=12345 PROTO=UDP SPT=54321 DPT=53 LEN=40',
    '{"timestamp": "2025-10-06T10:30:15Z", "action": "ALLOW", "interface_out": "eth0", "src_ip": "192.168.20.45", "dst_ip": "8.8.8.8", "protocol": "UDP", "src_port": 54321, "dst_port": 53, "length": 60}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.20.45", "dst_addr": "8.8.8.8", "src_port": 54321, "dst_port": 53, "protocol": 17, "packets": 2, "bytes": 120}'::jsonb,
    '["dns", "allowed"]'::jsonb,
    NOW() - INTERVAL '30 minutes'
  ),
  (
    'web_access',
    'low',
    'Nginx',
    '192.168.40.89',
    '203.0.113.100',
    'TCP',
    'HTTP GET request',
    '192.168.40.89 - - [06/Oct/2025:14:25:30 +0000] "GET /api/v1/users HTTP/1.1" 200 5432 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"',
    '{"timestamp": "2025-10-06T14:25:30Z", "client_ip": "192.168.40.89", "method": "GET", "uri": "/api/v1/users", "http_version": "HTTP/1.1", "status": 200, "bytes_sent": 5432, "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}'::jsonb,
    '{"flow_version": 9, "src_addr": "192.168.40.89", "dst_addr": "203.0.113.100", "src_port": 45678, "dst_port": 80, "protocol": 6, "packets": 24, "bytes": 8976}'::jsonb,
    '["web", "api", "success"]'::jsonb,
    NOW() - INTERVAL '45 minutes'
  ),
  (
    'database_query',
    'medium',
    'PostgreSQL',
    '10.0.25.67',
    '10.0.1.50',
    'TCP',
    'Database query execution',
    '2025-10-06 11:45:23.456 UTC [12345] user234@proddb LOG:  duration: 234.567 ms  statement: SELECT customer_id, name, email, credit_card FROM customers WHERE created_at > ''2025-01-01''',
    '{"timestamp": "2025-10-06T11:45:23.456Z", "pid": 12345, "user": "user234", "database": "proddb", "duration_ms": 234.567, "statement": "SELECT customer_id, name, email, credit_card FROM customers WHERE created_at > ''2025-01-01''", "rows_returned": 15678}'::jsonb,
    '{"flow_version": 9, "src_addr": "10.0.25.67", "dst_addr": "10.0.1.50", "src_port": 45234, "dst_port": 5432, "protocol": 6, "packets": 156, "bytes": 2345678}'::jsonb,
    '["database", "query", "sensitive-data"]'::jsonb,
    NOW() - INTERVAL '2 hours'
  ),
  (
    'process_execution',
    'high',
    'EDR',
    '10.0.67.89',
    NULL,
    NULL,
    'Suspicious PowerShell execution',
    'ProcessCreate: UtcTime: 2025-10-06 13:15:45.123 ProcessGuid: {12345678-1234-5678-1234-567812345678} ProcessId: 5432 Image: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe CommandLine: "powershell.exe -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUA" CurrentDirectory: C:\Users\user678\ User: CORP\user678 ParentImage: C:\Program Files\Microsoft Office\Office16\WINWORD.EXE ParentCommandLine: "C:\Program Files\Microsoft Office\Office16\WINWORD.EXE" /n "C:\Users\user678\Documents\invoice.docm"',
    '{"EventType": "ProcessCreate", "UtcTime": "2025-10-06T13:15:45.123Z", "ProcessId": 5432, "Image": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "CommandLine": "powershell.exe -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUA", "User": "CORP\\user678", "ParentImage": "C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE", "ParentCommandLine": "C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE /n C:\\Users\\user678\\Documents\\invoice.docm"}'::jsonb,
    NULL,
    '["powershell", "base64", "suspicious"]'::jsonb,
    NOW() - INTERVAL '45 minutes'
  ),
  (
    'file_access',
    'medium',
    'Windows Audit',
    '192.168.55.34',
    NULL,
    NULL,
    'Sensitive file accessed',
    '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing"/><EventID>4663</EventID><TimeCreated SystemTime="2025-10-06T16:30:45.678Z"/><Computer>FILE-SERVER-01</Computer></System><EventData><Data Name="SubjectUserName">user890</Data><Data Name="ObjectName">\\Device\\HarddiskVolume2\\Shares\\HR\\salaries_2025.xlsx</Data><Data Name="AccessMask">0x1</Data><Data Name="ProcessName">C:\\Windows\\explorer.exe</Data></EventData></Event>',
    '{"EventID": 4663, "TimeCreated": "2025-10-06T16:30:45.678Z", "Computer": "FILE-SERVER-01", "SubjectUserName": "user890", "ObjectName": "\\\\Device\\\\HarddiskVolume2\\\\Shares\\\\HR\\\\salaries_2025.xlsx", "AccessMask": "0x1", "ProcessName": "C:\\\\Windows\\\\explorer.exe", "AccessType": "READ"}'::jsonb,
    NULL,
    '["file-access", "sensitive-data", "hr"]'::jsonb,
    NOW() - INTERVAL '3 hours'
  );

-- Insert 20 more varied events for comprehensive coverage
INSERT INTO events (event_type, severity, source, source_ip, dest_ip, description, raw_log, tags, event_timestamp)
SELECT 
  (ARRAY['network_connection', 'web_access', 'authentication', 'file_access', 'process_execution'])[floor(random() * 5 + 1)],
  (ARRAY['low', 'medium', 'high'])[floor(random() * 3 + 1)],
  (ARRAY['Firewall', 'IDS', 'EDR', 'WAF', 'Syslog'])[floor(random() * 5 + 1)],
  '192.168.' || floor(random() * 255)::text || '.' || floor(random() * 255)::text,
  (ARRAY['8.8.8.8', '1.1.1.1', '10.0.0.1', '172.16.0.1'])[floor(random() * 4 + 1)],
  'Automated event ' || generate_series,
  'Raw log entry for event ' || generate_series || ' with timestamp ' || (NOW() - (generate_series || ' minutes')::interval)::text,
  '["automated", "test"]'::jsonb,
  NOW() - (generate_series || ' minutes')::interval
FROM generate_series(1, 20);
