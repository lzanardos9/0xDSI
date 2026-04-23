/*
  # Seed three "bleeding" threat radar items

  Adds three hand-crafted threat intelligence items with exposure_status='active'
  and accompanying exposure hits, so the Threat Radar Agent demonstrably shows
  cases where our environment is actively bleeding.

  1. New data
     - 3 threat_radar_items with analysis_status='analyzed', exposure_status='active'
     - Matching threat_radar_exposure_hits (2-4 hits per item, critical/high)
*/

DO $$
DECLARE
  item_a uuid := gen_random_uuid();
  item_b uuid := gen_random_uuid();
  item_c uuid := gen_random_uuid();
BEGIN
  INSERT INTO threat_radar_items (
    id, source_key, source_name, title, url, url_hash, summary, content,
    published_at, family, severity, confidence, cves, vendors, products,
    mitre_tactics, mitre_techniques, tags, regions,
    point_of_view, why_care, attack_chain,
    analysis_status, analyzed_at, probed_at, exposure_status, exposure_hit_count
  ) VALUES
  (
    item_a, 'cisa_kev', 'CISA Known Exploited Vulnerabilities',
    'CVE-2024-3400 - PAN-OS GlobalProtect Command Injection Actively Exploited',
    'https://nvd.nist.gov/vuln/detail/CVE-2024-3400',
    encode(digest('https://nvd.nist.gov/vuln/detail/CVE-2024-3400-bleeding-a','sha256'),'hex'),
    'Unauthenticated command injection in Palo Alto GlobalProtect gateways. Active exploitation reported against enterprise VPN appliances.',
    'CISA added CVE-2024-3400 to the KEV catalog after confirmed in-the-wild exploitation by suspected state-sponsored actors. Exploit requires no authentication and yields root on the firewall device. Patching and device hardening are required immediately.',
    now() - interval '4 hours', 'zero_day', 'critical', 0.97,
    ARRAY['CVE-2024-3400'], ARRAY['Palo Alto Networks'], ARRAY['PAN-OS','GlobalProtect'],
    ARRAY['initial-access','execution'], ARRAY['T1190','T1059'],
    ARRAY['vpn','firewall','rce','state-sponsored'], ARRAY['global'],
    'This is a perimeter-breach class vulnerability. Edge VPN devices are the blast crater of the modern enterprise - a single unpatched gateway is a full external-to-internal pivot with root-level persistence.',
    'We have matching PAN-OS assets on the perimeter, with recent outbound anomalies on one of them. Adversaries exploiting this flaw today routinely drop the UPSTYLE backdoor and establish reverse tunnels within minutes of compromise.',
    'External scan -> unauth command injection on GlobalProtect -> root shell on firewall -> credential theft from config -> lateral movement into identity fabric -> domain controller compromise.',
    'analyzed', now() - interval '3 hours', now() - interval '30 minutes',
    'active', 4
  ),
  (
    item_b, 'the_record', 'The Record by Recorded Future',
    'BlackSuit Ransomware Affiliate Observed Abusing ESXi Hypervisors via Stolen vCenter Credentials',
    'https://therecord.media/blacksuit-ransomware-esxi-vcenter-bleeding-b',
    encode(digest('https://therecord.media/blacksuit-ransomware-esxi-vcenter-bleeding-b','sha256'),'hex'),
    'BlackSuit affiliate encrypting VMware ESXi clusters after harvesting vCenter credentials from SSO caches. Multiple confirmed victims this week.',
    'A BlackSuit ransomware affiliate is rapidly weaponizing stolen vCenter Server credentials to mass-encrypt ESXi hypervisors. TTPs include abusing legitimate vpxuser accounts, disabling vSphere HA, then encrypting VMDK files out-of-band. Dwell time observed under 12 hours.',
    now() - interval '8 hours', 'ransomware', 'critical', 0.93,
    ARRAY[]::text[], ARRAY['VMware','Broadcom'], ARRAY['vCenter','ESXi','vSphere'],
    ARRAY['credential-access','impact','lateral-movement'], ARRAY['T1078','T1486','T1021'],
    ARRAY['ransomware','esxi','vcenter','blacksuit'], ARRAY['north-america','europe'],
    'Hypervisor-layer ransomware skips the OS entirely. One set of credentials yields hundreds of encrypted VMs in a single sweep - detection windows collapse from days to minutes.',
    'We run vCenter in production with SSO to our identity provider. Recent anomalous logons to vCenter from an unusual jump host, and encrypted-file alerts on one ESXi datastore match the reported TTPs.',
    'Phish -> admin session token theft -> vCenter SSO reuse -> disable HA/backups -> SSH to ESXi -> stop VMs -> encrypt VMDK -> ransom note in datastore root.',
    'analyzed', now() - interval '7 hours', now() - interval '45 minutes',
    'active', 3
  ),
  (
    item_c, 'bleeping_computer', 'Bleeping Computer',
    'Okta Cross-Tenant Impersonation Campaign Targets Finance and SaaS Admins via Support Bypass',
    'https://www.bleepingcomputer.com/news/okta-cross-tenant-impersonation-bleeding-c',
    encode(digest('https://www.bleepingcomputer.com/news/okta-cross-tenant-impersonation-bleeding-c','sha256'),'hex'),
    'Attackers convincing Okta helpdesks to reset MFA for privileged finance and SaaS administrators, then registering new factors within minutes.',
    'A well-resourced social engineering crew (aligned with Scattered Spider TTPs) is calling helpdesks, impersonating finance-ops users, and tricking agents into clearing MFA. Once inside, they pivot to AWS IAM, Snowflake, and Workday using the same SSO cookie.',
    now() - interval '14 hours', 'identity', 'high', 0.9,
    ARRAY[]::text[], ARRAY['Okta','Snowflake','AWS'], ARRAY['Okta Workforce Identity','AWS IAM','Snowflake'],
    ARRAY['initial-access','credential-access','persistence'], ARRAY['T1078.004','T1556','T1098'],
    ARRAY['social-engineering','mfa-bypass','helpdesk','scattered-spider'], ARRAY['global'],
    'Identity is the new perimeter, and the helpdesk is its unsigned firmware. A 4-minute phone call buys adversaries a fully MFA-trusted SSO session across every downstream SaaS.',
    'We observed anomalous MFA factor enrollment events and a new device for one of our finance admins within the last 24 hours, originating from an unusual geolocation. That pattern exactly matches the described campaign.',
    'Recon on finance staff -> call helpdesk -> MFA reset -> self-enroll new factor -> login to Okta -> jump to AWS + Snowflake via SSO -> exfil financial data + establish long-lived API keys.',
    'analyzed', now() - interval '13 hours', now() - interval '25 minutes',
    'active', 3
  );

  INSERT INTO threat_radar_exposure_hits (
    item_id, hit_type, hit_severity, entity_type, entity_id, entity_name,
    matched_field, matched_value, evidence_summary, evidence_detail
  ) VALUES
  (item_a, 'cve_match', 'critical', 'asset', NULL, 'fw-edge-sfo-01',
    'cve_id', 'CVE-2024-3400',
    'Known exploited CVE-2024-3400 present on perimeter firewall fw-edge-sfo-01 (unpatched).',
    '{"cvss": 10.0, "status": "open", "patched": false, "detected_at": "2026-04-23T12:14:00Z"}'::jsonb),
  (item_a, 'ioc_match', 'critical', 'event', NULL, 'outbound_tunnel',
    'domain', 'update.paloaltonetwqrks.com',
    'Outbound DNS to typo-squatted PAN domain observed from fw-edge-sfo-01.',
    '{"event_time": "2026-04-23T11:58:00Z", "source_ip": "10.10.0.3"}'::jsonb),
  (item_a, 'asset_exposure', 'high', 'asset', NULL, 'fw-edge-iad-02',
    'asset_signature', 'pan-os',
    'Second PAN-OS gateway detected with matching vulnerable firmware range.',
    '{"criticality": 0.92, "version": "10.2.9"}'::jsonb),
  (item_a, 'alert_overlap', 'high', 'alert', NULL, 'Anomalous admin session on firewall',
    'keyword', 'pan-os',
    'Existing alert overlapping with GlobalProtect exploitation pattern.',
    '{"created_at": "2026-04-23T11:40:00Z"}'::jsonb),

  (item_b, 'asset_exposure', 'critical', 'asset', NULL, 'vcenter-prod-01',
    'asset_signature', 'vcenter',
    'Production vCenter matches targeted hypervisor profile.',
    '{"criticality": 0.95, "version": "7.0U3"}'::jsonb),
  (item_b, 'ioc_match', 'high', 'event', NULL, 'vpxuser_login_anomaly',
    'user', 'vpxuser',
    'vpxuser service account logged in from unusual jump host jmp-ops-03.',
    '{"event_time": "2026-04-23T05:12:00Z", "source_ip": "10.50.12.44"}'::jsonb),
  (item_b, 'alert_overlap', 'high', 'alert', NULL, 'Bulk VMDK file changes on datastore',
    'keyword', 'esxi',
    'Bulk file-modification alert on datastore DS-PROD-01 consistent with mass-encryption.',
    '{"created_at": "2026-04-23T06:02:00Z"}'::jsonb),

  (item_c, 'behavior_overlap', 'critical', 'user', NULL, 'MFA factor self-enrollment',
    'anomaly_type', 'mfa_factor_enrolled_new_device',
    'Finance admin j.parker@ enrolled a new MFA factor from new device/location within the last 24h.',
    '{"detected_at": "2026-04-23T02:18:00Z", "geo": "unusual"}'::jsonb),
  (item_c, 'ioc_match', 'high', 'event', NULL, 'okta_admin_session',
    'user', 'j.parker',
    'Okta session for j.parker initiated from ASN not previously seen for this user.',
    '{"event_time": "2026-04-23T02:22:00Z", "asn": "AS399629"}'::jsonb),
  (item_c, 'alert_overlap', 'high', 'alert', NULL, 'Helpdesk MFA reset without ticket',
    'keyword', 'okta',
    'Helpdesk MFA reset performed on j.parker without a matching ITSM ticket record.',
    '{"created_at": "2026-04-23T02:05:00Z"}'::jsonb);
END $$;