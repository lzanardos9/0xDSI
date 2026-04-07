/*
  # Create and Populate Correlation Rules Library (50,000 rules)
  
  1. New Tables
    - `correlation_rules_library` with full rule metadata
  2. Security
    - RLS enabled, authenticated + anon read/update
  3. Data
    - 50,000 rules across 30 threat categories
*/

CREATE TABLE IF NOT EXISTS correlation_rules_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_description text NOT NULL,
  category text NOT NULL DEFAULT '',
  subcategory text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium',
  confidence_score integer NOT NULL DEFAULT 75,
  mitre_tactics text[] NOT NULL DEFAULT '{}',
  mitre_techniques text[] NOT NULL DEFAULT '{}',
  data_sources text[] NOT NULL DEFAULT '{}',
  rule_logic jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  author text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered timestamptz,
  trigger_count integer NOT NULL DEFAULT 0,
  false_positive_rate numeric(5,2) NOT NULL DEFAULT 0.00
);

ALTER TABLE correlation_rules_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_corr_rules" ON correlation_rules_library FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_corr_rules" ON correlation_rules_library FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "anon_read_corr_rules" ON correlation_rules_library FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_corr_rules" ON correlation_rules_library FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crl_cat ON correlation_rules_library(category);
CREATE INDEX IF NOT EXISTS idx_crl_sev ON correlation_rules_library(severity);
CREATE INDEX IF NOT EXISTS idx_crl_enabled ON correlation_rules_library(enabled);
CREATE INDEX IF NOT EXISTS idx_crl_cat_sev ON correlation_rules_library(category, severity);

