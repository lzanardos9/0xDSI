/*
  # Add Databricks Export Tracking

  1. Modified Tables
    - `custom_dashboards`
      - `databricks_config` (jsonb) - stores catalog, schema, warehouse_id, last export format
      - `databricks_exported_at` (timestamptz) - when last exported to Databricks

  2. New Tables
    - `databricks_export_history` - tracks every export event
      - `id` (uuid, primary key)
      - `dashboard_id` (uuid, references custom_dashboards)
      - `user_id` (uuid)
      - `export_format` (text) - sql_dashboard, lakeview, notebook, all
      - `catalog` (text) - Unity Catalog target
      - `schema_name` (text) - Unity Catalog schema target
      - `warehouse_id` (text) - SQL Warehouse ID
      - `widget_count` (integer) - number of widgets exported
      - `query_count` (integer) - number of queries translated
      - `created_at` (timestamptz)

  3. Security
    - RLS on databricks_export_history for authenticated users
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_dashboards' AND column_name = 'databricks_config'
  ) THEN
    ALTER TABLE custom_dashboards ADD COLUMN databricks_config jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_dashboards' AND column_name = 'databricks_exported_at'
  ) THEN
    ALTER TABLE custom_dashboards ADD COLUMN databricks_exported_at timestamptz DEFAULT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS databricks_export_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid REFERENCES custom_dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  export_format text NOT NULL,
  catalog text NOT NULL DEFAULT 'soc_analytics',
  schema_name text NOT NULL DEFAULT 'security_data',
  warehouse_id text DEFAULT '',
  widget_count integer DEFAULT 0,
  query_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE databricks_export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export history"
  ON databricks_export_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own export history"
  ON databricks_export_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own export history"
  ON databricks_export_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_databricks_export_history_dashboard
  ON databricks_export_history(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_databricks_export_history_user
  ON databricks_export_history(user_id);
