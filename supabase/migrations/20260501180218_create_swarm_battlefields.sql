/*
  # Swarm Crucible Battlefields + Champion Details

  1. New Tables
    - `swarm_battlefields` — target scenarios the swarms run against
      (asset networks, social engineering simulations, application exploitation,
       supply chain attacks, insider threats, cloud posture, OT/ICS, APT campaigns)
    - `swarm_battlefield_runs` — link from a run to a chosen battlefield
  2. Security
    - RLS enabled on both tables; authenticated read + insert/update
  3. Seed Data
    - 10 research-grade complex scenarios with mock topology, MITRE mapping,
      expected Red strategies + Blue countermeasures, asset counts, and kill-chain stages
*/

CREATE TABLE IF NOT EXISTS swarm_battlefields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium',
  description text NOT NULL,
  asset_count integer NOT NULL DEFAULT 0,
  user_count integer NOT NULL DEFAULT 0,
  surface_area text NOT NULL DEFAULT 'internal',
  mitre_techniques text[] DEFAULT ARRAY[]::text[],
  kill_chain_stages text[] DEFAULT ARRAY[]::text[],
  red_strategies jsonb DEFAULT '[]'::jsonb,
  blue_countermeasures jsonb DEFAULT '[]'::jsonb,
  topology jsonb DEFAULT '{}'::jsonb,
  real_world_reference text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS swarm_battlefield_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  battlefield_id uuid REFERENCES swarm_battlefields(id) ON DELETE CASCADE,
  selected_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_battlefields ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_battlefield_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swarm_bf_read_auth" ON swarm_battlefields FOR SELECT TO authenticated USING (true);
