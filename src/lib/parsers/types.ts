import type { UniversalDashboard, SourceTool } from '../dashboardSchema';

export interface ParseResult {
  success: boolean;
  dashboard: UniversalDashboard | null;
  warnings: string[];
  errors: string[];
  widgetCount: number;
  queryCount: number;
}

export interface DashboardParser {
  sourceTool: SourceTool;
  detect(content: string): boolean;
  parse(content: string, filename: string): ParseResult;
}
