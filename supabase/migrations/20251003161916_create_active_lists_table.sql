/*
  # Create Active Lists Table

  1. New Table
    - `active_lists` - Blocklists, allowlists, and watchlists management
      - `id` (uuid, primary key) - Unique list identifier
      - `name` (text) - List name
      - `list_type` (text) - Type: blocklist, allowlist, watchlist
      - `category` (text) - Category: ip, domain, user, hash
      - `description` (text) - List description
      - `entries` (jsonb) - Array of list entries
      - `auto_update` (boolean) - Auto-update enabled flag
      - `source_url` (text) - External feed URL if applicable
      - `last_updated` (timestamptz) - Last update timestamp
      - `created_at` (timestamptz) - Record creation time
      - `updated_at` (timestamptz) - Record update time

  2. Security
    - Enable RLS on active_lists table
    - Add policies for authenticated users

  3. Sample Data
    - Pre-populate with common security lists
*/

CREATE TABLE IF NOT EXISTS active_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  list_type text NOT NULL,
  category text NOT NULL,
  description text,
  entries jsonb DEFAULT '[]'::jsonb,
  auto_update boolean DEFAULT false,
  source_url text,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_list_type CHECK (list_type IN ('blocklist', 'allowlist', 'watchlist')),
  CONSTRAINT valid_category CHECK (category IN ('ip', 'domain', 'user', 'hash'))
);

CREATE INDEX IF NOT EXISTS idx_active_lists_type ON active_lists(list_type);
CREATE INDEX IF NOT EXISTS idx_active_lists_category ON active_lists(category);
CREATE INDEX IF NOT EXISTS idx_active_lists_auto_update ON active_lists(auto_update);

ALTER TABLE active_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read active lists"
  ON active_lists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert active lists"
  ON active_lists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update active lists"
  ON active_lists FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete active lists"
  ON active_lists FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_active_list_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_active_lists_updated_at
  BEFORE UPDATE ON active_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_active_list_timestamp();

-- Insert sample active lists
INSERT INTO active_lists (name, list_type, category, description, entries, auto_update, source_url)
VALUES
  (
    'Known Malicious IPs',
    'blocklist',
    'ip',
    'Automatically updated list of known malicious IP addresses from threat intelligence feeds',
    jsonb_build_array(
      '45.142.212.61',
      '103.147.184.66',
      '185.220.101.47',
      '91.195.240.94',
      '194.165.16.10',
      '185.100.87.41',
      '198.98.51.189',
      '23.129.64.131',
      '104.244.72.7',
      '146.70.106.93'
    ),
    true,
    'https://feodotracker.abuse.ch/downloads/ipblocklist.txt'
  ),
  (
    'Trusted Internal Networks',
    'allowlist',
    'ip',
    'Internal company network ranges that are always trusted',
    jsonb_build_array(
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16'
    ),
    false,
    null
  ),
  (
    'C2 Command Domains',
    'blocklist',
    'domain',
    'Known command and control server domains',
    jsonb_build_array(
      'malicious-c2.example.com',
      'evil-server.net',
      'bad-actor-domain.org',
      'phishing-site.ru',
      'malware-download.xyz'
    ),
    true,
    'https://urlhaus.abuse.ch/downloads/text/'
  ),
  (
    'Suspicious User Accounts',
    'watchlist',
    'user',
    'User accounts flagged for monitoring due to unusual activity patterns',
    jsonb_build_array(
      'user_12847',
      'temp_admin_001',
      'test_account_99',
      'contractor_external_45'
    ),
    false,
    null
  ),
  (
    'Malware File Hashes',
    'blocklist',
    'hash',
    'SHA256 hashes of known malware samples',
    jsonb_build_array(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
      '5d41402abc4b2a76b9719d911017c592',
      'a3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3'
    ),
    true,
    'https://bazaar.abuse.ch/export/txt/sha256/recent/'
  ),
  (
    'VIP Users',
    'allowlist',
    'user',
    'Executive and VIP user accounts with elevated privileges',
    jsonb_build_array(
      'ceo',
      'cto',
      'ciso',
      'admin',
      'security_lead'
    ),
    false,
    null
  ),
  (
    'Emerging Threats IPs',
    'watchlist',
    'ip',
    'Recently reported suspicious IP addresses under investigation',
    jsonb_build_array(
      '89.248.172.16',
      '142.93.228.185',
      '167.71.13.196',
      '206.189.28.199',
      '178.62.89.182'
    ),
    true,
    'https://rules.emergingthreats.net/blockrules/compromised-ips.txt'
  ),
  (
    'Approved External Domains',
    'allowlist',
    'domain',
    'Third-party domains approved for business operations',
    jsonb_build_array(
      'github.com',
      'stackoverflow.com',
      'microsoft.com',
      'google.com',
      'aws.amazon.com'
    ),
    false,
    null
  ),
  (
    'Cryptocurrency Mining IPs',
    'blocklist',
    'ip',
    'IP addresses associated with unauthorized cryptocurrency mining',
    jsonb_build_array(
      '95.179.164.196',
      '51.255.48.78',
      '185.244.25.234',
      '107.189.30.187',
      '198.251.89.142'
    ),
    true,
    'https://cryptomining-blocklist.example.com/ips.txt'
  ),
  (
    'Phishing Domains',
    'blocklist',
    'domain',
    'Domains used in active phishing campaigns',
    jsonb_build_array(
      'secure-login-verify.com',
      'account-update-required.net',
      'banking-security-alert.org',
      'paypal-verify-account.xyz',
      'microsoft-security-team.info'
    ),
    true,
    'https://phishing.database.example.com/domains.txt'
  ),
  (
    'Privileged Accounts Monitor',
    'watchlist',
    'user',
    'Accounts with administrative privileges monitored for anomalous behavior',
    jsonb_build_array(
      'root',
      'administrator',
      'sysadmin',
      'dbadmin',
      'networkadmin'
    ),
    false,
    null
  ),
  (
    'APT Group Indicators',
    'blocklist',
    'hash',
    'File hashes associated with Advanced Persistent Threat groups',
    jsonb_build_array(
      '8f4e33f3dc3e414ff94e5fb6905cba8c',
      'ab12cd34ef56gh78ij90kl12mn34op56',
      '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p',
      'fedcba9876543210fedcba9876543210'
    ),
    true,
    'https://apt-indicators.threatintel.example.com/hashes.txt'
  );