DO $$
DECLARE
  cats text[] := ARRAY['APT & State-Sponsored','Ransomware','Insider Threat','Data Exfiltration','Credential Attacks','Lateral Movement','Command & Control','Privilege Escalation','Defense Evasion','Initial Access','Persistence','Discovery & Recon','Cloud Security','Container Security','Supply Chain','Zero-Day Exploits','Phishing & Social Eng','Malware Analysis','Network Anomaly','Identity & Access','Compliance Violations','OT/ICS/SCADA','IoT Security','Mobile Threats','DNS Security','Email Security','Web Application','Database Security','Cryptojacking','DDoS Protection'];
  subs text[] := ARRAY['Cozy Bear','Fancy Bear','Lazarus Group','Volt Typhoon','APT33','APT41','Sandworm','Turla','Charming Kitten','Kimsuky','Pre-Encryption','Double Extortion','RaaS Ops','Wiper Disguised','Backup Destroy','Shadow Copy Del','Privilege Abuse','Data Hoarding','Unauth Access','Anomalous Hours','Chunked Transfer','DNS Tunnel','Steganography','Cloud Storage','Encrypted Chan','Brute Force','Pass Spraying','Cred Stuffing','Kerberoasting','AS-REP Roast','SMB Movement','WMI Exec','PSRemoting','RDP Hopping','SSH Tunnel','HTTP Beacon','DNS C2','HTTPS C2','Domain Front','Fast Flux','Token Manip','UAC Bypass','Sudo Abuse','DLL Hijack','Proc Injection','Timestomping','Log Tamper','Proc Hollowing','DLL Sideload','AMSI Bypass','Spearphish Link','Drive-By','Exploit App','Watering Hole','Valid Accounts','Reg Run Keys','Startup Folder','Sched Tasks','WMI Subscribe','Cron Jobs','Net Scanning','Svc Enum','AD Enum','Cloud Disc','SNMP Walk','IAM Abuse','S3 Exposure','Lambda Hijack','Cross-Account','K8s RBAC','Image Tamper','Priv Container','Pod Escape','Miner Pod','Sidecar Inject','Dep Confusion','Typosquat','Compromised Pkg','Build Pipeline','CICD Takeover','Mem Corrupt','Logic Bug','Race Condition','Use-After-Free','Buffer Overflow','Cred Harvest','BEC Attempt','Spear Phish','QR Phish','Consent Phish','Polymorphic','Fileless','Macro Analysis','Shellcode','RAT Activity','Beacon Pattern','Proto Anomaly','Traffic Spike','Enc Anomaly','TLS Fingerprint','Impossible Travel','MFA Bypass','Token Theft','Session Hijack','OAuth Abuse','GDPR Violation','PCI Breach','HIPAA Violation','SOX Fail','NIST Gap','PLC Manip','HMI Tamper','Modbus Anomaly','OPCUA Exploit','FW Implant','Device Spoof','MQTT Abuse','Zigbee Sniff','BLE Exploit','Camera Hijack','Mobile RAT','Sideload App','MDM Bypass','SIM Swap','Screen Overlay','DGA Detect','DNS Rebind','Cache Poison','Subdomain Take','NXDOMAIN Spike','Header Inject','AutoFwd Rule','Inbox Abuse','DMARC Fail','Enc Payload','SQLi Detect','XSS Attempt','SSRF Attack','Path Traversal','API Abuse','Query Inject','Schema Exfil','Backup Theft','StoredProc','Audit Tamper','CPU Spike','Miner Binary','Stratum Proto','Browser Mine','Pool Connect','Volume Attack','SYN Flood','Slowloris','Reflect Attack','Carpet Bomb'];
  tact_strs text[] := ARRAY['Initial Access,Execution,Persistence','Impact,Defense Evasion,Execution','Collection,Exfiltration,Credential Access','Exfiltration,Command and Control,Collection','Credential Access,Lateral Movement,Initial Access','Lateral Movement,Execution,Discovery','Command and Control,Defense Evasion,Exfiltration','Privilege Escalation,Execution,Persistence','Defense Evasion,Persistence,Execution','Initial Access,Execution,Collection'];
  tech_pool text[] := ARRAY['T1195','T1199','T1078','T1190','T1566','T1486','T1490','T1489','T1074','T1048','T1110','T1558','T1021','T1570','T1071','T1095','T1068','T1548','T1134','T1055','T1070','T1036','T1027','T1547','T1053','T1046','T1018','T1082','T1537','T1535','T1610','T1611','T1609','T1072','T1203','T1211','T1598','T1204','T1059','T1562','T1564','T1136','T1098','T1016','T1033','T1528','T1552','T1613','T1556','T1539','T1550','T1567','T1041','T1052','T1080','T1573','T1572','T1090','T1546','T1561'];
  dsrc_strs text[] := ARRAY['EDR Telemetry,Network Flow,DNS Logs,Auth Logs','File Integrity,Process Monitor,Registry,Sysmon','DLP Logs,UEBA,Badge Access,HR Systems','Proxy Logs,NetFlow,Firewall,TLS Inspection','Active Directory,Kerberos,LDAP,Windows Events','CloudTrail,Azure Monitor,GCP Audit,IAM Logs','K8s Audit,Container Runtime,Image Registry,Pod Logs','WAF Logs,App Logs,API Gateway,CDN Logs','Email Gateway,O365 Audit,DMARC Reports,SMTP Logs','OT Monitor,Historian,PLC Diagnostics,HMI Logs'];
  tag_pool text[] := ARRAY['nation-state','apt','espionage','ransomware','extortion','insider','behavioral','exfiltration','dlp','credentials','kerberos','lateral','c2','beaconing','privesc','evasion','fileless','persistence','recon','cloud','aws','azure','gcp','container','k8s','supply-chain','zero-day','phishing','social-eng','malware','trojan','network','anomaly','identity','sso','mfa','compliance','gdpr','pci','ot','ics','scada','iot','mobile','dns','email','webapp','sqli','xss','database','cryptomining','ddos','botnet','wiper','apt29','apt41','lazarus','volt-typhoon'];
  sevs text[] := ARRAY['critical','high','medium','low'];
  auths text[] := ARRAY['Threat Intel Team','SOC Automation','Detection Engineering','Red Team','CISO Office','ML Pipeline','Community','Incident Response','Forensics Team','Purple Team'];
  pfx text[] := ARRAY['Detect','Identify','Correlate','Monitor','Alert on','Track','Analyze','Flag','Intercept','Investigate'];
  vbs text[] := ARRAY['multi-stage intrusion chain','campaign across hosts','TTPs with credential harvest','activity with enumeration','pattern with staging','behavioral baseline deviation','chunked exfiltration','entropy timing analysis','auth pattern analysis','graph time-window analysis','statistical beaconing JA3','process lineage anomaly','timestomping log gaps','detonation browser exploit','boot sequence autoruns','scan rate port sweep','cross-account IAM escalation','runtime namespace escape','dependency build integrity','crash exploit heuristics'];
  i int; ci int; si int; ti int; di int;
  r_sev text; r_conf int; r_name text; r_desc text; r_cat text; r_sub text; win int;
