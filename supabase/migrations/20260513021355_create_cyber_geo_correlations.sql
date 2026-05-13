/*
  # Cyber-Geopolitical Correlations

  1. New Tables
    - `cyber_geo_correlations`
      - Links a geopolitical event to a correlated cyber threat originating from a specific source location
      - Includes narrative explaining WHY the two events are correlated
      - Used by Threat Globe correlated mode to draw animated arcs and show hover tooltips
  2. Security
    - Enable RLS, allow authenticated + anon SELECT (demo)
*/

CREATE TABLE IF NOT EXISTS cyber_geo_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geo_event_id uuid REFERENCES geopolitical_events(id) ON DELETE CASCADE,
  geo_event_headline text NOT NULL DEFAULT '',
  cyber_attack_type text NOT NULL DEFAULT 'reconnaissance',
  cyber_threat_actor text NOT NULL DEFAULT 'Unknown',
  cyber_source_country text NOT NULL DEFAULT '',
  cyber_source_lat double precision NOT NULL DEFAULT 0,
  cyber_source_lon double precision NOT NULL DEFAULT 0,
  target_lat double precision NOT NULL DEFAULT 0,
  target_lon double precision NOT NULL DEFAULT 0,
  severity int NOT NULL DEFAULT 50,
  confidence_score int NOT NULL DEFAULT 70,
  correlation_narrative text NOT NULL DEFAULT '',
  detected_iocs jsonb DEFAULT '[]'::jsonb,
  acmeco_impact text NOT NULL DEFAULT '',
  recommended_action text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cyber_geo_correlations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cyber-geo correlations"
  ON cyber_geo_correlations FOR SELECT
  TO authenticated, anon
  USING (true);

INSERT INTO cyber_geo_correlations (
  geo_event_id, geo_event_headline, cyber_attack_type, cyber_threat_actor,
  cyber_source_country, cyber_source_lat, cyber_source_lon,
  target_lat, target_lon, severity, confidence_score,
  correlation_narrative, detected_iocs, acmeco_impact, recommended_action, occurred_at
) VALUES
(
  '643728c2-120b-5b03-8f40-682beb4e3aad',
  'CISA + ANSSI joint advisory: state-sponsored APT targeting beauty and luxury supply chains',
  'consent_phishing',
  'APT-LX (suspected state-sponsored)',
  'CN', 39.9042, 116.4074,
  -23.5615, -46.6562,
  92, 88,
  'Within 36 hours of the CISA+ANSSI advisory naming beauty/luxury supply chains, our SOC observed a 412% spike in OAuth consent-phishing attempts targeting Acmeco SAO-PAULO M365 tenants. The lure templates (PT-BR localized "Notas Fiscais" themed) and infrastructure (consent.azurewebsites[.]net subdomains) match TTPs in the advisory annex. Geographic targeting of GRU1 datacenter region + temporal alignment with public attribution = high-confidence campaign correlation.',
  '["consent.azurewebsites-corp[.]net","185.220.101.45","apt-lx-c2[.]xyz","SHA256: 7f3a...d21c"]'::jsonb,
  'GRU1 datacenter at risk. 12 executive M365 accounts received phishing OAuth grants in the last 36h. 2 grants accepted - tokens revoked.',
  'Force conditional access reauthentication for all Sao Paulo users; block listed C2; enable continuous OAuth grant audit',
  now() - interval '14 hours'
),
(
  'd3a2db17-1cc1-5d28-b000-d5f2c1148469',
  'OFAC adds Brazilian payment processor to SDN list - PIX rails affected',
  'credential_stuffing',
  'FIN7-BR affiliate',
  'RU', 55.7558, 37.6173,
  -23.5505, -46.6333,
  84, 82,
  'OFAC sanctions on the Brazilian payment processor created a 48-hour fraud window: legitimate transactions are being rerouted while criminal groups exploit the chaos. We detected a credential-stuffing wave (8.4M attempts) against Acmeco LATAM e-commerce within 6 hours of the SDN listing. Source ASNs overlap with FIN7-BR infrastructure historically used to monetize stolen card data through compromised Brazilian PSPs. Sanctions event = market disruption signal that triggers fraud campaigns.',
  '["91.219.236.18","185.156.73.54","fin7-br-panel[.]top","stuffer-rotator-v3.exe"]'::jsonb,
  'LATAM e-commerce platform. ~24K stolen credentials matched on first attempt. Account takeover protections invoked.',
  'Force MFA on all Brazil-resident accounts; block listed ASNs; freeze suspicious PIX outflows for manual review',
  now() - interval '8 hours'
),
(
  'fe74f694-b381-5457-8a95-09a39f17ba9f',
  'Logistics workers strike at Sao Paulo distribution hub - Acmeco tier-1 partner affected',
  'supply_chain_reconnaissance',
  'Initial Access Broker (financially motivated)',
  'IR', 35.6892, 51.3890,
  -23.4815, -46.5402,
  76, 79,
  'Physical disruption at the tier-1 logistics partner triggered emergency vendor onboarding workflows - and threat actors exploit chaos. Within 12h of the strike news, our EDR caught reconnaissance scans against Acmeco vendor portal (10.184.x.x range), with login attempts using leaked credentials of strike-affected partner staff. Pattern: real-world disruption -> hasty manual processes -> credential reuse exploitation. Strike = social engineering opportunity window.',
  '["scan-vendor-portal-payload.ps1","ib-broker-access[.]onion","leaked-creds-batch-2026q2.csv"]'::jsonb,
  'Vendor portal: 1,400 reconnaissance scans, 38 successful logins quarantined. No data exfiltrated yet.',
  'Rotate all tier-1 logistics partner credentials; require step-up auth on vendor portal; pause emergency vendor onboarding pending IR',
  now() - interval '20 hours'
);
