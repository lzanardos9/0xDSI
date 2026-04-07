/*
  # Dashboard Builder & Migrations System

  1. New Tables
    - `custom_dashboards` - Stores user-created and migrated dashboard layouts
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - dashboard display name
      - `description` (text) - optional description
      - `source_tool` (text) - origin tool (grafana, kibana, splunk, redash, superset, metabase, manual)
      - `layout_config` (jsonb) - full grid layout with widget positions
      - `variables` (jsonb) - template variables / filters
      - `theme` (text) - visual theme preference
      - `is_published` (boolean) - whether dashboard is shared
      - `tags` (text[]) - categorization tags
      - `thumbnail_data` (text) - base64 thumbnail preview
      - `created_at` / `updated_at` (timestamptz)

    - `dashboard_widgets` - Individual widgets within dashboards
      - `id` (uuid, primary key)
      - `dashboard_id` (uuid, references custom_dashboards)
      - `title` (text) - widget title
      - `widget_type` (text) - chart, table, stat, text, map, gauge, etc.
      - `chart_type` (text) - line, bar, pie, area, heatmap, scatter, etc.
      - `chart_config` (jsonb) - visualization configuration (colors, axes, legends)
      - `data_source` (jsonb) - query config (original query, translated SQL, refresh interval)
      - `position` (jsonb) - grid position {x, y, w, h}
      - `created_at` (timestamptz)

    - `dashboard_migrations` - Tracks migration jobs from external tools
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `source_tool` (text) - which tool the dashboard came from
      - `source_filename` (text) - original file name
      - `original_content` (text) - raw uploaded content
      - `parsed_schema` (jsonb) - intermediate representation after parsing
      - `translated_schema` (jsonb) - final translated schema after LLM processing
      - `translation_status` (text) - pending, parsing, translating, review, completed, failed
      - `widget_count` (integer) - number of widgets detected
      - `confidence_score` (numeric) - overall translation confidence
      - `error_log` (text) - error details if failed
      - `created_at` (timestamptz)

    - `dashboard_templates` - Pre-built dashboard templates
      - `id` (uuid, primary key)
      - `name` (text) - template name
      - `description` (text) - template description
      - `category` (text) - SOC, network, compliance, executive, threat intel, etc.
      - `layout_config` (jsonb) - full dashboard configuration
      - `preview_widgets` (jsonb) - widget summaries for preview
      - `is_system` (boolean) - system-provided vs user-created
      - `usage_count` (integer) - how many times used
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own dashboards
    - Published dashboards are readable by all authenticated users
    - Templates readable by all authenticated users
    - Migrations only accessible by the user who created them
*/

-- custom_dashboards
CREATE TABLE IF NOT EXISTS custom_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  description text DEFAULT '',
  source_tool text NOT NULL DEFAULT 'manual',
  layout_config jsonb NOT NULL DEFAULT '{"columns": 12, "rowHeight": 80}'::jsonb,
  variables jsonb DEFAULT '[]'::jsonb,
  theme text DEFAULT 'dark',
  is_published boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  thumbnail_data text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE custom_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboards"
  ON custom_dashboards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_published = true);

CREATE POLICY "Users can insert own dashboards"
  ON custom_dashboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboards"
  ON custom_dashboards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboards"
  ON custom_dashboards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- dashboard_widgets
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES custom_dashboards(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Widget',
  widget_type text NOT NULL DEFAULT 'chart',
  chart_type text DEFAULT 'bar',
  chart_config jsonb DEFAULT '{}'::jsonb,
  data_source jsonb DEFAULT '{}'::jsonb,
  position jsonb NOT NULL DEFAULT '{"x": 0, "y": 0, "w": 6, "h": 4}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view widgets of accessible dashboards"
  ON dashboard_widgets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM custom_dashboards
      WHERE custom_dashboards.id = dashboard_widgets.dashboard_id
      AND (custom_dashboards.user_id = auth.uid() OR custom_dashboards.is_published = true)
    )
  );

CREATE POLICY "Users can insert widgets to own dashboards"
  ON dashboard_widgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_dashboards
      WHERE custom_dashboards.id = dashboard_widgets.dashboard_id
      AND custom_dashboards.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update widgets of own dashboards"
  ON dashboard_widgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM custom_dashboards
      WHERE custom_dashboards.id = dashboard_widgets.dashboard_id
      AND custom_dashboards.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_dashboards
      WHERE custom_dashboards.id = dashboard_widgets.dashboard_id
      AND custom_dashboards.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete widgets of own dashboards"
  ON dashboard_widgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM custom_dashboards
      WHERE custom_dashboards.id = dashboard_widgets.dashboard_id
      AND custom_dashboards.user_id = auth.uid()
    )
  );

