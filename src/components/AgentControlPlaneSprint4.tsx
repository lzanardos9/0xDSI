import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, GitBranch, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AgentForensicsTab() {
  const [traces, setTraces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<any | null>(null);

  useEffect(() => {
    fetchTraces();
  }, []);

  const fetchTraces = async () => {
    const { data } = await supabase.from('agent_forensics').select('*, agent_identities(display_name, agent_slug)').order('start_time', { ascending: false }).limit(50);
    if (data) setTraces(data);
    setLoading(false);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-emerald-400 bg-emerald-500/10';
    if (confidence >= 0.7) return 'text-blue-400 bg-blue-500/10';
    if (confidence >= 0.5) return 'text-amber-400 bg-amber-500/10';
    return 'text-red-400 bg-red-500/10';
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading forensics...</div>;

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-[10px] text-slate-500 mb-2">{traces.length} trace records</div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {traces.map(trace => (
            <div
              key={trace.id}
              onClick={() => setSelectedTrace(trace)}
              className={`p-2.5 rounded border cursor-pointer transition-all ${selectedTrace?.id === trace.id ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">{trace.agent_identities?.display_name || trace.agent_id?.slice(0, 8)}</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{trace.span_name}</span>
                  {trace.error && <XCircle className="w-3 h-3 text-red-400" />}
                </div>
                <span className="text-[10px] text-slate-500">{trace.start_time ? new Date(trace.start_time).toLocaleString() : ''}</span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">{trace.output_summary || trace.input_summary || 'No summary'}</p>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                <span>{trace.duration_ms}ms</span>
                <span>{trace.model_used}</span>
                {trace.confidence_at_decision && <span className={`px-1 rounded ${getConfidenceColor(trace.confidence_at_decision)}`}>{(trace.confidence_at_decision * 100).toFixed(0)}%</span>}
              </div>
            </div>
          ))}
          {traces.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No forensic traces recorded</div>}
        </div>
      </div>
      {selectedTrace && (
        <div className="w-80 bg-slate-800/30 border border-slate-700/30 rounded p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-100 mb-2">Trace Detail</h3>
          <div className="space-y-2 text-xs mb-4">
            <div className="flex justify-between"><span className="text-slate-500">Agent</span><span className="text-slate-300">{selectedTrace.agent_identities?.display_name || selectedTrace.agent_id?.slice(0, 8)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Span</span><span className="text-slate-300">{selectedTrace.span_name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Model</span><span className="text-slate-300">{selectedTrace.model_used || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="text-slate-300">{selectedTrace.duration_ms}ms</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tokens In</span><span className="text-slate-300">{selectedTrace.input_tokens || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Tokens Out</span><span className="text-slate-300">{selectedTrace.output_tokens || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Confidence</span><span className="text-slate-300">{selectedTrace.confidence_at_decision ? `${(selectedTrace.confidence_at_decision * 100).toFixed(0)}%` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Trace ID</span><span className="text-slate-300 font-mono text-[10px]">{selectedTrace.trace_id?.slice(0, 12) || '—'}</span></div>
          </div>
          {selectedTrace.input_summary && (
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Input</div>
              <p className="text-xs text-slate-300">{selectedTrace.input_summary}</p>
            </div>
          )}
          {selectedTrace.output_summary && (
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Output</div>
              <p className="text-xs text-slate-300">{selectedTrace.output_summary}</p>
            </div>
          )}
          {selectedTrace.error && (
            <div className="mb-3">
              <div className="text-[10px] text-red-400 uppercase mb-1">Error</div>
              <p className="text-xs text-red-300">{selectedTrace.error}</p>
            </div>
          )}
          {selectedTrace.reasoning_steps && (
            <div className="mb-3">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Reasoning Steps</div>
              <pre className="text-[10px] text-slate-400 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-32">{JSON.stringify(selectedTrace.reasoning_steps, null, 2)}</pre>
            </div>
          )}
          {selectedTrace.tool_calls && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">Tool Calls</div>
              <pre className="text-[10px] text-slate-400 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-32">{JSON.stringify(selectedTrace.tool_calls, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentFleetOrchTab() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    const { data } = await supabase.from('agent_fleet_workflows').select('*').order('created_at', { ascending: false });
    if (data) setWorkflows(data);
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'running': return 'text-blue-400 bg-blue-500/10';
      case 'failed': return 'text-red-400 bg-red-500/10';
      case 'pending': return 'text-amber-400 bg-amber-500/10';
      case 'paused': return 'text-orange-400 bg-orange-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading fleet workflows...</div>;

  return (
    <div className="space-y-3 overflow-y-auto h-full pr-1">
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Workflows</div>
          <div className="text-lg font-bold text-slate-100">{workflows.length}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Running</div>
          <div className="text-lg font-bold text-blue-400">{workflows.filter(w => w.status === 'running').length}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Completed</div>
          <div className="text-lg font-bold text-emerald-400">{workflows.filter(w => w.status === 'completed').length}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Duration</div>
          <div className="text-lg font-bold text-cyan-400">{workflows.length ? (workflows.reduce((s, w) => s + (Number(w.avg_duration_minutes) || 0), 0) / workflows.length).toFixed(1) : '0'}m</div>
        </div>
      </div>
      <div className="space-y-2">
        {workflows.map(wf => (
          <div key={wf.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-slate-200">{wf.workflow_name}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{wf.workflow_type}</span>
                {wf.priority && <span className={`px-1.5 py-0.5 text-[10px] rounded ${wf.priority === 'critical' ? 'bg-red-500/20 text-red-300' : wf.priority === 'high' ? 'bg-orange-500/20 text-orange-300' : 'bg-slate-700/50 text-slate-400'}`}>{wf.priority}</span>}
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${getStatusColor(wf.status)}`}>{wf.status}</span>
            </div>
            {wf.description && <p className="text-[11px] text-slate-400 mb-2">{wf.description}</p>}
            <div className="mb-2">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Progress</span>
                <span>{wf.progress_percent || 0}%</span>
              </div>
              <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${wf.progress_percent || 0}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span>Agents: <span className="text-slate-300">{wf.agents_involved?.length || 0}</span></span>
              <span>Executions: <span className="text-slate-300">{wf.total_executions || 0}</span></span>
              <span>Success: <span className="text-emerald-400">{wf.success_rate ? `${Number(wf.success_rate).toFixed(0)}%` : 'N/A'}</span></span>
              <span>Created: <span className="text-slate-300">{wf.created_at ? new Date(wf.created_at).toLocaleDateString() : '—'}</span></span>
            </div>
          </div>
        ))}
        {workflows.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No fleet workflows configured</div>}
      </div>
    </div>
  );
}

