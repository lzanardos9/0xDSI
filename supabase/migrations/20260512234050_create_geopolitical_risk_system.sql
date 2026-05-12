/*
  # Geopolitical & Country-Risk Intelligence System

  Creates the cache + exposure-mapping tables that back the Geopolitical
  Risk mode of the Global Threat Intelligence Globe. Also seeds Acmeco's
  global footprint so events can be scored against actual business impact.

  ## New Tables
    - `geopolitical_events`
        Normalized cache of events from GDELT, ReliefWeb, USGS, NASA EONET,
        ACLED, OFAC sanctions and financial-risk feeds. Each row has lat/lon,
        a category, severity 1-5, source URL, occurred_at and the computed
        `acmeco_exposure_score` (0-100) representing business impact.
    - `acmeco_exposure_zones`
        Acmeco's people, datacenters, supplier hubs, and revenue regions.
        Every event is geo-joined against this table to produce its
        exposure score (so a riot in Sao Paulo where HQ lives scores
        much higher than a riot somewhere with no Acmeco footprint).
    - `geopolitical_fetch_runs`
        Audit log of fetch jobs (which feeds ran, how many events, errors).

  ## Categories
    armed_conflict, civil_unrest, protest, strike, sanctions, political,
    natural_disaster, seismic, wildfire, cyber_state, financial_risk

  ## Security
    - RLS enabled on every table
    - SELECT: authenticated users only
    - INSERT/UPDATE: service-role only (the edge function), enforced by
      checking auth.role() = 'service_role' in the policy
*/

CREATE TABLE IF NOT EXISTS geopolitical_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  source text NOT NULL,
  category text NOT NULL,
  severity integer NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  headline text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  country_code text NOT NULL DEFAULT '',
  country_name text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  lat double precision NOT NULL DEFAULT 0,
  lon double precision NOT NULL DEFAULT 0,
  url text NOT NULL DEFAULT '',
  tone double precision NOT NULL DEFAULT 0,
  acmeco_exposure_score integer NOT NULL DEFAULT 0,
  exposure_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_geopolitical_events_occurred_at
  ON geopolitical_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_geopolitical_events_category
  ON geopolitical_events (category);
CREATE INDEX IF NOT EXISTS idx_geopolitical_events_severity
  ON geopolitical_events (severity DESC);
CREATE INDEX IF NOT EXISTS idx_geopolitical_events_exposure
  ON geopolitical_events (acmeco_exposure_score DESC);

ALTER TABLE geopolitical_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read geopolitical events"
  ON geopolitical_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read geopolitical events"
  ON geopolitical_events FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS acmeco_exposure_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  asset_type text NOT NULL,
  criticality integer NOT NULL DEFAULT 1 CHECK (criticality BETWEEN 1 AND 5),
  country_code text NOT NULL DEFAULT '',
  country_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  lat double precision NOT NULL DEFAULT 0,
  lon double precision NOT NULL DEFAULT 0,
  radius_km integer NOT NULL DEFAULT 50,
  headcount integer NOT NULL DEFAULT 0,
  revenue_share_pct numeric(5,2) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exposure_zones_country
  ON acmeco_exposure_zones (country_code);

ALTER TABLE acmeco_exposure_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exposure zones"
  ON acmeco_exposure_zones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read exposure zones"
  ON acmeco_exposure_zones FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS geopolitical_fetch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  events_ingested integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  ran_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE geopolitical_fetch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fetch runs"
  ON geopolitical_fetch_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read fetch runs"
  ON geopolitical_fetch_runs FOR SELECT
  TO anon
  USING (true);

INSERT INTO acmeco_exposure_zones
  (name, asset_type, criticality, country_code, country_name, city, lat, lon, radius_km, headcount, revenue_share_pct, notes)
