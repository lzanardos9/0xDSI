/*
  # Create HoneyPot & HoneyToken Deception System

  1. New Tables
    - `honeypots`
      - `id` (uuid, primary key)
      - `name` (text) - honeypot display name
      - `honeypot_type` (text) - ssh, http, smb, rdp, database, ftp, dns, api
      - `decoy_ip` (text) - fake IP address exposed
      - `decoy_hostname` (text) - fake hostname
      - `status` (text) - active, inactive, compromised, triggered
      - `interaction_count` (int) - total interactions recorded
      - `last_interaction_at` (timestamptz)
      - `attacker_ips` (jsonb) - array of attacker IPs that interacted
      - `deployed_network` (text) - network segment deployed in
      - `emulated_os` (text) - operating system being emulated
      - `emulated_services` (jsonb) - services being emulated
      - `risk_level` (text) - low, medium, high, critical
      - `created_at` (timestamptz)

    - `honeytokens`
      - `id` (uuid, primary key)
      - `name` (text) - token display name
      - `token_type` (text) - credential, file, api_key, dns_record, aws_key, database_entry, email, url, certificate
      - `token_value_masked` (text) - masked representation of the token
      - `placement_location` (text) - where the token was planted
      - `status` (text) - active, triggered, expired, disabled
      - `trigger_count` (int) - how many times it was triggered
      - `last_triggered_at` (timestamptz)
      - `triggered_by_ip` (text) - IP that last triggered it
      - `triggered_by_user` (text) - user identity that triggered it
      - `alert_severity` (text) - low, medium, high, critical
      - `breadcrumb_trail` (jsonb) - trail of deception leading to this token
      - `created_at` (timestamptz)

    - `honeypot_interactions`
      - `id` (uuid, primary key)
      - `honeypot_id` (uuid, references honeypots)
      - `attacker_ip` (text)
      - `attacker_port` (int)
      - `protocol` (text)
      - `payload_preview` (text) - sanitized preview of payload
      - `session_duration_seconds` (int)
      - `commands_executed` (jsonb) - array of commands attempted
      - `credentials_attempted` (jsonb) - credentials tried
      - `geo_location` (text) - geolocation of attacker
      - `threat_intel_match` (boolean) - matched known threat intel
      - `severity` (text)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Policies for authenticated users to read data
    - Policies for anon read access for demo
*/

CREATE TABLE IF NOT EXISTS honeypots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  honeypot_type text NOT NULL DEFAULT 'ssh',
  decoy_ip text NOT NULL,
  decoy_hostname text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  interaction_count int NOT NULL DEFAULT 0,
  last_interaction_at timestamptz,
  attacker_ips jsonb DEFAULT '[]'::jsonb,
  deployed_network text NOT NULL DEFAULT 'DMZ',
  emulated_os text NOT NULL DEFAULT 'Ubuntu 22.04',
  emulated_services jsonb DEFAULT '[]'::jsonb,
  risk_level text NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE honeypots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read honeypots"
  ON honeypots FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon can read honeypots for demo"
  ON honeypots FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS honeytokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_type text NOT NULL DEFAULT 'credential',
  token_value_masked text NOT NULL,
  placement_location text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  trigger_count int NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  triggered_by_ip text,
  triggered_by_user text,
  alert_severity text NOT NULL DEFAULT 'high',
  breadcrumb_trail jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE honeytokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read honeytokens"
  ON honeytokens FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon can read honeytokens for demo"
  ON honeytokens FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS honeypot_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  honeypot_id uuid REFERENCES honeypots(id),
  attacker_ip text NOT NULL,
  attacker_port int,
  protocol text NOT NULL DEFAULT 'TCP',
  payload_preview text,
  session_duration_seconds int NOT NULL DEFAULT 0,
  commands_executed jsonb DEFAULT '[]'::jsonb,
  credentials_attempted jsonb DEFAULT '[]'::jsonb,
  geo_location text,
  threat_intel_match boolean NOT NULL DEFAULT false,
  severity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE honeypot_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read honeypot_interactions"
  ON honeypot_interactions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon can read honeypot_interactions for demo"
  ON honeypot_interactions FOR SELECT
  TO anon
  USING (true);