BEGIN
  FOR i IN 1..50000 LOOP
    ci := ((i-1)%30)+1; si := ((i-1)%array_length(subs,1))+1;
    ti := ((i-1)%10)+1; di := ((i-1)%10)+1;
    r_cat := cats[ci]; r_sub := subs[si];
    r_sev := sevs[CASE WHEN random()<0.15 THEN 1 WHEN random()<0.4 THEN 2 WHEN random()<0.75 THEN 3 ELSE 4 END];
    r_conf := 50+floor(random()*50)::int; win := 5+(i%55);
    r_name := pfx[((i-1)%10)+1]||' '||r_cat||' '||r_sub||' '||vbs[((i-1)%20)+1];
    r_desc := 'Detects '||r_sub||' activity in '||r_cat||'. Correlates '||dsrc_strs[di]||' within '||win::text||'m sliding window with adaptive thresholds.';
    INSERT INTO correlation_rules_library (rule_name,rule_description,category,subcategory,severity,confidence_score,mitre_tactics,mitre_techniques,data_sources,rule_logic,enabled,tags,author,created_at,updated_at,last_triggered,trigger_count,false_positive_rate)
    VALUES (
      r_name, r_desc, r_cat, r_sub, r_sev, r_conf,
      string_to_array(tact_strs[ti],','),
      ARRAY[tech_pool[((i-1)%60)+1], tech_pool[((i*7-1)%60)+1]],
      string_to_array(dsrc_strs[di],','),
      jsonb_build_object('pseudo_code',format(E'WHEN source IN [%s]\n  AND event.type MATCHES "%s"\n  AND COUNT(DISTINCT target) > %s\n  WITHIN %s min\nTHEN ALERT("%s", sev="%s")\n  ENRICH(threat_intel)\n  ESCALATE(tier_%s)',split_part(dsrc_strs[di],',',1),r_sub,(2+i%8)::text,win::text,left(r_name,50),r_sev,CASE WHEN r_sev='critical' THEN '3' WHEN r_sev='high' THEN '2' ELSE '1' END),'conditions',jsonb_build_array(jsonb_build_object('field','event.category','op','eq','val',r_cat),jsonb_build_object('field','threat.technique','op','in','val',r_sub)),'time_window',win::text||'m','threshold',jsonb_build_object('field','event.count','op','>=','val',3+(i%10))),
      random()<0.35,
      ARRAY[tag_pool[((i-1)%58)+1],tag_pool[((i*3-1)%58)+1],tag_pool[((i*7-1)%58)+1]],
      auths[((i-1)%10)+1],
      now()-(random()*365||' days')::interval,
      now()-(random()*30||' days')::interval,
      CASE WHEN random()<0.7 THEN now()-(random()*30||' days')::interval ELSE NULL END,
      floor(random()*5000)::int,
      round((random()*8)::numeric,2)
    );
  END LOOP;
END $$;
