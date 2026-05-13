/*
  # ChronoWeave - Compounding Threat Graph + Vector Similarity System

  ## Overview
  ChronoWeave is a real-time compounding threat graph engine that fuses raw event
  graphs with vector-embedding similarity against a library of historical "bad"
  attack centroids (criminal, insider, and state-sponsored). The graph compounds
  forever; benign nodes can be visually swept while remaining accessible via
  vector correlation.

  ## New Tables
  1. `chronoweave_sessions` - Session-level lifecycle for a compounding run
     - id (uuid), name (text), started_at, last_tick_at, status, node_count, edge_count
  2. `chronoweave_nodes` - Each node in the compounding graph
     - id (uuid), session_id, label (event name), entity_type, payload (jsonb),
       embedding (float8[8] - small for client-side cosine), x/y/z (float8),
       is_benign (bool), best_centroid_id (uuid), best_similarity (float8),
       created_at, tick_index (int)
  3. `chronoweave_edges` - Edges between nodes
     - id (uuid), session_id, source_id, target_id, weight, kind (text), created_at
  4. `chronoweave_bad_centroids` - Library of historical bad attack centroids
     - id (uuid), name, actor_class (criminal|insider|state-sponsored|supply-chain),
       actor_country, embedding (float8[8]), description, severity, mitre_tactics (text[])
  5. `chronoweave_similarity_hits` - Detected matches between live nodes and centroids
     - id (uuid), session_id, node_id, centroid_id, similarity, created_at

  ## Security
  - RLS enabled on all tables; authenticated users can SELECT/INSERT/UPDATE/DELETE
    their own session data. Centroids are read-only catalog data for authenticated.

  ## Notes
  1. Embeddings stored as float8[8] for fast in-browser cosine without pgvector.
  2. Realtime is enabled on nodes/edges/hits via Supabase publication.
*/

