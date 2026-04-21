/*
  # Insider Credential Selling Detection System

  Detects employees and account holders who willingly sell their banking credentials,
  API keys, or internal access to criminal networks.

  Key detection signals:
  - Multiple distinct behavioral fingerprints on the same account (different operators)
  - Credentials found on dark web marketplaces
  - "Handoff" patterns where the real owner stops using the account and a new operator takes over
  - Incoming micro-payments before access handoffs (payment for credentials)
  - Shared device fingerprints with known bad actors
  - Session alternation patterns (seller and buyer taking turns)
  - Credential rotation correlated with dark web listing updates

  1. New Tables
    - `credential_selling_cases` - Main case tracking for suspected credential sellers
      - `id` (uuid, primary key)
      - `case_id` (text) - unique case identifier
      - `entity_id` (text) - the account/user being investigated
      - `entity_name` (text)
      - `account_type` (text) - banking, api_key, internal_access, vpn, email
      - `seller_confidence` (integer 0-100) - confidence that this is willful selling vs theft
      - `risk_tier` (text) - low, medium, high, critical
      - `status` (text) - monitoring, suspected, confirmed, neutralized, false_positive
      - `detection_method` (text) - dark_web_hit, behavioral_analysis, multi_operator, financial_correlation, peer_report
      - `first_indicator_at` (timestamptz) - when first suspicious signal appeared
      - `dark_web_intel` (jsonb) - marketplace listings, pricing, seller reputation
      - `behavioral_fingerprints` (jsonb) - distinct operator fingerprints detected
      - `handoff_timeline` (jsonb) - chronological handoff events
      - `financial_indicators` (jsonb) - suspicious incoming payments, crypto receipts
      - `multi_operator_evidence` (jsonb) - evidence of multiple distinct operators
      - `credential_rotation_events` (jsonb) - password changes correlated with listings
      - `network_connections` (jsonb) - connections to known criminal networks
      - `investigation_notes` (text)
      - `created_at` (timestamptz)

    - `credential_dark_web_hits` - Dark web marketplace monitoring results
      - `id` (uuid, primary key)
      - `hit_id` (text)
      - `marketplace` (text) - which dark web marketplace
      - `listing_type` (text) - banking_credentials, api_key, vpn_access, internal_system, full_identity
      - `entity_id` (text) - matched entity
      - `listing_price` (numeric) - price in USD
      - `currency` (text)
      - `seller_handle` (text) - dark web seller username
      - `seller_reputation` (numeric) - marketplace reputation score
      - `listing_description` (text)
      - `verification_status` (text) - unverified, credential_match, active_listing, expired, taken_down
      - `credential_freshness` (text) - current, recent, stale
      - `includes_2fa_bypass` (boolean)
      - `sample_data` (jsonb) - redacted sample from listing
      - `discovered_at` (timestamptz)
      - `last_checked_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS credential_selling_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  entity_id text NOT NULL,
  entity_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'banking',
  seller_confidence integer NOT NULL DEFAULT 0,
  risk_tier text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'monitoring',
  detection_method text NOT NULL DEFAULT 'behavioral_analysis',
  first_indicator_at timestamptz DEFAULT now(),
  dark_web_intel jsonb DEFAULT '{}'::jsonb,
  behavioral_fingerprints jsonb DEFAULT '[]'::jsonb,
  handoff_timeline jsonb DEFAULT '[]'::jsonb,
  financial_indicators jsonb DEFAULT '[]'::jsonb,
  multi_operator_evidence jsonb DEFAULT '{}'::jsonb,
  credential_rotation_events jsonb DEFAULT '[]'::jsonb,
  network_connections jsonb DEFAULT '[]'::jsonb,
  investigation_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE credential_selling_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read credential selling cases"
  ON credential_selling_cases FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS credential_dark_web_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hit_id text NOT NULL,
  marketplace text NOT NULL,
  listing_type text NOT NULL,
  entity_id text NOT NULL,
  listing_price numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  seller_handle text DEFAULT '',
  seller_reputation numeric DEFAULT 0,
  listing_description text DEFAULT '',
  verification_status text NOT NULL DEFAULT 'unverified',
  credential_freshness text DEFAULT 'unknown',
  includes_2fa_bypass boolean DEFAULT false,
  sample_data jsonb DEFAULT '{}'::jsonb,
  discovered_at timestamptz DEFAULT now(),
  last_checked_at timestamptz DEFAULT now()
);

ALTER TABLE credential_dark_web_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dark web hits"
  ON credential_dark_web_hits FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cred_sell_entity ON credential_selling_cases(entity_id);
CREATE INDEX IF NOT EXISTS idx_cred_sell_status ON credential_selling_cases(status);
CREATE INDEX IF NOT EXISTS idx_cred_sell_confidence ON credential_selling_cases(seller_confidence);
CREATE INDEX IF NOT EXISTS idx_dark_web_entity ON credential_dark_web_hits(entity_id);
CREATE INDEX IF NOT EXISTS idx_dark_web_marketplace ON credential_dark_web_hits(marketplace);
CREATE INDEX IF NOT EXISTS idx_dark_web_verification ON credential_dark_web_hits(verification_status);
