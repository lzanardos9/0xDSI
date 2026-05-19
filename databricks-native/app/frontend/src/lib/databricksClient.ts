/**
 * Databricks Native Data Client
 * Direct API calls to the FastAPI backend which queries Unity Catalog.
 */

const API_BASE = '/api';

interface QueryOptions {
  select?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  filters?: Record<string, string>;
}

interface QueryResult<T> {
  data: T[] | null;
  error: Error | null;
}

interface SingleResult<T> {
  data: T | null;
  error: Error | null;
}

class DatabricksQueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private options: QueryOptions = {};

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    this.options.select = columns;
    return this;
  }

  limit(n: number) {
    this.options.limit = n;
    return this;
  }

  order(column: string, { ascending = true } = {}) {
    this.options.orderBy = column;
    this.options.orderDir = ascending ? 'asc' : 'desc';
    return this;
  }

  eq(column: string, value: string) {
    if (!this.options.filters) this.options.filters = {};
    this.options.filters[column] = value;
    return this;
  }

  async execute(): Promise<QueryResult<T>> {
    try {
      const params = new URLSearchParams();
      if (this.options.select) params.set('select', this.options.select);
      if (this.options.limit) params.set('limit', String(this.options.limit));
      if (this.options.offset) params.set('offset', String(this.options.offset));
      if (this.options.orderBy) params.set('order_by', this.options.orderBy);
      if (this.options.orderDir) params.set('order_dir', this.options.orderDir);

      const url = `${API_BASE}/${this.table}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        return { data: null, error: new Error(errorData.detail || 'Query failed') };
      }

      const data = await response.json() as T[];
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async maybeSingle(): Promise<SingleResult<T>> {
    this.options.limit = 1;
    const result = await this.execute();
    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.[0] || null, error: null };
  }
}

class DatabricksClient {
  from<T = Record<string, unknown>>(table: string): DatabricksQueryBuilder<T> {
    return new DatabricksQueryBuilder<T>(table);
  }

  async getDashboardStats() {
    const response = await fetch(`${API_BASE}/dashboard/stats`);
    return response.json();
  }

  async getAgentStatus() {
    const response = await fetch(`${API_BASE}/agents/status`);
    return response.json();
  }

  async getCorrelationMatches(limit = 50) {
    const response = await fetch(`${API_BASE}/correlation/matches?limit=${limit}`);
    return response.json();
  }

  async getThreatIntelSummary() {
    const response = await fetch(`${API_BASE}/threat-intel/summary`);
    return response.json();
  }

  async getUserRiskScores(limit = 20) {
    const response = await fetch(`${API_BASE}/user-behavior/risk-scores?limit=${limit}`);
    return response.json();
  }

  async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }
}

export const db = new DatabricksClient();
export default db;