CREATE POLICY "swarm_bf_read_anon" ON swarm_battlefields FOR SELECT TO anon USING (true);
CREATE POLICY "swarm_bf_ins_auth" ON swarm_battlefields FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "swarm_bfr_read_auth" ON swarm_battlefield_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "swarm_bfr_read_anon" ON swarm_battlefield_runs FOR SELECT TO anon USING (true);
CREATE POLICY "swarm_bfr_ins_auth" ON swarm_battlefield_runs FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO swarm_battlefields (code, name, category, difficulty, description, asset_count, user_count, surface_area, mitre_techniques, kill_chain_stages, red_strategies, blue_countermeasures, topology, real_world_reference) VALUES
  ('BF-FINCORP', 'FinCorp Crown Jewels', 'asset-network', 'hard',
   'Tier-1 financial institution with 14,200 endpoints, Oracle core banking, SWIFT gateway, PIX settlement, and air-gapped HSMs. Models lateral movement toward payment authorization systems.',
   14200, 8400, 'hybrid',
   ARRAY['T1190','T1078','T1021','T1486','T1560','T1071','T1567'],
   ARRAY['recon','initial-access','privilege-escalation','lateral','collection','exfiltration'],
   '[{"name":"Phish CFO staff","weight":0.28},{"name":"Exploit Citrix gateway CVE-2023-3519","weight":0.24},{"name":"Kerberoast tier-0 service accounts","weight":0.22},{"name":"SWIFT MT103 injection","weight":0.14},{"name":"Ransom-as-distraction","weight":0.12}]',
   '[{"name":"Tier-0 PAW isolation","weight":0.25},{"name":"SWIFT Customer Security Controls","weight":0.22},{"name":"Impossible travel + step-up MFA","weight":0.2},{"name":"Oracle audit vault telemetry","weight":0.18},{"name":"Crown-jewel deception canaries","weight":0.15}]',
   '{"segments":["DMZ","Corp","CoreBanking","HSM","SWIFTNet"],"crown_jewels":12,"internet_exposed":186}',
   'Bangladesh Bank SWIFT heist (2016), Capital One breach (2019)'),
  ('BF-HEALTH', 'Metropolitan Health Network', 'asset-network', 'hard',
   '11 hospitals, 23,500 medical devices (infusion pumps, MRI, PACS), Epic EHR, HL7/FHIR interfaces, legacy Windows 7 imaging stations. Focus on ransomware with patient-safety impact.',
   28600, 41200, 'hybrid',
   ARRAY['T1566','T1190','T1210','T1486','T1489','T1562'],
   ARRAY['initial-access','discovery','lateral','impact'],
   '[{"name":"MEDJACK medical device pivot","weight":0.26},{"name":"Phish physician portal","weight":0.24},{"name":"EternalBlue on imaging stations","weight":0.2},{"name":"Ransomware + EHR lockup","weight":0.3}]',
   '[{"name":"Medical device microsegmentation","weight":0.28},{"name":"Epic access anomaly detection","weight":0.24},{"name":"Immutable PACS backups","weight":0.22},{"name":"HIPAA-scoped DLP","weight":0.26}]',
   '{"sites":11,"imd_count":23500,"ehr":"Epic","legacy_os_pct":18}',
   'CommonSpirit Health (2022), Change Healthcare (2024)'),
  ('BF-SOCIAL', 'Project Deepfake Persona', 'social-engineering', 'expert',
   'Multi-stage social simulation: 10,000 modeled employee personas with OCEAN personality traits, LinkedIn OSINT, voice-clone vishing, deepfake Teams calls, and MFA fatigue.',
   1200, 10000, 'external',
   ARRAY['T1566.001','T1566.002','T1566.004','T1598','T1621','T1204'],
   ARRAY['recon','initial-access','credential-access'],
   '[{"name":"LinkedIn OSINT harvest","weight":0.22},{"name":"Voice-cloned CFO vishing","weight":0.24},{"name":"Deepfake Teams executive call","weight":0.2},{"name":"MFA push-fatigue burst","weight":0.18},{"name":"QR phishing (quishing)","weight":0.16}]',
   '[{"name":"Behavioral biometrics (keystroke cadence)","weight":0.24},{"name":"FIDO2 phishing-resistant MFA","weight":0.26},{"name":"Deepfake audio detector","weight":0.22},{"name":"Just-in-time privilege","weight":0.14},{"name":"Security awareness micro-training","weight":0.14}]',
   '{"personas":10000,"traits":"OCEAN","departments":17,"tenure_distribution":"log-normal"}',
   'Retool deepfake breach (2023), MGM Resorts vishing (2023)'),
  ('BF-APPEXP', 'AppExploit Arena', 'application-exploit', 'hard',
   'Kubernetes-hosted SaaS with 340 microservices, Istio mesh, 14 OWASP Top 10 classes of bugs seeded (SSRF, XXE, prototype pollution, deserialization, IDOR, JWT alg=none).',
   340, 2100, 'external',
   ARRAY['T1190','T1059','T1552','T1068','T1611'],
   ARRAY['initial-access','execution','privilege-escalation'],
   '[{"name":"SSRF to IMDSv1 metadata","weight":0.24},{"name":"Prototype pollution RCE","weight":0.2},{"name":"JWT alg-confusion","weight":0.18},{"name":"Container escape via CVE-2024-21626","weight":0.22},{"name":"GraphQL batching DoS","weight":0.16}]',
   '[{"name":"OPA/Gatekeeper policies","weight":0.24},{"name":"Falco runtime detection","weight":0.22},{"name":"RASP (runtime app self-protect)","weight":0.2},{"name":"IMDSv2 enforced","weight":0.18},{"name":"eBPF syscall telemetry","weight":0.16}]',
   '{"microservices":340,"mesh":"Istio","k8s_nodes":64,"seeded_bugs":46}',
   'Uber 2016 S3 leak, Capital One SSRF (2019)'),
  ('BF-SUPPLY', 'Upstream Dependency Poison', 'supply-chain', 'expert',
   'Dependency poisoning of npm + PyPI + Docker Hub packages consumed across 812 build pipelines. Includes typosquatting, compromised maintainer, and CI-injected payloads.',
   812, 450, 'external',
   ARRAY['T1195.001','T1195.002','T1578','T1609'],
   ARRAY['initial-access','execution','persistence'],
   '[{"name":"Typosquat (reqeusts, lodahs)","weight":0.22},{"name":"Maintainer token theft","weight":0.24},{"name":"Post-install script","weight":0.2},{"name":"Docker Hub tag overwrite","weight":0.18},{"name":"CI-injected wheel","weight":0.16}]',
   '[{"name":"Sigstore/Cosign signed builds","weight":0.26},{"name":"SBOM + VEX attestation","weight":0.22},{"name":"Dependency firewall (JFrog/Snyk)","weight":0.2},{"name":"Hermetic reproducible builds","weight":0.18},{"name":"CI ephemeral credentials","weight":0.14}]',
   '{"pipelines":812,"ecosystems":["npm","pypi","docker","maven"],"packages_tracked":47000}',
   'SolarWinds SUNBURST (2020), XZ Utils backdoor (2024), event-stream (2018)'),
  ('BF-INSIDER', 'Disgruntled Admin Simulation', 'insider-threat', 'hard',
   '4,800 user behavior profiles; 17 simulated insider archetypes (resignation-risk, financial-stress, moonlighter) with UEBA fingerprints and data-exfil intent vectors.',
   2200, 4800, 'internal',
   ARRAY['T1078.002','T1530','T1567.002','T1048','T1074'],
   ARRAY['collection','exfiltration'],
   '[{"name":"Exfil to personal GDrive","weight":0.24},{"name":"USB mass-storage copy","weight":0.18},{"name":"Slack DM exfil","weight":0.2},{"name":"Print-to-PDF drip","weight":0.16},{"name":"Screenshot to personal cloud","weight":0.22}]',
   '[{"name":"UEBA peer-group anomaly","weight":0.26},{"name":"DLP content fingerprinting","weight":0.24},{"name":"Tor/proxy egress block","weight":0.18},{"name":"HR lifecycle signals","weight":0.16},{"name":"Honeydocs canaries","weight":0.16}]',
   '{"archetypes":17,"behavior_traits":"OCEAN+DarkTriad","watchlist":312}',
   'Pfizer insider 2021, Tesla insider 2018, Cash App insider 2022'),
  ('BF-CLOUD', 'Multi-Cloud Posture War', 'cloud-posture', 'medium',
   '3 AWS accounts, 2 Azure tenants, 1 GCP project. 9,200 cloud resources, 140 IAM misconfigurations, 28 public S3/Blob, open OAuth scopes, overly broad assume-role trust.',
   9200, 620, 'external',
   ARRAY['T1078.004','T1526','T1552.005','T1087.004','T1098.001'],
   ARRAY['initial-access','discovery','persistence','privilege-escalation'],
   '[{"name":"Public S3 enumeration","weight":0.22},{"name":"IMDS credential theft","weight":0.2},{"name":"Cross-account AssumeRole abuse","weight":0.22},{"name":"OAuth consent phishing","weight":0.18},{"name":"Managed identity token replay","weight":0.18}]',
   '[{"name":"CSPM continuous posture","weight":0.24},{"name":"GuardDuty + Defender + SCC","weight":0.22},{"name":"SCPs + Azure PIM + IAM boundary","weight":0.2},{"name":"Egress VPC endpoints","weight":0.18},{"name":"Cloud honeytokens","weight":0.16}]',
   '{"clouds":["AWS","Azure","GCP"],"accounts":6,"resources":9200,"misconfigs":140}',
   'Capital One (2019), Code Spaces (2014), Uber breach (2022)'),
  ('BF-OTICS', 'Substation OT Invasion', 'ot-ics', 'expert',
   'Electric utility substation with Modbus, DNP3, IEC-61850 GOOSE messaging, 340 PLCs, 12 HMIs, Purdue Level 0-5 enforcement, engineering workstation bridging IT/OT.',
   340, 180, 'isolated',
   ARRAY['T0831','T0836','T0842','T0859','T0889','T0881'],
   ARRAY['initial-access','lateral','inhibit-response','impact'],
   '[{"name":"IT-to-OT pivot via Eng WS","weight":0.26},{"name":"GOOSE packet spoofing","weight":0.22},{"name":"Firmware downgrade on PLC","weight":0.2},{"name":"Historian data poisoning","weight":0.16},{"name":"Safety system bypass","weight":0.16}]',
   '[{"name":"Unidirectional data diode","weight":0.26},{"name":"Nozomi/Dragos OT NDR","weight":0.24},{"name":"Serial-to-TCP converters monitoring","weight":0.18},{"name":"Engineering WS isolation","weight":0.18},{"name":"Safety instrumented system airgap","weight":0.14}]',
   '{"plcs":340,"hmis":12,"protocols":["Modbus","DNP3","IEC61850"],"purdue_levels":6}',
   'Colonial Pipeline (2021), Ukraine grid attacks (2015/2016), Triton/Trisis (2017)'),
  ('BF-APT', 'Nation-State APT29 Emulation', 'apt-campaign', 'expert',
   'Full APT29 (Cozy Bear) kill-chain emulation: password spray, Golden SAML, OAuth app consent, WellMess implant, MagicWeb backdoor against a mock government tenant.',
   2400, 3200, 'hybrid',
   ARRAY['T1110.003','T1606.002','T1528','T1546','T1098.005'],
   ARRAY['initial-access','persistence','credential-access','defense-evasion'],
   '[{"name":"Password spray on O365","weight":0.18},{"name":"Golden SAML forge","weight":0.22},{"name":"OAuth consent backdoor","weight":0.2},{"name":"WellMess .NET implant","weight":0.2},{"name":"MagicWeb ADFS DLL","weight":0.2}]',
   '[{"name":"Conditional Access + FIDO2","weight":0.24},{"name":"Identity Protection risk","weight":0.22},{"name":"OAuth app governance","weight":0.2},{"name":"ADFS certificate auditing","weight":0.18},{"name":"EDR memory scanning","weight":0.16}]',
   '{"identity_provider":"Entra ID","tenants":3,"oauth_apps":640,"adfs_servers":4}',
   'SolarWinds SUNBURST (2020), NOBELIUM (Midnight Blizzard), MagicWeb (2022)'),
  ('BF-AILLM', 'Agentic AI Jailbreak Gauntlet', 'ai-security', 'hard',
   'Enterprise LLM with 40 tool integrations, RAG over 2.1M docs, MCP servers, agent-to-agent comms. Tests prompt injection, tool poisoning, data exfil via embeddings, jailbreak chains.',
   40, 1100, 'external',
   ARRAY['T1566','T1059','T1552','T0883','LLM01','LLM02','LLM06'],
   ARRAY['initial-access','execution','exfiltration'],
   '[{"name":"Indirect prompt injection via doc","weight":0.24},{"name":"Tool poisoning (malicious MCP server)","weight":0.22},{"name":"Embedding-space exfil","weight":0.2},{"name":"Multi-turn jailbreak chain","weight":0.18},{"name":"Agent-to-agent social engineering","weight":0.16}]',
   '[{"name":"Input/output guardrails","weight":0.24},{"name":"Tool-call allowlisting","weight":0.22},{"name":"Embedding anomaly detection","weight":0.2},{"name":"Constitutional AI classifier","weight":0.18},{"name":"Agent session provenance","weight":0.16}]',
   '{"tools":40,"docs":2100000,"mcp_servers":14,"agents":22}',
   'ChatGPT plugin issues (2023), Microsoft Copilot prompt injection research (2024)')
ON CONFLICT (code) DO NOTHING;