-- Populate honeypots
INSERT INTO honeypots (name, honeypot_type, decoy_ip, decoy_hostname, status, interaction_count, last_interaction_at, attacker_ips, deployed_network, emulated_os, emulated_services, risk_level, created_at) VALUES
('SSH-Trap-Alpha', 'ssh', '10.0.50.101', 'prod-db-backup-01.internal', 'active', 347, now() - interval '12 minutes', '["185.220.101.34","45.155.205.233","89.248.167.131","23.129.64.130","162.247.74.27"]', 'DMZ', 'Ubuntu 22.04 LTS', '["SSH:22","SFTP:22"]', 'high', now() - interval '45 days'),
('HTTP-Decoy-Finance', 'http', '10.0.50.102', 'finance-portal.internal', 'triggered', 892, now() - interval '3 minutes', '["103.75.201.4","194.163.128.105","45.33.32.156","212.71.234.178","5.188.206.26"]', 'Corporate', 'Windows Server 2019', '["HTTP:80","HTTPS:443","WebDAV:443"]', 'critical', now() - interval '30 days'),
('SMB-Lure-HR', 'smb', '10.0.50.103', 'hr-fileserver.internal', 'active', 156, now() - interval '2 hours', '["91.219.237.34","185.100.87.202","23.129.64.146"]', 'Corporate', 'Windows Server 2022', '["SMB:445","NetBIOS:139"]', 'medium', now() - interval '60 days'),
('RDP-Trap-Exec', 'rdp', '10.0.50.104', 'ceo-workstation.internal', 'active', 523, now() - interval '45 minutes', '["45.155.205.233","89.248.167.131","185.220.101.34","103.75.201.4","5.188.206.26","162.247.74.27"]', 'Executive', 'Windows 11 Enterprise', '["RDP:3389","WinRM:5985"]', 'high', now() - interval '20 days'),
('DB-Honey-PII', 'database', '10.0.50.105', 'customer-db-replica.internal', 'compromised', 1247, now() - interval '1 minute', '["194.163.128.105","5.188.206.26","103.75.201.4","91.219.237.34","45.33.32.156","212.71.234.178","185.220.101.34","23.129.64.130"]', 'Data Center', 'Ubuntu 20.04 LTS', '["MySQL:3306","PostgreSQL:5432"]', 'critical', now() - interval '15 days'),
('FTP-Trap-Legacy', 'ftp', '10.0.50.106', 'legacy-backup.internal', 'active', 89, now() - interval '6 hours', '["162.247.74.27","89.248.167.131"]', 'DMZ', 'CentOS 7', '["FTP:21","FTPS:990"]', 'low', now() - interval '90 days'),
('DNS-Sinkhole-01', 'dns', '10.0.50.107', 'ns3.internal-dns.local', 'active', 2341, now() - interval '30 seconds', '["185.220.101.34","45.155.205.233","5.188.206.26","194.163.128.105","91.219.237.34"]', 'Infrastructure', 'Ubuntu 22.04 LTS', '["DNS:53","DNS-over-HTTPS:443"]', 'high', now() - interval '10 days'),
('API-Decoy-Cloud', 'api', '10.0.50.108', 'api-gateway-staging.internal', 'triggered', 678, now() - interval '18 minutes', '["103.75.201.4","212.71.234.178","45.33.32.156","23.129.64.146"]', 'Cloud DMZ', 'Alpine Linux', '["REST:8443","GraphQL:9443","gRPC:50051"]', 'critical', now() - interval '7 days'),
('SSH-Canary-Dev', 'ssh', '10.0.50.109', 'dev-jumpbox.internal', 'active', 201, now() - interval '4 hours', '["185.100.87.202","89.248.167.131","162.247.74.27"]', 'Development', 'Debian 12', '["SSH:2222","Telnet:23"]', 'medium', now() - interval '25 days'),
('SCADA-Trap-ICS', 'http', '10.0.50.110', 'plc-controller-07.ot.internal', 'active', 67, now() - interval '1 day', '["45.155.205.233","5.188.206.26"]', 'OT/ICS', 'VxWorks 7.0', '["Modbus:502","HTTP:80","OPC-UA:4840"]', 'critical', now() - interval '5 days');