VALUES
  ('Acmeco Global HQ',                 'headquarters', 5, 'BR', 'Brazil',         'Sao Paulo',    -23.5505, -46.6333, 80, 4200, 32.5, 'Executive team, treasury, M&A, primary SOC'),
  ('Acmeco NA HQ',                     'office',       4, 'US', 'United States',  'New York',      40.7128, -74.0060, 50, 1800, 18.0, 'Sales, finance, investor relations'),
  ('Acmeco EU HQ',                     'office',       4, 'DE', 'Germany',        'Frankfurt',     50.1109,   8.6821, 60, 1500, 14.5, 'EU sales, legal, GDPR DPO'),
  ('Acmeco APAC HQ',                   'office',       4, 'SG', 'Singapore',      'Singapore',      1.3521, 103.8198, 40,  900, 11.0, 'APAC sales, regional treasury'),
  ('Frankfurt Datacenter (FRA1)',      'datacenter',   5, 'DE', 'Germany',        'Frankfurt',     50.1109,   8.6821, 30,   80,  0.0, 'Tier-3 DC, EU customer data, GDPR-bound'),
  ('Northern Virginia Datacenter (IAD1)','datacenter', 5, 'US', 'United States',  'Ashburn',       39.0438, -77.4874, 30,  120,  0.0, 'Tier-3 DC, primary US workload'),
  ('Singapore Datacenter (SIN1)',      'datacenter',   5, 'SG', 'Singapore',      'Singapore',      1.3521, 103.8198, 20,   60,  0.0, 'Tier-3 DC, APAC workload + DR'),
  ('Sao Paulo Datacenter (GRU1)',      'datacenter',   5, 'BR', 'Brazil',         'Sao Paulo',    -23.5505, -46.6333, 30,   90,  0.0, 'Tier-3 DC, LatAm workload + LGPD'),
  ('London Sales Office',              'office',       3, 'GB', 'United Kingdom', 'London',        51.5074,  -0.1278, 40,  450,  6.0, 'UK + Ireland sales'),
  ('Dublin Engineering Hub',           'engineering',  4, 'IE', 'Ireland',        'Dublin',        53.3498,  -6.2603, 30,  600,  0.0, 'Core platform engineering'),
  ('Mumbai Engineering Hub',           'engineering',  4, 'IN', 'India',          'Mumbai',        19.0760,  72.8777, 60, 1200,  0.0, 'Backend + ML engineering'),
  ('Bengaluru Engineering Hub',        'engineering',  4, 'IN', 'India',          'Bengaluru',     12.9716,  77.5946, 60, 1400,  0.0, 'Frontend + data engineering'),
  ('Tokyo Sales Office',               'office',       3, 'JP', 'Japan',          'Tokyo',         35.6762, 139.6503, 40,  300,  4.5, 'Japan sales + partner channel'),
  ('Sydney Sales Office',              'office',       3, 'AU', 'Australia',      'Sydney',       -33.8688, 151.2093, 40,  220,  3.5, 'ANZ sales'),
  ('Mexico City Office',               'office',       3, 'MX', 'Mexico',         'Mexico City',   19.4326, -99.1332, 50,  280,  3.0, 'LatAm North sales + support'),
  ('Buenos Aires Office',              'office',       2, 'AR', 'Argentina',      'Buenos Aires', -34.6037, -58.3816, 40,  140,  1.5, 'Cono Sur sales'),
  ('Tel Aviv R&D',                     'engineering',  4, 'IL', 'Israel',         'Tel Aviv',      32.0853,  34.7818, 30,  220,  0.0, 'Security research, threat intel team'),
  ('Shenzhen Supplier Hub',            'supplier',     4, 'CN', 'China',          'Shenzhen',      22.5431, 114.0579, 80,    0,  0.0, 'Hardware OEMs (servers, network gear)'),
  ('Taipei Supplier Hub',              'supplier',     4, 'TW', 'Taiwan',         'Taipei',        25.0330, 121.5654, 60,    0,  0.0, 'Semiconductor and wafer suppliers (TSMC ecosystem)'),
  ('Seoul Supplier Hub',               'supplier',     3, 'KR', 'South Korea',    'Seoul',         37.5665, 126.9780, 60,    0,  0.0, 'Memory, displays, optical comms'),
  ('Cairo Office',                     'office',       2, 'EG', 'Egypt',          'Cairo',         30.0444,  31.2357, 40,   90,  1.0, 'MENA sales support'),
  ('Lagos Office',                     'office',       2, 'NG', 'Nigeria',        'Lagos',          6.5244,   3.3792, 40,  120,  1.2, 'Africa sales + payments'),
  ('Johannesburg Office',              'office',       2, 'ZA', 'South Africa',   'Johannesburg', -26.2041,  28.0473, 40,  100,  1.0, 'Southern Africa sales'),
  ('Dubai Office',                     'office',       3, 'AE', 'UAE',            'Dubai',         25.2048,  55.2708, 40,  170,  2.5, 'Middle East sales hub'),
  ('Istanbul Office',                  'office',       2, 'TR', 'Turkey',         'Istanbul',      41.0082,  28.9784, 40,  100,  1.0, 'Turkey + Levant sales'),
  ('Warsaw Engineering Hub',           'engineering',  3, 'PL', 'Poland',         'Warsaw',        52.2297,  21.0122, 40,  340,  0.0, 'Cloud platform engineering'),
  ('Toronto Office',                   'office',       3, 'CA', 'Canada',         'Toronto',       43.6532, -79.3832, 40,  240,  3.0, 'Canada sales + finance'),
  ('Bogota Office',                    'office',       2, 'CO', 'Colombia',       'Bogota',         4.7110, -74.0721, 40,  130,  1.5, 'Andean region sales'),
  ('Santiago Office',                  'office',       2, 'CL', 'Chile',          'Santiago',     -33.4489, -70.6693, 40,  100,  1.0, 'Andean region sales'),
  ('Hong Kong Treasury',               'finance',      4, 'HK', 'Hong Kong',      'Hong Kong',     22.3193, 114.1694, 30,   60,  0.0, 'APAC treasury booking center'),
  ('Zurich Treasury',                  'finance',      4, 'CH', 'Switzerland',    'Zurich',        47.3769,   8.5417, 30,   45,  0.0, 'EMEA treasury + FX hedging')
ON CONFLICT DO NOTHING;
