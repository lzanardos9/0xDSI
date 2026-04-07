/*
  # Create Vulnerabilities View and Red Team Campaigns Table

  1. New Views
    - `vulnerabilities` - Unified view combining `nist_nvd_vulnerabilities` and `asset_vulnerabilities`

  2. New Tables
    - `red_team_campaigns` - Red team/purple team campaign records
      - `id` (uuid, primary key)
      - `campaign_name`, `status`, `attack_type`, `success_rate`, `started_at`, etc.

  3. Security
    - RLS enabled on `red_team_campaigns`
    - Read policies for authenticated and anon users
*/

CREATE OR REPLACE VIEW vulnerabilities AS
SELECT
  id::text as id,
  title,
  severity,
  status,
  cvss_score,
  discovered_at
FROM asset_vulnerabilities
UNION ALL
SELECT
  id::text as id,
  cve_id || ': ' || LEFT(vulnerability_description, 100) as title,
  cvss_v3_severity as severity,
  CASE WHEN patch_available THEN 'patched' ELSE 'open' END as status,
  cvss_v3_score as cvss_score,
  published_date as discovered_at
FROM nist_nvd_vulnerabilities;

CREATE TABLE IF NOT EXISTS red_team_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  attack_type text NOT NULL,
  success_rate numeric DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  description text,
  mitre_techniques text[] DEFAULT '{}',
  findings_count integer DEFAULT 0,
  critical_findings integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE red_team_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read red team campaigns"
  ON red_team_campaigns FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read red team campaigns"
  ON red_team_campaigns FOR SELECT
  TO anon
  USING (true);

INSERT INTO red_team_campaigns (campaign_name, status, attack_type, success_rate, started_at, ended_at, description, mitre_techniques, findings_count, critical_findings) VALUES
('Operation Midnight Storm', 'completed', 'Full-Scope Red Team', 72.5, now() - interval '45 days', now() - interval '30 days', 'Full adversary simulation targeting external perimeter, lateral movement, and data exfiltration paths', ARRAY['T1566.001','T1078','T1021.001','T1048.003','T1059.001'], 28, 4),
('Phishing Resilience Q1', 'completed', 'Social Engineering', 34.2, now() - interval '60 days', now() - interval '52 days', 'Targeted spear-phishing campaign against finance and HR departments with credential harvesting payloads', ARRAY['T1566.001','T1566.002','T1534','T1598.003'], 15, 2),
('Cloud Fortress Assessment', 'completed', 'Cloud Infrastructure', 45.8, now() - interval '30 days', now() - interval '20 days', 'AWS and Azure cloud infrastructure assessment including IAM misconfigurations, S3 exposure, and privilege escalation', ARRAY['T1078.004','T1530','T1537','T1580','T1619'], 22, 6),
('Purple Team Exercise - Ransomware', 'completed', 'Purple Team', 18.3, now() - interval '25 days', now() - interval '18 days', 'Collaborative purple team exercise simulating ransomware operator TTPs including Conti and LockBit playbooks', ARRAY['T1486','T1490','T1489','T1047','T1569.002'], 19, 3),
('Insider Threat Simulation', 'in_progress', 'Insider Threat', 62.0, now() - interval '10 days', NULL, 'Simulating malicious insider with legitimate access attempting data theft and privilege abuse', ARRAY['T1078','T1083','T1005','T1074.001','T1567.002'], 11, 2),
('API Gateway Penetration Test', 'completed', 'Application Security', 55.4, now() - interval '35 days', now() - interval '28 days', 'Comprehensive API security assessment including BOLA, BFLA, injection, and authentication bypass', ARRAY['T1190','T1059','T1552.001','T1087.002'], 31, 5),
('Supply Chain Attack Drill', 'completed', 'Supply Chain', 28.7, now() - interval '50 days', now() - interval '42 days', 'Simulated supply chain compromise through third-party vendor access and software dependency poisoning', ARRAY['T1195.001','T1195.002','T1199','T1553.002'], 14, 3),
('Zero-Day Exploit Exercise', 'planned', 'Advanced Exploitation', 0, now() + interval '5 days', NULL, 'Upcoming exercise using simulated zero-day exploits against unpatched web application stack', ARRAY['T1190','T1203','T1068','T1211'], 0, 0),
('Active Directory Domination', 'completed', 'Internal Network', 81.2, now() - interval '40 days', now() - interval '33 days', 'Kerberoasting, AS-REP roasting, DCSync, Golden Ticket, and full AD compromise path assessment', ARRAY['T1558.003','T1558.004','T1003.006','T1550.003','T1484.001'], 35, 8),
('Wireless Network Intrusion', 'completed', 'Wireless/Physical', 41.0, now() - interval '55 days', now() - interval '50 days', 'Rogue AP deployment, WPA2 handshake capture, evil twin attacks, and wireless client enumeration', ARRAY['T1557.002','T1200','T1052.001'], 12, 1);
