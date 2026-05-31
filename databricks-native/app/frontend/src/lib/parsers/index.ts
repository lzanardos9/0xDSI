import type { DashboardParser, ParseResult } from './types';
import type { SourceTool } from '../dashboardSchema';
import { grafanaParser } from './grafanaParser';
import { kibanaParser } from './kibanaParser';
import { splunkParser } from './splunkParser';
import { redashParser } from './redashParser';
import { supersetParser } from './supersetParser';
import { metabaseParser } from './metabaseParser';

export type { ParseResult, DashboardParser };

const parsers: DashboardParser[] = [
  grafanaParser,
  kibanaParser,
  splunkParser,
  redashParser,
  supersetParser,
  metabaseParser,
];

export function detectSourceTool(content: string): SourceTool | null {
  for (const parser of parsers) {
    if (parser.detect(content)) {
      return parser.sourceTool;
    }
  }
  return null;
}

export function parseDashboard(content: string, filename: string, sourceTool?: SourceTool): ParseResult {
  if (sourceTool && sourceTool !== 'manual') {
    const parser = parsers.find(p => p.sourceTool === sourceTool);
    if (parser) {
      return parser.parse(content, filename);
    }
    return {
      success: false,
      dashboard: null,
      warnings: [],
      errors: [`No parser available for ${sourceTool}`],
      widgetCount: 0,
      queryCount: 0,
    };
  }

  const detected = detectSourceTool(content);
  if (detected) {
    const parser = parsers.find(p => p.sourceTool === detected);
    if (parser) {
      return parser.parse(content, filename);
    }
  }

  return {
    success: false,
    dashboard: null,
    warnings: [],
    errors: ['Could not detect dashboard format. Please select the source tool manually.'],
    widgetCount: 0,
    queryCount: 0,
  };
}

export function getSupportedTools(): Array<{ tool: SourceTool; parser: DashboardParser }> {
  return parsers.map(p => ({ tool: p.sourceTool, parser: p }));
}
