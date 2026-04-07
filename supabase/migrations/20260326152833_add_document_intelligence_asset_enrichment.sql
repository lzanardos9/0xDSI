/*
  # Add Document Intelligence Asset Enrichment

  1. Modified Tables
    - `asset_registry`
      - `owner` (text) - Asset owner identified from document analysis
      - `data_classification` (text) - Data classification level (public, internal, confidential, restricted)
      - `business_criticality` (text) - Business criticality from BIA documents
      - `dependencies` (jsonb) - System dependencies discovered from documents
      - `doc_enrichment_count` (integer) - Number of times enriched from documents
      - `last_doc_enrichment` (timestamptz) - Last enrichment timestamp

  2. New Tables
    - `asset_enrichment_log` - Tracks enrichment history linking document intelligence to asset updates
      - `id` (uuid, primary key)
      - `asset_id` (uuid, FK to asset_registry, nullable for new assets)
      - `asset_name` (text) - Asset name
      - `document_name` (text) - Source document name
      - `document_type` (text) - Type of document analyzed
      - `enrichment_type` (text) - What type of enrichment was applied
      - `changes_applied` (jsonb) - Detailed changes that were applied
      - `applied_by` (text) - Who applied the enrichment
      - `confidence_score` (numeric) - AI confidence in the enrichment
      - `created_at` (timestamptz) - When the enrichment was applied

  3. Security
    - Enable RLS on `asset_enrichment_log`
    - Add authenticated and anon write policies on `asset_registry` for enrichment
    - Add authenticated and anon read/insert policies on `asset_enrichment_log`

  4. Notes
    - This connects Document Intelligence analysis results back to the Asset Registry
    - Analysts can apply AI-extracted findings to update existing assets
    - All enrichments are fully auditable via the enrichment log
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'owner'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN owner text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'data_classification'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN data_classification text DEFAULT 'internal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'business_criticality'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN business_criticality text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'dependencies'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN dependencies jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'doc_enrichment_count'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN doc_enrichment_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_registry' AND column_name = 'last_doc_enrichment'
  ) THEN
    ALTER TABLE asset_registry ADD COLUMN last_doc_enrichment timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asset_enrichment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES asset_registry(id),
  asset_name text NOT NULL,
  document_name text NOT NULL,
  document_type text NOT NULL,
  enrichment_type text NOT NULL DEFAULT 'update_existing',
  changes_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_by text DEFAULT 'analyst',
  confidence_score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE asset_enrichment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read enrichment log"
  ON asset_enrichment_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert enrichment log"
  ON asset_enrichment_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon can read enrichment log"
  ON asset_enrichment_log
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert enrichment log"
  ON asset_enrichment_log
  FOR INSERT
  TO anon
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'asset_registry' AND policyname = 'Authenticated users can update assets'
  ) THEN
    CREATE POLICY "Authenticated users can update assets"
      ON asset_registry
      FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'asset_registry' AND policyname = 'Authenticated users can insert assets'
  ) THEN
    CREATE POLICY "Authenticated users can insert assets"
      ON asset_registry
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'asset_registry' AND policyname = 'Anon can update assets for enrichment'
  ) THEN
    CREATE POLICY "Anon can update assets for enrichment"
      ON asset_registry
      FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'asset_registry' AND policyname = 'Anon can insert assets for enrichment'
  ) THEN
    CREATE POLICY "Anon can insert assets for enrichment"
      ON asset_registry
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;
