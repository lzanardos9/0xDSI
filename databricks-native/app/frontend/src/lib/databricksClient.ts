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

  // Phase 1: Entity Spine & Knowledge Store
  async getEntitySpineStats() {
    const response = await fetch(`${API_BASE}/entity-spine/stats`);
    return response.json();
  }

  async resolveEntity(identifier: string) {
    const response = await fetch(`${API_BASE}/entity-spine/resolve/${encodeURIComponent(identifier)}`);
    return response.json();
  }

  async getKnowledgeStoreStats() {
    const response = await fetch(`${API_BASE}/knowledge-store/stats`);
    return response.json();
  }

  // Phase 1+3: UEO & Fuse Engine
  async getRecentUEOs(limit = 20) {
    const response = await fetch(`${API_BASE}/ueo/recent?limit=${limit}`);
    return response.json();
  }

  async getFuseResults(limit = 20) {
    const response = await fetch(`${API_BASE}/fuse-engine/results?limit=${limit}`);
    return response.json();
  }

  async getFuseDisagreements(limit = 20) {
    const response = await fetch(`${API_BASE}/fuse-engine/disagreements?limit=${limit}`);
    return response.json();
  }

  // Phase 2: Entity Drift & Bytecode
  async getEntityDriftScores(limit = 20) {
    const response = await fetch(`${API_BASE}/entity-drift/scores?limit=${limit}`);
    return response.json();
  }

  async getBytecodeAnalysis(limit = 20) {
    const response = await fetch(`${API_BASE}/bytecode/recent-analysis?limit=${limit}`);
    return response.json();
  }

  // Phase 4: MUSE Learning
  async getMuseProposals(status = 'pending', limit = 30) {
    const response = await fetch(`${API_BASE}/muse/proposals?status=${status}&limit=${limit}`);
    return response.json();
  }

  async getMuseMetrics() {
    const response = await fetch(`${API_BASE}/muse/metrics`);
    return response.json();
  }

  // Phase 4: GUARDIAN Compliance
  async getCompliancePosture() {
    const response = await fetch(`${API_BASE}/compliance/posture`);
    return response.json();
  }

  // Phase 4: Edge Collectors
  async getEdgeCollectorFleet() {
    const response = await fetch(`${API_BASE}/edge-collectors/fleet`);
    return response.json();
  }

  async getCollectorHeartbeats(collectorId: string, limit = 50) {
    const response = await fetch(`${API_BASE}/edge-collectors/${encodeURIComponent(collectorId)}/heartbeats?limit=${limit}`);
    return response.json();
  }

  // Phase 4: Typed Bronze
  async getTypedBronzeMetrics() {
    const response = await fetch(`${API_BASE}/typed-bronze/metrics`);
    return response.json();
  }

  // Full Pipeline Overview (all phases)
  async getPipelineOverview() {
    const response = await fetch(`${API_BASE}/pipeline/overview`);
    return response.json();
  }

  // ══════════════════════════════════════════════
  // CONTROL PLANE: Write Operations
  // ══════════════════════════════════════════════

  // Jobs: List & Trigger
  async listJobs() {
    const response = await fetch(`${API_BASE}/control/jobs`);
    return response.json();
  }

  async triggerJob(jobName: string, params: Record<string, string> = {}) {
    const response = await fetch(`${API_BASE}/control/jobs/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_name: jobName, params }),
    });
    return response.json();
  }

  // Agent Config
  async toggleAgent(agentId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/agents/${agentId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  async updateAgentConfig(agentId: string, config: Record<string, string>, schedule?: string) {
    const response = await fetch(`${API_BASE}/control/agents/${agentId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, schedule }),
    });
    return response.json();
  }

  async triggerAgentRun(agentId: string, params: Record<string, string> = {}) {
    const response = await fetch(`${API_BASE}/control/agents/${agentId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    });
    return response.json();
  }

  // Correlation Rules
  async createCorrelationRule(rule: {
    name: string;
    description?: string;
    rule_type?: string;
    severity?: string;
    conditions?: unknown[];
    window_seconds?: number;
    threshold?: number;
    mitre_tactic?: string;
    mitre_technique?: string;
    confidence_score?: number;
  }) {
    const response = await fetch(`${API_BASE}/control/correlation-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    return response.json();
  }

  async toggleCorrelationRule(ruleId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/correlation-rules/${ruleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  async updateCorrelationRule(ruleId: string, updates: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}/control/correlation-rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return response.json();
  }

  async deleteCorrelationRule(ruleId: string) {
    const response = await fetch(`${API_BASE}/control/correlation-rules/${ruleId}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  // Detection Rules
  async updateDetectionRule(ruleId: string, updates: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}/control/detection-rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return response.json();
  }

  // Alerts
  async updateAlertStatus(alertId: string, status: string) {
    const response = await fetch(`${API_BASE}/control/alerts/${alertId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return response.json();
  }

  // Cases
  async createCase(caseData: { title: string; description?: string; severity?: string; priority?: string; assigned_to?: string }) {
    const response = await fetch(`${API_BASE}/control/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caseData),
    });
    return response.json();
  }

  async updateCaseStatus(caseId: string, status: string) {
    const response = await fetch(`${API_BASE}/control/cases/${caseId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return response.json();
  }

  async assignCase(caseId: string, assignedTo: string) {
    const response = await fetch(`${API_BASE}/control/cases/${caseId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
    return response.json();
  }

  // Response Actions
  async approveResponseAction(actionId: string) {
    const response = await fetch(`${API_BASE}/control/response-actions/${actionId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  async rejectResponseAction(actionId: string, reason: string) {
    const response = await fetch(`${API_BASE}/control/response-actions/${actionId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  }

  async rollbackResponseAction(actionId: string) {
    const response = await fetch(`${API_BASE}/control/response-actions/${actionId}/rollback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  // Threat Feeds
  async toggleThreatFeed(feedId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/threat-feeds/${feedId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  async syncThreatFeed(feedId: string) {
    const response = await fetch(`${API_BASE}/control/threat-feeds/${feedId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  // System Settings
  async getSystemSettings(category?: string) {
    const url = category ? `${API_BASE}/control/settings?category=${category}` : `${API_BASE}/control/settings`;
    const response = await fetch(url);
    return response.json();
  }

  async updateSystemSettings(settings: Record<string, string>, category = 'general') {
    const response = await fetch(`${API_BASE}/control/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, category }),
    });
    return response.json();
  }

  // Guardrails
  async toggleGuardrail(policyId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/guardrails/${policyId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  async updateGuardrail(policyId: string, updates: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}/control/guardrails/${policyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return response.json();
  }

  // Edge Collectors
  async registerEdgeCollector(collector: {
    collector_id: string;
    collector_name?: string;
    collector_type?: string;
    site_name?: string;
    region?: string;
    transport_protocol?: string;
    max_eps?: number;
  }) {
    const response = await fetch(`${API_BASE}/control/edge-collectors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collector),
    });
    return response.json();
  }

  async decommissionEdgeCollector(collectorId: string) {
    const response = await fetch(`${API_BASE}/control/edge-collectors/${collectorId}/decommission`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  async pushEdgeCollectorConfig(collectorId: string, config: {
    sampling_rate?: number;
    batch_size?: number;
    max_eps?: number;
    compression?: string;
    filter_rules?: string;
  }) {
    const response = await fetch(`${API_BASE}/control/edge-collectors/${collectorId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return response.json();
  }

  // MUSE Proposals
  async approveMuseProposal(proposalId: string) {
    const response = await fetch(`${API_BASE}/control/muse/proposals/${proposalId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  async rejectMuseProposal(proposalId: string, reason: string) {
    const response = await fetch(`${API_BASE}/control/muse/proposals/${proposalId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  }

  async approveWeightProposal(proposalId: string) {
    const response = await fetch(`${API_BASE}/control/muse/weights/${proposalId}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  // Compliance
  async resolveComplianceViolation(violationId: string, resolution: string) {
    const response = await fetch(`${API_BASE}/control/compliance/violations/${violationId}/resolve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    });
    return response.json();
  }

  // Workflows
  async toggleWorkflow(workflowId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/workflows/${workflowId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  // Active Lists
  async createActiveList(list: { name: string; list_type?: string; category?: string; description?: string }) {
    const response = await fetch(`${API_BASE}/control/active-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list),
    });
    return response.json();
  }

  async deleteActiveList(listId: string) {
    const response = await fetch(`${API_BASE}/control/active-lists/${listId}`, {
      method: 'DELETE',
    });
    return response.json();
  }

  // Honeypots
  async toggleHoneypot(honeypotId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/honeypots/${honeypotId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  // ETL Configs
  async toggleETLConfig(configId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/etl-configs/${configId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  // IOCs
  async deactivateIOC(iocId: string) {
    const response = await fetch(`${API_BASE}/control/iocs/${iocId}/deactivate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.json();
  }

  // CEP Patterns
  async toggleCEPPattern(patternId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/cep-patterns/${patternId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  // Negative Correlation Rules
  async toggleNegativeRule(ruleId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/negative-rules/${ruleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }

  // Escalation Rules
  async toggleEscalationRule(ruleId: string, enabled: boolean) {
    const response = await fetch(`${API_BASE}/control/escalation-rules/${ruleId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  }
}

export const db = new DatabricksClient();
export default db;