-- Populate honeytokens
INSERT INTO honeytokens (name, token_type, token_value_masked, placement_location, status, trigger_count, last_triggered_at, triggered_by_ip, triggered_by_user, alert_severity, breadcrumb_trail, created_at) VALUES
('AWS Root Key - Decoy', 'aws_key', 'AKIA****DECOY7X9Q', '/home/admin/.aws/credentials on prod-db-backup-01', 'triggered', 3, now() - interval '2 hours', '185.220.101.34', 'root', 'critical', '["SSH login to honeypot","cat /home/admin/.aws/credentials","AWS API call: sts:GetCallerIdentity","AWS API call: s3:ListBuckets"]', now() - interval '40 days'),
('Database Conn String', 'credential', 'postgresql://admin:****@customer-db.internal:5432/pii', 'config.yaml in hr-fileserver share', 'triggered', 7, now() - interval '30 minutes', '103.75.201.4', 'CORP\jsmith.admin', 'critical', '["SMB access to hr-fileserver","Browse to /configs/","Read config.yaml","Connection attempt to decoy DB"]', now() - interval '35 days'),
('CEO Email Canary', 'email', 'ceo-personal@****-corp.com', 'Outlook contacts on ceo-workstation', 'active', 0, null, null, null, 'high', '["Planted in CEO workstation contacts","Linked to Exchange canary mailbox"]', now() - interval '20 days'),
('API Bearer Token', 'api_key', 'Bearer eyJhbG****DECOY_TOKEN', '/var/www/api/.env on api-gateway-staging', 'triggered', 12, now() - interval '5 minutes', '212.71.234.178', null, 'critical', '["HTTP access to api-gateway","Directory traversal to .env","Token used against canary API","Attempted /api/v1/users endpoint","Attempted /api/v1/admin/export"]', now() - interval '7 days'),
('SSH Private Key', 'credential', '-----BEGIN RSA PRIVATE KEY-----\nMIIE****DECOY', '/home/deploy/.ssh/id_rsa on dev-jumpbox', 'triggered', 2, now() - interval '8 hours', '89.248.167.131', 'deploy', 'high', '["SSH brute force on dev-jumpbox","Successful login as deploy","Copied .ssh/id_rsa","SSH attempt to internal hosts using stolen key"]', now() - interval '25 days'),
('DNS Canary Record', 'dns_record', 'canary-7f3a.internal-dns.local', 'Internal DNS zone file', 'active', 45, now() - interval '2 minutes', '45.155.205.233', null, 'medium', '["DNS query for canary-7f3a.internal-dns.local","Resolution attempt from external IP","Repeated queries indicate zone enumeration"]', now() - interval '10 days'),
('Fake SSL Certificate', 'certificate', 'CN=*.finance-portal.internal, O=****Corp', 'finance-portal web server /etc/ssl/', 'active', 0, null, null, null, 'medium', '["Certificate planted on decoy finance portal","MITM detection if intercepted"]', now() - interval '28 days'),
('S3 Bucket Credentials', 'aws_key', 'AKIA****BKTDECOY2', 'Slack message in #devops-internal (planted)', 'triggered', 1, now() - interval '3 days', '194.163.128.105', null, 'critical', '["Credential found in Slack channel","AWS API call: s3:ListBuckets","Attempted access to s3://company-backups-prod"]', now() - interval '14 days'),
('Admin Password File', 'credential', 'admin_passwords_Q4_2025.xlsx (canary)', '/share/IT/admin/ on hr-fileserver', 'triggered', 4, now() - interval '1 hour', '91.219.237.34', 'CORP\mthompson', 'high', '["SMB access to hr-fileserver","Browse to /IT/admin/","Downloaded admin_passwords_Q4_2025.xlsx","Attempted RDP with contained credentials"]', now() - interval '30 days'),
('Kubernetes Secret', 'api_key', 'k8s-token-****-decoy-sa', 'k8s secret in staging namespace', 'active', 8, now() - interval '12 hours', '5.188.206.26', 'system:serviceaccount:staging:decoy-sa', 'high', '["Pod exec into staging container","kubectl get secrets","Decoded base64 service account token","API call to kube-apiserver"]', now() - interval '8 days'),
('GitHub PAT Token', 'api_key', 'ghp_****DECOY_PAT_2025', '.git-credentials on dev-jumpbox', 'triggered', 2, now() - interval '6 hours', '23.129.64.146', null, 'critical', '["SSH access to dev-jumpbox","Read .git-credentials file","GitHub API call: repos/list","Attempted clone of private repos"]', now() - interval '15 days'),
('VPN Config Canary', 'credential', 'vpn-config-emergency-****@corp.ovpn', '/home/admin/vpn-configs/ on legacy-backup', 'active', 0, null, null, null, 'medium', '["Planted on legacy FTP backup server","Contains canary VPN endpoint"]', now() - interval '45 days');

