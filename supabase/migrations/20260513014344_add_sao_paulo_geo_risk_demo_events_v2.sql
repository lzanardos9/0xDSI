/*
  # Sao Paulo Geopolitical Risk Demo Events (v2)

  Supports CISO demo Layer 5 narrative on the Threat Globe geopolitical view.
  v1 failed because threat_radar_exposure_hits.item_id FKs to
  threat_radar_items (not geopolitical_events). v2 inserts paired
  threat_radar_items first, then ties exposure hits to those item ids.

  ## New Data
  1. Three geopolitical_events near Acmeco Sao Paulo HQ (strike, OFAC, advisory).
  2. Three threat_radar_items mirroring those events.
  3. Four threat_radar_exposure_hits tied to HQ + GRU1 DC.

  ## Security
  RLS already enabled; this migration only inserts data.
*/

DO $$
DECLARE
  hq_id UUID := '9e260fb6-9854-4b92-b556-69964cca1a9f';
  dc_id UUID := 'd08240be-ff23-4084-a2f8-3aa262c71b25';
  ev_strike_id UUID := uuid_generate_v5(uuid_ns_oid(), 'geo-sp-strike-2026-05');
  ev_ofac_id UUID := uuid_generate_v5(uuid_ns_oid(), 'geo-sp-ofac-2026-05');
  ev_advisory_id UUID := uuid_generate_v5(uuid_ns_oid(), 'geo-sp-advisory-2026-05');
  it_strike_id UUID := uuid_generate_v5(uuid_ns_oid(), 'tri-sp-strike-2026-05');
  it_ofac_id UUID := uuid_generate_v5(uuid_ns_oid(), 'tri-sp-ofac-2026-05');
  it_advisory_id UUID := uuid_generate_v5(uuid_ns_oid(), 'tri-sp-advisory-2026-05');