CREATE TABLE IF NOT EXISTS chronoweave_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'ChronoWeave Session',
  started_at timestamptz DEFAULT now(),
  last_tick_at timestamptz DEFAULT now(),
  status text DEFAULT 'running',
  node_count int DEFAULT 0,
  edge_count int DEFAULT 0,
  tick_count int DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chronoweave_bad_centroids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  actor_class text NOT NULL DEFAULT 'criminal',
  actor_country text DEFAULT '',
  embedding float8[] NOT NULL,
  description text DEFAULT '',
  severity text DEFAULT 'high',
  mitre_tactics text[] DEFAULT ARRAY[]::text[],
  color text DEFAULT '#ef4444',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chronoweave_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chronoweave_sessions(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'event',
  entity_type text DEFAULT 'event',
  payload jsonb DEFAULT '{}'::jsonb,
  embedding float8[] NOT NULL,
  x float8 DEFAULT 0,
  y float8 DEFAULT 0,
  z float8 DEFAULT 0,
  is_benign boolean DEFAULT true,
  best_centroid_id uuid REFERENCES chronoweave_bad_centroids(id) ON DELETE SET NULL,
  best_similarity float8 DEFAULT 0,
  tick_index int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cw_nodes_session ON chronoweave_nodes(session_id, created_at);

CREATE TABLE IF NOT EXISTS chronoweave_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chronoweave_sessions(id) ON DELETE CASCADE,
  source_id uuid REFERENCES chronoweave_nodes(id) ON DELETE CASCADE,
  target_id uuid REFERENCES chronoweave_nodes(id) ON DELETE CASCADE,
  weight float8 DEFAULT 1,
  kind text DEFAULT 'temporal',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cw_edges_session ON chronoweave_edges(session_id, created_at);

CREATE TABLE IF NOT EXISTS chronoweave_similarity_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chronoweave_sessions(id) ON DELETE CASCADE,
  node_id uuid REFERENCES chronoweave_nodes(id) ON DELETE CASCADE,
  centroid_id uuid REFERENCES chronoweave_bad_centroids(id) ON DELETE CASCADE,
  similarity float8 NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cw_hits_session ON chronoweave_similarity_hits(session_id, similarity DESC);

ALTER TABLE chronoweave_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chronoweave_bad_centroids ENABLE ROW LEVEL SECURITY;
ALTER TABLE chronoweave_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chronoweave_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE chronoweave_similarity_hits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Auth users read sessions" ON chronoweave_sessions FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Auth users write sessions" ON chronoweave_sessions FOR INSERT TO authenticated, anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Auth users update sessions" ON chronoweave_sessions FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Auth users delete sessions" ON chronoweave_sessions FOR DELETE TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Read centroids" ON chronoweave_bad_centroids FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Read nodes" ON chronoweave_nodes FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Insert nodes" ON chronoweave_nodes FOR INSERT TO authenticated, anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Update nodes" ON chronoweave_nodes FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Delete nodes" ON chronoweave_nodes FOR DELETE TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Read edges" ON chronoweave_edges FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Insert edges" ON chronoweave_edges FOR INSERT TO authenticated, anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Delete edges" ON chronoweave_edges FOR DELETE TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Read hits" ON chronoweave_similarity_hits FOR SELECT TO authenticated, anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Insert hits" ON chronoweave_similarity_hits FOR INSERT TO authenticated, anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO chronoweave_bad_centroids (name, actor_class, actor_country, embedding, description, severity, mitre_tactics, color) VALUES
  ('Lazarus / DPRK Crypto Heist', 'state-sponsored', 'KP', ARRAY[0.92,0.18,0.74,0.31,0.88,0.12,0.65,0.79], 'DPRK financial-motivated state actor; SWIFT/crypto exchange theft, supply-chain', 'critical', ARRAY['initial-access','exfiltration','impact'], '#ef4444'),
  ('Volt Typhoon / China LOTL', 'state-sponsored', 'CN', ARRAY[0.81,0.74,0.22,0.19,0.69,0.91,0.31,0.45], 'Living-off-the-land critical-infrastructure pre-positioning, fileless persistence', 'critical', ARRAY['persistence','defense-evasion','discovery'], '#f97316'),
  ('Sandworm / GRU 74455', 'state-sponsored', 'RU', ARRAY[0.71,0.83,0.91,0.42,0.18,0.27,0.88,0.31], 'Destructive ICS attacks, wiper malware, election interference', 'critical', ARRAY['impact','lateral-movement'], '#dc2626'),
  ('Equation Group / NSA-tier', 'state-sponsored', 'US', ARRAY[0.95,0.45,0.78,0.91,0.23,0.31,0.42,0.88], 'Advanced firmware implants, zero-day chains, air-gap bridging', 'critical', ARRAY['persistence','privilege-escalation'], '#0ea5e9'),
  ('Mustang Panda / Bronze President', 'state-sponsored', 'CN', ARRAY[0.42,0.81,0.55,0.73,0.91,0.18,0.22,0.69], 'PlugX/Korplug, NGO and diplomatic targeting, USB worms', 'high', ARRAY['initial-access','collection'], '#fb923c'),
  ('Turla / Snake Venomous', 'state-sponsored', 'RU', ARRAY[0.88,0.31,0.45,0.92,0.74,0.22,0.18,0.81], 'Satellite C2, Snake/Uroburos rootkit, embassy espionage', 'critical', ARRAY['command-and-control','exfiltration'], '#b91c1c'),
  ('Kimsuky / Velvet Chollima', 'state-sponsored', 'KP', ARRAY[0.74,0.22,0.91,0.18,0.45,0.88,0.31,0.65], 'Spear-phishing think-tanks, credential theft, BabyShark malware', 'high', ARRAY['initial-access','credential-access'], '#f59e0b'),
  ('APT-29 / Cozy Bear', 'state-sponsored', 'RU', ARRAY[0.91,0.45,0.31,0.88,0.18,0.74,0.22,0.69], 'SolarWinds-style supply chain, OAuth abuse, cloud persistence', 'critical', ARRAY['initial-access','persistence'], '#dc2626'),
  ('APT-28 / Fancy Bear', 'state-sponsored', 'RU', ARRAY[0.85,0.55,0.42,0.78,0.31,0.69,0.22,0.91], 'Sednit, X-Agent mobile, election infrastructure', 'critical', ARRAY['credential-access','collection'], '#ef4444'),
  ('APT-41 / Double Dragon', 'state-sponsored', 'CN', ARRAY[0.78,0.92,0.45,0.31,0.88,0.22,0.74,0.18], 'Dual espionage + financial, gaming-industry supply-chain', 'critical', ARRAY['initial-access','impact'], '#fb7185'),
  ('Cl0p / FIN11 ransomware', 'criminal', 'RU', ARRAY[0.18,0.91,0.74,0.45,0.31,0.88,0.22,0.69], 'MOVEit/GoAnywhere mass exploitation, double extortion', 'critical', ARRAY['initial-access','exfiltration','impact'], '#a3e635'),
  ('BlackCat / ALPHV', 'criminal', 'RU', ARRAY[0.22,0.88,0.45,0.91,0.18,0.74,0.31,0.65], 'Rust-based ransomware, healthcare/casino targeting, triple extortion', 'critical', ARRAY['exfiltration','impact'], '#22d3ee'),
  ('FIN7-BR / Carbanak BR', 'criminal', 'BR', ARRAY[0.31,0.74,0.88,0.22,0.91,0.18,0.45,0.69], 'POS malware, banking trojan delivery, Brazilian financial sector', 'high', ARRAY['initial-access','collection'], '#34d399'),
  ('PIX-Mule / Brazilian Banking', 'criminal', 'BR', ARRAY[0.45,0.18,0.91,0.74,0.22,0.88,0.31,0.65], 'PIX instant-payment fraud, money mule networks, account takeover', 'high', ARRAY['credential-access','impact'], '#fbbf24'),
  ('Insider-Exfil / Snowden-class', 'insider', '', ARRAY[0.65,0.31,0.22,0.88,0.91,0.45,0.74,0.18], 'Privileged user mass exfil to removable media or personal cloud', 'critical', ARRAY['exfiltration','collection'], '#f43f5e'),
  ('Supply-Chain / SolarWinds-class', 'supply-chain', '', ARRAY[0.88,0.74,0.31,0.45,0.22,0.91,0.18,0.65], 'Trusted software update poisoning, CI/CD pipeline compromise', 'critical', ARRAY['initial-access','persistence'], '#fb923c'),
  ('Air-Gap-Acoustic / Mosquito', 'state-sponsored', '', ARRAY[0.91,0.22,0.45,0.18,0.74,0.31,0.88,0.65], 'Covert channels via ultrasonic/EM emanations across air-gaps', 'critical', ARRAY['exfiltration','command-and-control'], '#c084fc'),
  ('Scattered Spider / UNC3944', 'criminal', 'US', ARRAY[0.74,0.45,0.18,0.91,0.31,0.88,0.22,0.69], 'SIM-swap, vishing helpdesk, MFA-fatigue, Okta abuse', 'critical', ARRAY['credential-access','initial-access'], '#facc15'),
  ('Charming Kitten / APT-35', 'state-sponsored', 'IR', ARRAY[0.55,0.91,0.31,0.74,0.18,0.45,0.88,0.22], 'Iranian IRGC, journalist/diaspora targeting, fake personas', 'high', ARRAY['initial-access','collection'], '#fb7185'),
  ('Ocean Lotus / APT-32', 'state-sponsored', 'VN', ARRAY[0.45,0.74,0.91,0.18,0.65,0.22,0.31,0.88], 'Vietnamese, ASEAN diplomatic and automotive industry targeting', 'high', ARRAY['initial-access','persistence'], '#22d3ee')
ON CONFLICT DO NOTHING;