export function AgentDriftTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');

  useEffect(() => {
    fetchDriftEvents();
  }, []);

  const fetchDriftEvents = async () => {
    const { data } = await supabase.from('agent_drift_events').select('*, agent_identities(display_name, agent_slug)').order('created_at', { ascending: false });
    if (data) setEvents(data);
    setLoading(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/10';
      case 'high': return 'text-orange-400 bg-orange-500/10';
      case 'medium': return 'text-amber-400 bg-amber-500/10';
      case 'low': return 'text-blue-400 bg-blue-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  const filtered = severityFilter === 'all' ? events : events.filter(e => e.severity === severityFilter);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading drift events...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-3">
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-300 focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>Total: <span className="text-slate-300">{events.length}</span></span>
          <span className="text-red-400">Critical: {events.filter(e => e.severity === 'critical').length}</span>
          <span className="text-orange-400">High: {events.filter(e => e.severity === 'high').length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.map(event => (
          <div key={event.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-slate-200">{event.agent_identities?.display_name || event.agent_id?.slice(0, 8)}</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${getSeverityColor(event.severity)}`}>{event.severity}</span>
              </div>
              <span className="text-[10px] text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">{event.drift_type}: {event.description || 'Behavioral drift detected'}</p>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span>Metric: <span className="text-slate-300">{event.metric_name || '—'}</span></span>
              <span>Baseline: <span className="text-slate-300">{event.baseline_value ?? '—'}</span></span>
              <span>Current: <span className="text-slate-300">{event.current_value ?? '—'}</span></span>
              <span>Deviation: <span className={Number(event.deviation_percent) > 30 ? 'text-red-400' : 'text-amber-400'}>{event.deviation_percent ? `${event.deviation_percent}%` : '—'}</span></span>
              <span>Status: <span className={event.resolved ? 'text-emerald-400' : 'text-amber-400'}>{event.resolved ? 'Resolved' : 'Open'}</span></span>
            </div>
            {event.root_cause_hypothesis && (
              <p className="text-[10px] text-slate-500 mt-1.5 italic">Hypothesis: {event.root_cause_hypothesis}</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No drift events detected</div>}
      </div>
    </div>
  );
}

export function AgentSLATab() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    const { data } = await supabase.from('agent_sla_contracts').select('*, agent_identities(display_name, agent_slug)').order('created_at', { ascending: false });
    if (data) setContracts(data);
    setLoading(false);
  };

  const getComplianceColor = (pct: number) => {
    if (pct >= 99) return 'text-emerald-400';
    if (pct >= 95) return 'text-amber-400';
    return 'text-red-400';
  };

  const getComplianceBg = (pct: number) => {
    if (pct >= 99) return 'bg-emerald-500';
    if (pct >= 95) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading SLA contracts...</div>;

  return (
    <div className="space-y-3 overflow-y-auto h-full pr-1">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Active Contracts</div>
          <div className="text-lg font-bold text-slate-100">{contracts.length}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Compliance</div>
          <div className={`text-lg font-bold ${getComplianceColor(contracts.length ? contracts.reduce((s, c) => s + (Number(c.compliance_percent) || 0), 0) / contracts.length : 0)}`}>
            {contracts.length ? (contracts.reduce((s, c) => s + (Number(c.compliance_percent) || 0), 0) / contracts.length).toFixed(1) : '0'}%
          </div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/30 rounded p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Violations</div>
          <div className="text-lg font-bold text-red-400">{contracts.reduce((s, c) => s + (c.violation_count || 0), 0)}</div>
        </div>
      </div>
      <div className="space-y-2">
        {contracts.map(contract => (
          <div key={contract.id} className="bg-slate-800/30 border border-slate-700/30 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-slate-200">{contract.agent_identities?.display_name || contract.agent_id?.slice(0, 8)}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400">{contract.metric_type || 'uptime'}</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded ${contract.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-300' : contract.status === 'warning' ? 'bg-amber-500/20 text-amber-300' : contract.status === 'breached' ? 'bg-red-500/20 text-red-300' : 'bg-slate-700/50 text-slate-400'}`}>{contract.status}</span>
              </div>
              <span className={`text-xs font-bold ${getComplianceColor(Number(contract.compliance_percent) || 0)}`}>
                {Number(contract.compliance_percent || 0).toFixed(1)}%
              </span>
            </div>
            <div className="mb-2">
              <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${getComplianceBg(Number(contract.compliance_percent) || 0)}`} style={{ width: `${Math.min(Number(contract.compliance_percent) || 0, 100)}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 text-[10px]">
              <div>
                <span className="text-slate-500">SLA</span>
                <div className="text-slate-200">{contract.sla_name}</div>
              </div>
              <div>
                <span className="text-slate-500">Target</span>
                <div className="text-slate-200">{Number(contract.target_value) || '—'}</div>
              </div>
              <div>
                <span className="text-slate-500">Current</span>
                <div className="text-slate-200">{Number(contract.current_value) || '—'}</div>
              </div>
              <div>
                <span className="text-slate-500">Violations</span>
                <div className={contract.violation_count > 0 ? 'text-red-400' : 'text-emerald-400'}>{contract.violation_count || 0}</div>
              </div>
              <div>
                <span className="text-slate-500">Window</span>
                <div className="text-slate-200">{contract.measurement_window || '24h'}</div>
              </div>
            </div>
          </div>
        ))}
        {contracts.length === 0 && <div className="text-center text-slate-500 text-xs py-8">No SLA contracts configured</div>}
      </div>
    </div>
  );
}
