/*
  # Create Reports System

  1. Overview
    - Custom report storage and management
    - Scheduled report tracking
    - Report execution history
    
  2. Tables
    - custom_reports: User-created custom reports
    - report_schedules: Scheduled report configurations
    - report_executions: Report run history
    
  3. Security
    - Enable RLS on all tables
    - Allow authenticated users to manage their reports
    - Allow anon users for demo purposes
*/

-- Create custom_reports table
CREATE TABLE IF NOT EXISTS custom_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'custom',
  type text DEFAULT 'custom',
  configuration jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create report_schedules table
CREATE TABLE IF NOT EXISTS report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES custom_reports(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  schedule_type text NOT NULL,
  cron_expression text,
  recipients text[] DEFAULT ARRAY[]::text[],
  format text DEFAULT 'pdf',
  enabled boolean DEFAULT true,
  next_run timestamptz,
  last_run timestamptz,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create report_executions table
CREATE TABLE IF NOT EXISTS report_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid,
  report_name text NOT NULL,
  report_type text NOT NULL,
  status text DEFAULT 'running',
  start_time timestamptz DEFAULT NOW(),
  end_time timestamptz,
  duration_seconds integer,
  rows_processed integer DEFAULT 0,
  output_format text DEFAULT 'pdf',
  output_path text,
  error_message text,
  executed_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Enable all access for custom reports" ON custom_reports;
DROP POLICY IF EXISTS "Enable all access for report schedules" ON report_schedules;
DROP POLICY IF EXISTS "Enable all access for report executions" ON report_executions;

-- Create policies for custom_reports
CREATE POLICY "Enable all access for custom reports"
  ON custom_reports FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for report_schedules
CREATE POLICY "Enable all access for report schedules"
  ON report_schedules FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for report_executions
CREATE POLICY "Enable all access for report executions"
  ON report_executions FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_reports_created_by ON custom_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_reports_category ON custom_reports(category);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run);
CREATE INDEX IF NOT EXISTS idx_report_executions_report_id ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status);
CREATE INDEX IF NOT EXISTS idx_report_executions_created_at ON report_executions(created_at);

-- Insert sample custom reports
INSERT INTO custom_reports (name, description, category, type, configuration) VALUES
('Weekly Threat Summary', 'Weekly aggregation of all threat intelligence and alerts', 'threat', 'custom', 
'{"data_sources": ["Threats", "Alerts"], "metrics": ["Count", "Trend"], "time_range": "last_7_days", "grouping": "daily", "chart_type": "line", "schedule": "weekly"}'::jsonb),

('User Activity Baseline', 'Establish baseline for user behavior patterns', 'behavior', 'custom',
'{"data_sources": ["Users", "Events"], "metrics": ["Count", "Average", "Distribution"], "time_range": "last_30_days", "grouping": "daily", "chart_type": "heatmap", "schedule": "monthly"}'::jsonb),

('Critical Asset Risk Report', 'Risk assessment for critical assets', 'asset', 'custom',
'{"data_sources": ["Assets", "Vulnerabilities", "Threats"], "metrics": ["Count", "Sum", "Top N"], "time_range": "last_30_days", "grouping": "weekly", "chart_type": "bar", "schedule": "weekly"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Insert sample report executions
INSERT INTO report_executions (report_name, report_type, status, start_time, end_time, duration_seconds, rows_processed, output_format) VALUES
('Executive Security Posture', 'predefined', 'completed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 58 minutes', 120, 15420, 'pdf'),
('Incident Response Metrics', 'predefined', 'completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '3 minutes', 180, 8934, 'excel'),
('Weekly Threat Summary', 'custom', 'completed', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '5 minutes', 300, 23456, 'pdf'),
('SOC Performance Metrics', 'predefined', 'completed', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 57 minutes', 180, 12340, 'pdf'),
('Vulnerability Summary Report', 'predefined', 'running', NOW() - INTERVAL '5 minutes', NULL, NULL, 0, 'pdf')
ON CONFLICT DO NOTHING;