-- Populate interactions
INSERT INTO honeypot_interactions (honeypot_id, attacker_ip, attacker_port, protocol, payload_preview, session_duration_seconds, commands_executed, credentials_attempted, geo_location, threat_intel_match, severity, created_at)
SELECT
  hp.id,
  ips.ip,
  (random() * 60000 + 1024)::int,
  protocols.proto,
  payloads.payload,
  (random() * 3600)::int,
  commands.cmds,
  creds.cr,
  locations.loc,
  random() > 0.4,
  severities.sev,
  now() - (random() * interval '7 days')
FROM honeypots hp
CROSS JOIN LATERAL (
  VALUES
    ('185.220.101.34'), ('45.155.205.233'), ('103.75.201.4'), ('89.248.167.131'),
    ('194.163.128.105'), ('5.188.206.26'), ('91.219.237.34'), ('23.129.64.130')
) AS ips(ip)
CROSS JOIN LATERAL (VALUES ('TCP')) AS protocols(proto)
CROSS JOIN LATERAL (
  VALUES ('SSH-2.0-OpenSSH_8.9 brute force attempt'), ('GET /admin HTTP/1.1'), ('SMB negotiate request'), ('RDP connection initiation')
) AS payloads(payload)
CROSS JOIN LATERAL (
  VALUES ('["whoami","cat /etc/passwd","ls -la /","uname -a","cat /etc/shadow"]'::jsonb),
         ('["dir","net user","net localgroup administrators","ipconfig /all"]'::jsonb)
) AS commands(cmds)
CROSS JOIN LATERAL (
  VALUES ('["root:toor","admin:admin","root:password123","ubuntu:ubuntu"]'::jsonb),
         ('["administrator:P@ssw0rd","sa:sa","admin:changeme"]'::jsonb)
) AS creds(cr)
CROSS JOIN LATERAL (
  VALUES ('Moscow, Russia'), ('Beijing, China'), ('Tehran, Iran'), ('Pyongyang, North Korea'),
         ('Lagos, Nigeria'), ('Sao Paulo, Brazil')
) AS locations(loc)
CROSS JOIN LATERAL (
  VALUES ('critical'), ('high'), ('medium')
) AS severities(sev)
WHERE random() > 0.85
LIMIT 150;
