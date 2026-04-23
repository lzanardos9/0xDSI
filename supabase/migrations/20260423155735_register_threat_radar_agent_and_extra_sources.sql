/*
  # Register Threat Radar Agent + Add Extra Sources

  ## Summary
  The threat_radar_* schema already exists with 15 sources and RLS policies.
  This migration adds a few high-value sources that were missing and registers
  the agent in the SOC agent registry if that table exists.

  ## New Sources
  - Google TAG, Google Project Zero, Zero Day Initiative, Ransomwatch,
    arXiv cs.CR, HackerOne public disclosures, CERT.br

  ## Agent Registry
  Upserts the threat_radar entry so it appears in the agent graph / panels.
*/

INSERT INTO threat_radar_sources (source_key, source_name, source_type, url, category, region, is_active, notes) VALUES
('google_tag', 'Google Threat Analysis Group', 'rss', 'https://blog.google/threat-analysis-group/rss/', 'vendor', 'global', true, 'State-sponsored and APT tracking'),
('project_zero', 'Google Project Zero', 'atom', 'https://googleprojectzero.blogspot.com/feeds/posts/default', 'research', 'global', true, 'Elite zero-day research'),
('zdi', 'Zero Day Initiative', 'rss', 'https://www.zerodayinitiative.com/blog/?format=rss', 'bounty', 'global', true, 'Bug bounty advisories'),
('ransomwatch', 'Ransomwatch Feed', 'rss', 'https://ransomwatch.telemetry.ltd/rss.xml', 'malware', 'global', true, 'Ransomware victim leak sites'),
('arxiv_crypto', 'arXiv cs.CR Recent', 'rss', 'https://export.arxiv.org/rss/cs.CR', 'research', 'global', true, 'Academic security papers'),
('hackerone_news', 'HackerOne Blog', 'rss', 'https://www.hackerone.com/blog.rss', 'bounty', 'global', true, 'Bounty platform news'),
('certbr', 'CERT.br Boletins', 'rss', 'https://www.cert.br/rss/boletins.xml', 'govt', 'BR', true, 'Brazil CERT advisories')
ON CONFLICT (source_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'soc_agents_registry') THEN
    INSERT INTO soc_agents_registry (agent_key, name, category, description, status, icon, color, metrics)
    VALUES (
      'threat_radar',
      'Threat Radar Agent',
      'intelligence',
      'Continuously scans external cyber threat intelligence (CVEs, malware campaigns, advisories, bounty disclosures, academic research). Produces a point of view, drafts graph correlation rules, and checks our data for existing exposure.',
      'active',
      'Radar',
      'emerald',
      '{"items_per_hour":45,"proposals_per_day":18,"promotion_rate":0.32,"sources_tracked":22}'::jsonb
    )
    ON CONFLICT (agent_key) DO UPDATE
      SET description = EXCLUDED.description,
          metrics = EXCLUDED.metrics,
          status = 'active';
  END IF;
END $$;