-- dashboard_migrations
CREATE TABLE IF NOT EXISTS dashboard_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_tool text NOT NULL,
  source_filename text NOT NULL DEFAULT 'unknown',
  original_content text NOT NULL DEFAULT '',
  parsed_schema jsonb DEFAULT '{}'::jsonb,
  translated_schema jsonb DEFAULT '{}'::jsonb,
  translation_status text NOT NULL DEFAULT 'pending',
  widget_count integer DEFAULT 0,
  confidence_score numeric DEFAULT 0,
  error_log text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own migrations"
  ON dashboard_migrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own migrations"
  ON dashboard_migrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own migrations"
  ON dashboard_migrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own migrations"
  ON dashboard_migrations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- dashboard_templates
CREATE TABLE IF NOT EXISTS dashboard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_widgets jsonb DEFAULT '[]'::jsonb,
  is_system boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON dashboard_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only system can insert templates"
  ON dashboard_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_system = false);

CREATE POLICY "Users cannot update system templates"
  ON dashboard_templates FOR UPDATE
  TO authenticated
  USING (is_system = false)
  WITH CHECK (is_system = false);

CREATE POLICY "Users cannot delete system templates"
  ON dashboard_templates FOR DELETE
  TO authenticated
  USING (is_system = false);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_dashboards_user_id ON custom_dashboards(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_dashboards_published ON custom_dashboards(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard_id ON dashboard_widgets(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_migrations_user_id ON dashboard_migrations(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_migrations_status ON dashboard_migrations(translation_status);
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_category ON dashboard_templates(category);

-- Insert system templates
INSERT INTO dashboard_templates (name, description, category, layout_config, preview_widgets, is_system) VALUES
(
  'SOC Overview',
  'Comprehensive Security Operations Center dashboard with alerts, events, and threat metrics',
  'soc',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Critical Alerts", "type": "stat", "chartType": "stat"}, {"title": "Events Timeline", "type": "chart", "chartType": "area"}, {"title": "Threat Distribution", "type": "chart", "chartType": "pie"}, {"title": "Top Source IPs", "type": "table", "chartType": "table"}]',
  true
),
(
  'Threat Intelligence',
  'Threat feeds, IOCs, and intelligence tracking dashboard',
  'threat_intel',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Active IOCs", "type": "stat", "chartType": "stat"}, {"title": "Threat Feed Status", "type": "chart", "chartType": "bar"}, {"title": "IOC Matches Over Time", "type": "chart", "chartType": "line"}, {"title": "Threat Origins Map", "type": "map", "chartType": "map"}]',
  true
),
(
  'Network Security',
  'Network traffic analysis, DPI results, and topology overview',
  'network',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Bandwidth Usage", "type": "chart", "chartType": "area"}, {"title": "Protocol Distribution", "type": "chart", "chartType": "pie"}, {"title": "Top Talkers", "type": "table", "chartType": "table"}, {"title": "Blocked Connections", "type": "stat", "chartType": "stat"}]',
  true
),
(
  'Executive Summary',
  'High-level security posture and business impact metrics for leadership',
  'executive',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Risk Score", "type": "gauge", "chartType": "gauge"}, {"title": "MTTD / MTTR", "type": "stat", "chartType": "stat"}, {"title": "Incidents This Month", "type": "chart", "chartType": "bar"}, {"title": "Compliance Status", "type": "chart", "chartType": "bar"}]',
  true
),
(
  'Compliance & Audit',
  'Regulatory compliance tracking across NIST, ISO 27001, SOC2, and more',
  'compliance',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Framework Scores", "type": "chart", "chartType": "bar"}, {"title": "Control Status", "type": "chart", "chartType": "pie"}, {"title": "Audit Trail", "type": "table", "chartType": "table"}, {"title": "Overdue Items", "type": "stat", "chartType": "stat"}]',
  true
),
(
  'User Behavior Analytics',
  'User activity monitoring, anomaly detection, and risk scoring',
  'behavioral',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Anomaly Score Distribution", "type": "chart", "chartType": "heatmap"}, {"title": "High Risk Users", "type": "table", "chartType": "table"}, {"title": "Login Patterns", "type": "chart", "chartType": "line"}, {"title": "Behavioral Baseline", "type": "chart", "chartType": "area"}]',
  true
),
(
  'Vulnerability Management',
  'CVE tracking, severity distribution, and remediation progress',
  'vulnerability',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Critical CVEs", "type": "stat", "chartType": "stat"}, {"title": "Severity Distribution", "type": "chart", "chartType": "pie"}, {"title": "Remediation Progress", "type": "chart", "chartType": "bar"}, {"title": "Asset Vulnerability Matrix", "type": "table", "chartType": "table"}]',
  true
),
(
  'Incident Response',
  'Active cases, response timelines, and escalation tracking',
  'incident_response',
  '{"columns": 12, "rowHeight": 80}',
  '[{"title": "Open Cases", "type": "stat", "chartType": "stat"}, {"title": "Case Timeline", "type": "chart", "chartType": "line"}, {"title": "Severity Breakdown", "type": "chart", "chartType": "bar"}, {"title": "Response SLAs", "type": "gauge", "chartType": "gauge"}]',
  true
);
