/**
 * Databricks-Native Data Client
 * Provides the query builder interface used by all UI components.
 * All queries route through the FastAPI backend which queries Unity Catalog via SQL Warehouse.
 *
 * This file exists at this path for import compatibility with the React component library.
 */

const API_BASE = '/api';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SecurityEvent {
  id: string;
  timestamp: string;
  event_type: string;
  source: string;
  source_ip: string;
  dest_ip: string;
  user_id: string;
  username: string;
  action: string;
  outcome: string;
  severity: string;
  raw_log: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  source: string;
  rule_id: string;
  rule_name: string;
  mitre_tactic: string;
  mitre_technique: string;
  confidence_score: number;
  risk_score: number;
  created_at: string;
}

export interface Case {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  severity: string;
  assigned_to: string;
  created_at: string;
}

export interface ThreatIntelligence {
  id: string;
  indicator_type: string;
  value: string;
  threat_type: string;
  confidence: number;
  source: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  email: string;
  username: string;
  department: string;
  role: string;
  risk_level: string;
}

// ──────────────────────────────────────────────
// Query Builder
// ──────────────────────────────────────────────

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number;
}

interface SingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

class QueryBuilder<T = Record<string, unknown>> {
  private _table: string;
  private _select: string = '*';
  private _limit: number = 100;
  private _offset: number = 0;
  private _orderBy: string | null = null;
  private _orderAsc: boolean = false;
  private _filters: Array<{ column: string; op: string; value: string }> = [];

  constructor(table: string) {
    this._table = table;
  }

  select(columns: string = '*') {
    this._select = columns;
    return this;
  }

  eq(column: string, value: string | number | boolean) {
    this._filters.push({ column, op: 'eq', value: String(value) });
    return this;
  }

  neq(column: string, value: string | number | boolean) {
    this._filters.push({ column, op: 'neq', value: String(value) });
    return this;
  }

  in(column: string, values: string[]) {
    this._filters.push({ column, op: 'in', value: values.join(',') });
    return this;
  }

  gt(column: string, value: string | number) {
    this._filters.push({ column, op: 'gt', value: String(value) });
    return this;
  }

  lt(column: string, value: string | number) {
    this._filters.push({ column, op: 'lt', value: String(value) });
    return this;
  }

  gte(column: string, value: string | number) {
    this._filters.push({ column, op: 'gte', value: String(value) });
    return this;
  }

  lte(column: string, value: string | number) {
    this._filters.push({ column, op: 'lte', value: String(value) });
    return this;
  }

  like(column: string, pattern: string) {
    this._filters.push({ column, op: 'like', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string) {
    this._filters.push({ column, op: 'ilike', value: pattern });
    return this;
  }

  is(column: string, value: null | boolean) {
    this._filters.push({ column, op: 'is', value: String(value) });
    return this;
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
    this._orderBy = column;
    this._orderAsc = ascending;
    return this;
  }

  limit(count: number) {
    this._limit = count;
    return this;
  }

  range(from: number, to: number) {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }

  private buildUrl(): string {
    const params = new URLSearchParams();
    if (this._select !== '*') params.set('select', this._select);
    params.set('limit', String(this._limit));
    if (this._offset) params.set('offset', String(this._offset));
    if (this._orderBy) {
      params.set('order_by', this._orderBy);
      params.set('order_dir', this._orderAsc ? 'asc' : 'desc');
    }
    for (const f of this._filters) {
      params.set(`filter_${f.column}`, `${f.op}.${f.value}`);
    }
    return `${API_BASE}/${this._table}?${params.toString()}`;
  }

  async then(resolve: (value: QueryResult<T>) => void): Promise<void> {
    const result = await this._execute();
    resolve(result);
  }

  private async _execute(): Promise<QueryResult<T>> {
    try {
      const response = await fetch(this.buildUrl());
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        return { data: null, error: { message: err.detail || 'Query failed' } };
      }
      const data = await response.json() as T[];
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
  }

  async maybeSingle(): Promise<SingleResult<T>> {
    this._limit = 1;
    const result = await this._execute();
    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.[0] || null, error: null };
  }

  async single(): Promise<SingleResult<T>> {
    return this.maybeSingle();
  }
}

// ──────────────────────────────────────────────
// Auth Module (Databricks Workspace SSO)
// ──────────────────────────────────────────────

type AuthChangeCallback = (event: string, session: unknown) => void;

const authModule = {
  _user: null as UserProfile | null,
  _listeners: [] as AuthChangeCallback[],

  async getSession() {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const session = await response.json();
        this._user = session.user;
        return { data: { session }, error: null };
      }
      return { data: { session: null }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async getUser() {
    if (this._user) return { data: { user: this._user }, error: null };
    const { data } = await this.getSession();
    return { data: { user: data?.session?.user || null }, error: null };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        const data = await response.json();
        this._user = data.user;
        this._listeners.forEach(cb => cb('SIGNED_IN', data));
        return { data, error: null };
      }
      const err = await response.json();
      return { data: null, error: { message: err.detail || 'Login failed' } };
    } catch (err) {
      return { data: null, error: { message: 'Network error' } };
    }
  },

  async signUp({ email, password }: { email: string; password: string }) {
    return this.signInWithPassword({ email, password });
  },

  async signOut() {
    this._user = null;
    this._listeners.forEach(cb => cb('SIGNED_OUT', null));
    return { error: null };
  },

  onAuthStateChange(callback: AuthChangeCallback) {
    this._listeners.push(callback);
    this.getSession().then(({ data }) => {
      if (data?.session) callback('INITIAL_SESSION', data.session);
    });
    return {
      data: { subscription: { unsubscribe: () => {
        this._listeners = this._listeners.filter(cb => cb !== callback);
      }}}
    };
  },

  async update(params: Record<string, unknown>) {
    return { data: { user: this._user }, error: null };
  }
};

// ──────────────────────────────────────────────
// Main Client (Databricks Data Client)
// ──────────────────────────────────────────────

class DatabricksDataClient {
  auth = authModule;

  from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table);
  }

  rpc(functionName: string, params?: Record<string, unknown>) {
    return {
      async then(resolve: (value: { data: unknown; error: unknown }) => void) {
        try {
          const response = await fetch(`${API_BASE}/rpc/${functionName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params || {}),
          });
          const data = await response.json();
          resolve({ data, error: null });
        } catch (err) {
          resolve({ data: null, error: err });
        }
      }
    };
  }
}

export const supabase = new DatabricksDataClient();
export default supabase;