BEGIN
  INSERT INTO geopolitical_events (
    id, external_id, source, category, severity, headline, summary,
    country_code, country_name, region, lat, lon, url, tone,
    acmeco_exposure_score, exposure_assets, occurred_at, fetched_at, created_at
  ) VALUES
  (ev_strike_id, 'ACLED-BR-2026-05-08-LOG-STRIKE-SP', 'ACLED', 'civil_unrest', 4,
    'Logistics workers strike at Sao Paulo distribution hub - Acmeco tier-1 partner affected',
    'Truckers and warehouse staff at the Cubatao-Guarulhos logistics corridor began an indefinite strike over wage parity. The action affects a tier-1 last-mile partner used by Acmeco Brasil for ecommerce fulfillment. Picket lines reported 12 km from Acmeco Global HQ. Estimated 30-40% delivery slowdown for SE region.',
    'BR', 'Brazil', 'South America', -23.4815, -46.5402,
    'https://acleddata.com/event/BR-2026-05-08-LOG-STRIKE-SP', -6.2, 84,
    jsonb_build_object('matched_assets', jsonb_build_array(
      jsonb_build_object('asset_id', hq_id, 'asset_name', 'Acmeco Global HQ', 'distance_km', 12.0, 'headcount', 4200, 'revenue_share_pct', 32.5),
      jsonb_build_object('asset_id', dc_id, 'asset_name', 'Sao Paulo Datacenter (GRU1)', 'distance_km', 12.0, 'headcount', 90, 'revenue_share_pct', 0)
    ), 'computed_score', 84, 'haversine_radius_km', 25),
    now() - interval '2 days', now() - interval '6 hours', now()),
  (ev_ofac_id, 'OFAC-2026-05-09-PIX-PSP-UPDATE', 'OFAC', 'sanctions', 5,
    'OFAC adds Brazilian payment processor to SDN list - PIX rails affected',
    'US Treasury OFAC published an update adding a tier-2 Brazilian payment service provider to the SDN list for AML deficiencies. Acmeco Brasil routes 18% of consumer PIX settlement through this processor; settlement rails will need rerouting within 30 days to avoid secondary sanctions. EU mirroring expected within 72 hours.',
    'BR', 'Brazil', 'South America', -23.5505, -46.6333,
    'https://home.treasury.gov/policy-issues/financial-sanctions/recent-actions/20260509', -8.4, 78,
    jsonb_build_object('matched_assets', jsonb_build_array(
      jsonb_build_object('asset_id', hq_id, 'asset_name', 'Acmeco Global HQ', 'distance_km', 0.5, 'headcount', 4200, 'revenue_share_pct', 32.5)
    ), 'computed_score', 78, 'sanctions_program', 'AML/CFT', 'cure_window_days', 30),
    now() - interval '1 day', now() - interval '3 hours', now()),
  (ev_advisory_id, 'GDELT-2026-05-10-CYBER-LUX-BEAUTY', 'GDELT', 'cyber_advisory', 4,
    'CISA + ANSSI joint advisory: state-sponsored APT targeting beauty and luxury supply chains',
    'A joint advisory from CISA, ANSSI and the UK NCSC names a state-sponsored APT cluster (tracked as STORM-2547 / Pampas Spider) actively targeting beauty and luxury cosmetics supply chains across LATAM and EMEA. TTPs include consent-phishing into Microsoft 365, lateral movement via Azure AD, and data staging through Brazilian-hosted S3 buckets. Acmeco sector match: high.',
    'BR', 'Brazil', 'South America', -23.5615, -46.6562,
    'https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-130a', -7.1, 72,
    jsonb_build_object('matched_assets', jsonb_build_array(
      jsonb_build_object('asset_id', hq_id, 'asset_name', 'Acmeco Global HQ', 'distance_km', 2.4, 'headcount', 4200, 'revenue_share_pct', 32.5),
      jsonb_build_object('asset_id', dc_id, 'asset_name', 'Sao Paulo Datacenter (GRU1)', 'distance_km', 2.4, 'headcount', 90, 'revenue_share_pct', 0)
    ), 'computed_score', 72, 'apt_cluster', 'STORM-2547 / Pampas Spider', 'sector_match', 'beauty_luxury'),
    now() - interval '8 hours', now() - interval '2 hours', now())
  ON CONFLICT (id) DO UPDATE SET
    acmeco_exposure_score = EXCLUDED.acmeco_exposure_score,
    summary = EXCLUDED.summary,
    headline = EXCLUDED.headline,
    exposure_assets = EXCLUDED.exposure_assets;

  INSERT INTO threat_radar_items (
    id, source_key, source_name, title, url, url_hash, summary,
    published_at, ingested_at, family, severity, confidence,
    regions, tags, point_of_view, why_care, exposure_status, exposure_hit_count
  ) VALUES
  (it_strike_id, 'acled', 'ACLED',
    'Sao Paulo logistics labor strike - Acmeco tier-1 fulfillment partner',
    'https://acleddata.com/event/BR-2026-05-08-LOG-STRIKE-SP',
    md5('https://acleddata.com/event/BR-2026-05-08-LOG-STRIKE-SP'),
    'Indefinite strike at Cubatao-Guarulhos corridor. 30-40% delivery slowdown projected for SE region. 12 km from HQ.',
    now() - interval '2 days', now() - interval '6 hours',
    'civil_unrest', 'high', 0.92,
    ARRAY['BR','LATAM'], ARRAY['logistics','strike','sao_paulo','tier1_partner'],
    'Brand-affecting operational disruption; ecommerce fulfillment SLO at risk.',
    'A tier-1 last-mile partner is mid-strike 12 km from HQ. Customer NPS exposure for SE region.',
    'matched', 1),
  (it_ofac_id, 'ofac', 'OFAC',
    'OFAC SDN update: Brazilian payment processor delisted - 18% of PIX settlement affected',
    'https://home.treasury.gov/policy-issues/financial-sanctions/recent-actions/20260509',
    md5('https://home.treasury.gov/policy-issues/financial-sanctions/recent-actions/20260509'),
    'OFAC SDN listing of Brazilian PSP for AML deficiencies. 30-day cure window before secondary sanctions risk. EU mirror expected within 72h.',
    now() - interval '1 day', now() - interval '3 hours',
    'sanctions', 'critical', 0.99,
    ARRAY['BR','US','EU'], ARRAY['sanctions','pix','payments','aml'],
    'Direct revenue-routing exposure; cure window is short.',
    '18% of consumer PIX settlement transits the listed PSP. Re-routing in 30 days mandatory.',
    'matched', 1),
  (it_advisory_id, 'gdelt', 'GDELT / CISA',
    'CISA + ANSSI advisory: state-sponsored APT targets beauty and luxury supply chains',
    'https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-130a',
    md5('https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-130a'),
    'Joint CISA/ANSSI/NCSC advisory naming STORM-2547 (Pampas Spider) targeting beauty/luxury sector. TTPs match the consent-phishing detection from Layer 6.',
    now() - interval '8 hours', now() - interval '2 hours',
    'cyber_advisory', 'high', 0.94,
    ARRAY['BR','LATAM','EMEA'], ARRAY['apt','consent_phishing','beauty_luxury','azure_ad'],
    'Sector match is high; same TTPs already firing in our CEP graph.',
    'Adversary cluster explicitly named for our sector. Consent-phishing TTP overlaps the active CEP pattern match.',
    'matched', 2)
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, summary = EXCLUDED.summary,
    why_care = EXCLUDED.why_care, severity = EXCLUDED.severity,
    exposure_hit_count = EXCLUDED.exposure_hit_count;

  INSERT INTO threat_radar_exposure_hits (
    id, item_id, hit_type, hit_severity, entity_type, entity_id, entity_name,
    matched_field, matched_value, evidence_summary, evidence_detail, discovered_at
  ) VALUES
  (uuid_generate_v5(uuid_ns_oid(), 'hit-sp-strike-hq'),
    it_strike_id, 'geopolitical_proximity', 'high',
    'asset', hq_id::text, 'Acmeco Global HQ',
    'distance_km', '12.0',
    'Logistics labor strike at tier-1 fulfillment partner 12 km from HQ. Estimated 30-40% delivery slowdown for SE region.',
    jsonb_build_object('distance_km', 12.0, 'headcount', 4200, 'revenue_share_pct', 32.5, 'event_category', 'civil_unrest', 'computed_score', 84),
    now() - interval '5 hours'),
  (uuid_generate_v5(uuid_ns_oid(), 'hit-sp-ofac-hq'),
    it_ofac_id, 'sanctions_match', 'critical',
    'asset', hq_id::text, 'Acmeco Global HQ',
    'payment_processor', 'PIX-PSP-2547',
    'OFAC SDN listing of payment processor used for 18% of Brazilian PIX settlement. Cure window 30 days before secondary sanctions risk.',
    jsonb_build_object('settlement_share_pct', 18, 'cure_window_days', 30, 'eu_mirror_expected_h', 72, 'computed_score', 78),
    now() - interval '2 hours'),
  (uuid_generate_v5(uuid_ns_oid(), 'hit-sp-advisory-hq'),
    it_advisory_id, 'sector_advisory', 'high',
    'asset', hq_id::text, 'Acmeco Global HQ',
    'sector', 'beauty_luxury',
    'CISA/ANSSI advisory names beauty/luxury supply chains as active APT target. TTP overlap with our consent-phishing detection from Layer 6.',
    jsonb_build_object('apt_cluster', 'STORM-2547', 'ttp_overlap', jsonb_build_array('consent_phishing','azure_ad_lateral','br_hosted_s3_staging'), 'computed_score', 72),
    now() - interval '90 minutes'),
  (uuid_generate_v5(uuid_ns_oid(), 'hit-sp-advisory-dc'),
    it_advisory_id, 'sector_advisory', 'medium',
    'asset', dc_id::text, 'Sao Paulo Datacenter (GRU1)',
    'sector', 'beauty_luxury',
    'Same advisory cites Brazilian-hosted S3 staging - GRU1 DC bucket policies under review.',
    jsonb_build_object('apt_cluster', 'STORM-2547', 'computed_score', 60),
    now() - interval '70 minutes')
  ON CONFLICT (id) DO NOTHING;
END $$;
