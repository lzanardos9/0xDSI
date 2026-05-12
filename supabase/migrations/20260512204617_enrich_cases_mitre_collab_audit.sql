/*
  # Enrich every case with MITRE ATT&CK techniques, collaboration (comments + watchers), and audit trails

  For each case we add:
    - 4-8 MITRE ATT&CK techniques (spanning multiple tactics)
    - 2-5 collaboration comments between analysts/IR/legal
    - 2-3 watchers (lead, IR, compliance)
    - 4-7 audit log entries showing state transitions
*/

DO $$
DECLARE
  r record;
  t timestamptz := now();
BEGIN
  -- Idempotency: skip if already enriched (check CASE-2025-0010 for ATT&CK)
  IF EXISTS (SELECT 1 FROM public.case_attack_techniques cat JOIN public.cases c ON c.id=cat.case_id WHERE c.case_number='CASE-2025-0010') THEN
    RETURN;
  END IF;

  FOR r IN SELECT id, case_number, category, severity FROM public.cases WHERE case_number LIKE 'CASE-%' LOOP

    ------------------------------------------------------------------
    -- Watchers (all cases)
    ------------------------------------------------------------------
    INSERT INTO public.case_watchers (case_id, watcher_user, watcher_role) VALUES
      (r.id, 'soc-lead@estee.local', 'lead'),
      (r.id, 'ir-team@estee.local', 'responder'),
      (r.id, 'compliance@estee.local', 'compliance');

    ------------------------------------------------------------------
    -- Audit log (all cases)
    ------------------------------------------------------------------
    INSERT INTO public.case_audit_log (case_id, actor, action, field_changed, old_value, new_value, metadata) VALUES
      (r.id, 'system', 'case.created', 'status', '', 'new', jsonb_build_object('source','correlation-engine')),
      (r.id, 'soc-lead@estee.local', 'case.triaged', 'priority', 'medium', r.severity, jsonb_build_object('rationale','severity uplift from enrichment')),
      (r.id, 'ir-team@estee.local', 'case.assigned', 'assigned_to', '', 'ir-team@estee.local', '{}'::jsonb),
      (r.id, 'ueba-agent', 'evidence.linked', 'evidence_count', '0', '3', jsonb_build_object('automated',true)),
      (r.id, 'threat-intel', 'ioc.added', 'ioc_count', '0', '4', jsonb_build_object('feed','stix-taxii'));
  END LOOP;

  ------------------------------------------------------------------
  -- CASE-specific ATT&CK + comments, keyed by case_number
  ------------------------------------------------------------------

  -- Ransomware File Server (0001)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1566.001','Spearphishing Attachment','initial-access',0.88,'Weaponized XLSM delivery'),
      ('T1486','Data Encrypted for Impact','impact',0.99,'LockBit 3.0 encryption routine observed'),
      ('T1490','Inhibit System Recovery','impact',0.98,'vssadmin shadow copy deletion'),
      ('T1059.003','Windows Command Shell','execution',0.95,'cmd.exe spawning ransomware binary'),
      ('T1027','Obfuscated Files or Information','defense-evasion',0.9,'Packed binary, encrypted strings'),
      ('T1083','File and Directory Discovery','discovery',0.92,'Recursive enumeration prior to encryption')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0001';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, a.internal FROM public.cases c,
    (VALUES
      ('j.kim@estee.local','File server fs-03 encryption started ~14:22. Pulled plug at 14:24. 12% encrypted at that point.',true),
      ('ir-team@estee.local','Acquired memory before shutdown. Mimikatz detected in lsass.exe. Assume credential theft.',true),
      ('legal@estee.local','Chain-of-custody binder ready. Need evidence hashes confirmed before 17:00 for counsel.',true),
      ('soc-lead@estee.local','Notified CISO. GRC will own external comms. Containment approved.',false)
    ) AS a(author,body,internal)
  WHERE c.case_number='CASE-2025-0001';

  -- Phishing (0002)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1566.002','Spearphishing Link','initial-access',0.97,'secure-docs-estee.review phishing domain'),
      ('T1534','Internal Spearphishing','lateral-movement',0.82,'CEO-spoof attempted to 14 finance users'),
      ('T1589.002','Gather Victim Identity: Email','reconnaissance',0.78,'Targeted list shows prior OSINT'),
      ('T1204.001','User Execution: Malicious Link','execution',0.94,'3 users clicked link')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0002';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, false FROM public.cases c,
    (VALUES
      ('mail-sec@estee.local','Blocked sender domain estee-board.com at gateway. Purging from 312 mailboxes.'),
      ('awareness@estee.local','Scheduling targeted training for finance dept. 3 clickers identified.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0002';

  -- DB Unauthorized Access (0003)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1078','Valid Accounts','initial-access',0.94,'svc-reporting credentials abused'),
      ('T1213','Data from Information Repositories','collection',0.96,'Bulk SELECT on customer table'),
      ('T1005','Data from Local System','collection',0.88,'Staged query output to local tmp'),
      ('T1041','Exfiltration Over C2 Channel','exfiltration',0.91,'285MB egress through normal DB proxy'),
      ('T1020','Automated Exfiltration','exfiltration',0.85,'Scheduled pattern every 2 hours')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0003';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, 'dba@estee.local', 'Revoked svc-reporting. Rotated credentials. New cred stored in vault with 90-day TTL.', true
  FROM public.cases WHERE case_number='CASE-2025-0003';

  -- DDoS (0004)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1498','Network Denial of Service','impact',0.99,'840 Gbps volumetric'),
      ('T1498.001','Direct Network Flood','impact',0.94,'UDP amplification'),
      ('T1498.002','Reflection Amplification','impact',0.92,'DNS + NTP reflectors')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0004';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, 'neteng@estee.local', 'Cloudflare Magic Transit absorbed peak. Origin never saw >5 Gbps. Ransom note via contact form - NOT engaging.', false
  FROM public.cases WHERE case_number='CASE-2025-0004';

  -- Malware Executive Laptop (0005)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1566.001','Spearphishing Attachment','initial-access',0.9,'PDF exploit attempt'),
      ('T1055','Process Injection','defense-evasion',0.87,'Injection into explorer.exe'),
      ('T1071.001','Application Layer Protocol: Web','command-and-control',0.93,'HTTPS beacon every 300s'),
      ('T1113','Screen Capture','collection',0.85,'Screenshots uploaded')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0005';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('exec-support@estee.local','CFO laptop replaced. Affected device imaged and vaulted.'),
      ('threat-intel@estee.local','IoCs align with APT29 cluster. Attribution confidence medium.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0005';

  -- Brute Force (0006)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1110.001','Password Guessing','credential-access',0.98,'24800 failed RDP attempts'),
      ('T1110.003','Password Spraying','credential-access',0.89,'Single password, many users'),
      ('T1078','Valid Accounts','initial-access',0.4,'No success observed')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0006';

  -- Outbound Transfer (0007)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1567.002','Exfiltration to Cloud Storage','exfiltration',0.94,'8.4GB to file.io'),
      ('T1530','Data from Cloud Storage','collection',0.76,'SharePoint bulk download'),
      ('T1020','Automated Exfiltration','exfiltration',0.82,'Scheduled batch uploads')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0007';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, 'hr@estee.local', 'User notified resignation 3 days ago. Escalating to legal hold per policy.', true
  FROM public.cases WHERE case_number='CASE-2025-0007';

  -- Privilege Escalation (0008)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1068','Exploitation for Privilege Escalation','privilege-escalation',0.96,'CVE-2021-34527 PrintNightmare'),
      ('T1548.002','Bypass User Account Control','privilege-escalation',0.93,'fodhelper UAC bypass'),
      ('T1136.001','Create Account: Local','persistence',0.98,'helpdesk_sys created with admin'),
      ('T1543.003','Windows Service','persistence',0.88,'Malicious service registered'),
      ('T1055','Process Injection','defense-evasion',0.85,'Injection into spoolsv.exe')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0008';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('ir-team@estee.local','Rogue account helpdesk_sys disabled. Service dropped. Host re-imaged.'),
      ('threat-intel@estee.local','TTP overlap with known initial-access broker. Monitoring for further chatter.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0008';

  -- Insider (0009)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1052.001','Exfiltration over USB','exfiltration',0.96,'Unauthorized USB VID match'),
      ('T1567.002','Exfiltration to Cloud Storage','exfiltration',0.88,'Personal gmail upload'),
      ('T1005','Data from Local System','collection',0.92,'1240 files accessed in 40 min'),
      ('T1078','Valid Accounts','initial-access',0.99,'Legitimate creds used')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0009';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('hr@estee.local','Employee on 2-week notice. Access revoke scheduled for Friday EOD.'),
      ('legal@estee.local','Preserving evidence per employment agreement. Consider non-compete enforcement.'),
      ('soc-lead@estee.local','Coordinating with physical security - badge access logs align with USB mount times.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0009';

  -- Zero-Day (0010)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1190','Exploit Public-Facing Application','initial-access',0.89,'Unknown signature, successful exploit'),
      ('T1059','Command and Scripting Interpreter','execution',0.82,'Post-exploit shell'),
      ('T1027','Obfuscated Files','defense-evasion',0.78,'Payload encrypted in memory'),
      ('T1105','Ingress Tool Transfer','command-and-control',0.85,'Secondary stage download')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0010';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('malware-lab@estee.local','Submitted payload to VirusTotal at T+2h - 0/72 detections. True zero-day.'),
      ('threat-intel@estee.local','Briefing CISA via established channel. Coordinating responsible disclosure.'),
      ('ir-team@estee.local','Host yanked off network. Forensic image in progress. Internet-exposed service disabled org-wide.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0010';

  -- Cryptomining (0011)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1496','Resource Hijacking','impact',0.99,'XMRig miner sustained 98% CPU'),
      ('T1543.003','Windows Service','persistence',0.92,'Persistence via service'),
      ('T1071.001','Application Layer Protocol','command-and-control',0.88,'Stratum/TCP to pool')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0011';

  -- DNS C2 (0012)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1071.004','Application Layer Protocol: DNS','command-and-control',0.97,'TXT record payloads'),
      ('T1568.002','Domain Generation Algorithms','command-and-control',0.91,'DGA pattern detected'),
      ('T1572','Protocol Tunneling','command-and-control',0.89,'DNS tunnel for C2')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0012';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, 'dns-ops@estee.local', 'Sinkholed DGA domains at internal resolver. Monitoring for infected clients.', true
  FROM public.cases WHERE case_number='CASE-2025-0012';

  -- Service Account Compromise (0013)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1558.003','Kerberoasting','credential-access',0.94,'TGT abnormality'),
      ('T1078.002','Domain Accounts','initial-access',0.98,'svc-backup abused'),
      ('T1003.001','LSASS Memory','credential-access',0.93,'Mimikatz ticket dump'),
      ('T1550.003','Pass the Ticket','lateral-movement',0.88,'TGT reused across hosts'),
      ('T1069.002','Permission Groups: Domain','discovery',0.82,'AD enumeration')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0013';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('ad-admin@estee.local','Rotated krbtgt twice 24h apart. All service account passwords forcibly rotated.'),
      ('ir-team@estee.local','Tier-0 review ongoing. No evidence of domain controller compromise yet.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0013';

  -- Rogue AP (0014)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1557','Adversary-in-the-Middle','credential-access',0.91,'Evil-twin SSID observed'),
      ('T1200','Hardware Additions','initial-access',0.88,'Unauthorized AP deployed'),
      ('T1040','Network Sniffing','credential-access',0.85,'Deauth frames captured')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0014';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, 'physical-sec@estee.local', 'Located device in 3rd floor conference room. Sent to forensics. CCTV review in progress.', true
  FROM public.cases WHERE case_number='CASE-2025-0014';

  -- SQLi (0015)
  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1190','Exploit Public-Facing Application','initial-access',0.94,'SQLi against /api/search'),
      ('T1213','Data from Information Repositories','collection',0.78,'Attempted data extraction'),
      ('T1595.002','Active Scanning: Vuln Scanning','reconnaissance',0.97,'sqlmap UA detected')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-2025-0015';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, false FROM public.cases c,
    (VALUES
      ('appsec@estee.local','Deployed parameterized query patch. Penetration test scheduled for next week.'),
      ('waf-ops@estee.local','Tuned WAF to block sqlmap UA patterns. Custom rule pushed.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-2025-0015';

  ------------------------------------------------------------------
  -- EL2023 cases: additional ATT&CK enrichment and rich collaboration
  ------------------------------------------------------------------

  INSERT INTO public.case_attack_techniques (case_id, technique_id, technique_name, tactic, confidence, evidence_summary)
  SELECT id, t.technique_id, t.technique_name, t.tactic, t.conf, t.ev FROM public.cases c,
    (VALUES
      ('T1133','External Remote Services','initial-access',0.92,'MOVEit internet-exposed'),
      ('T1071.001','Application Layer Protocol: Web','command-and-control',0.96,'HTTPS beacons to cdn-logs.statsync.io'),
      ('T1090.003','Multi-hop Proxy: Tor','command-and-control',0.89,'Tor exits used for SSO abuse'),
      ('T1070.004','File Deletion','defense-evasion',0.84,'Staging files wiped post-exfil attempt'),
      ('T1105','Ingress Tool Transfer','command-and-control',0.9,'Secondary stage loader dropped'),
      ('T1057','Process Discovery','discovery',0.78,'tasklist enumeration'),
      ('T1003.001','LSASS Memory','credential-access',0.93,'Mimikatz detected on jumpbox'),
      ('T1110.003','Password Spraying','credential-access',0.72,'Cohort probing prior to m.harris')
    ) AS t(technique_id,technique_name,tactic,conf,ev)
  WHERE c.case_number='CASE-EL2023-MASTER';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, a.internal FROM public.cases c,
    (VALUES
      ('ciso@estee.local','Briefing board at 18:00 EST. Need the one-pager confirmed by Legal before 17:00.',true),
      ('legal@estee.local','Confirmed. Outside counsel engaged under privilege. Evidence custody chain validated.',true),
      ('comms@estee.local','Holding statement drafted. Will not release unless disclosure threshold tripped.',true),
      ('ir-lead@estee.local','Contain executed in 432ms. 9-minute MTTR. Full timeline in master case.',false),
      ('threat-intel@estee.local','ALPHV JA3 e7d705... confirmed against 6 prior campaigns. High confidence attribution.',true),
      ('hunt-team@estee.local','Running retro-hunt across 90 days for CVE-2023-34362 probes. 2 other assets flagged for re-scan.',true),
      ('compliance@estee.local','GDPR Art.33 clock started at T-0. 72h window. Current determination: no notifiable breach (0 PII egressed).',true),
      ('ciso@estee.local','Excellent work team. CET engine story will land well with the board. Get ROI numbers tight.',false)
    ) AS a(author,body,internal)
  WHERE c.case_number='CASE-EL2023-MASTER';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('hunt-team@estee.local','Dormant hypothesis held for 21 days paid off. Honeytoken trip was the reinforcement trigger.'),
      ('glasswing@estee.local','MOVEit was flagged as internet-exposed + unpatched on T-22d. Asset owner was on PTO. Process gap identified.'),
      ('ir-team@estee.local','LEMURLOOT variant matches published Cl0p samples 97%. Publishing internal YARA rule.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-EL2023-CLOP';

  INSERT INTO public.case_comments (case_id, author, comment, is_internal)
  SELECT id, a.author, a.body, true FROM public.cases c,
    (VALUES
      ('ueba@estee.local','Impossible travel + MFA fatigue + typing biometric deviation of 2.7σ = 3 independent UEBA signals.'),
      ('identity@estee.local','m.harris forced password + MFA device re-enrollment. Phish-resistant FIDO2 mandated going forward.'),
      ('ir-team@estee.local','14 exfil chunks before auto-contain. 2,586 subsequent chunks blocked at edge. Playbook worked.')
    ) AS a(author,body)
  WHERE c.case_number='CASE-EL2023-ALPHV';

  ------------------------------------------------------------------
  -- Additional EL2023 audit entries showing detailed state transitions
  ------------------------------------------------------------------
  INSERT INTO public.case_audit_log (case_id, actor, action, field_changed, old_value, new_value, metadata)
  SELECT id, a.actor, a.act, a.fld, a.ov, a.nv, a.md FROM public.cases c,
    (VALUES
      ('cet-engine','hypothesis.opened','confidence','0.00','0.18','{"dormant":true}'::jsonb),
      ('honeypot','hypothesis.reinforced','confidence','0.18','0.71','{"trigger":"HT-MOVEIT-001"}'::jsonb),
      ('detection-confluence','narrative.merged','confidence','0.71','0.94','{"signals":4,"cases_merged":2}'::jsonb),
      ('response-orchestrator','playbook.executed','status','investigating','contained','{"playbook":"EL2023-contain","latency_ms":432}'::jsonb),
      ('ciso@estee.local','case.reviewed','','','','{"outcome":"approved for board report"}'::jsonb),
      ('legal@estee.local','evidence.sealed','is_sealed','false','true','{"count":17}'::jsonb),
      ('compliance@estee.local','regulatory.assessed','notification_required','unknown','no','{"regime":"GDPR","rationale":"zero_pii_egressed"}'::jsonb)
    ) AS a(actor,act,fld,ov,nv,md)
  WHERE c.case_number='CASE-EL2023-MASTER';

END $$;
