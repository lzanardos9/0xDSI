import { useState, useEffect, useRef } from 'react';
import { Shield, Activity, Brain, Cpu, TrendingUp, AlertTriangle, CheckCircle, XCircle, Play, Pause, RotateCcw, Search, Send, ChevronRight, Zap, DollarSign, Clock, BarChart3, Eye, Lock, Unlock, ArrowUpRight, ArrowDownRight, Terminal, MessageSquare, Bot, Fingerprint, ShieldCheck, Users, Layers, RefreshCw, Network, GitBranch, ShieldAlert, Workflow, Store, Gauge, FileCheck, GraduationCap, Microscope, Radio, TrendingDown, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AgentMarketplaceTab, AgentAutonomySimTab, AgentComplianceTab, AgentLearningTab } from './AgentControlPlaneSprint3';
import { AgentForensicsTab, AgentFleetOrchTab, AgentDriftTab, AgentSLATab } from './AgentControlPlaneSprint4';

interface AgentIdentity {
  id: string;
  agent_slug: string;
  display_name: string;
  description: string;
  agent_type: string;
  category: string;
  lifecycle_state: string;
  health_status: string;
  trust_score: number;
  uptime_percent: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  tasks_completed_total: number;
  tasks_failed_total: number;
  cost_per_execution: number;
  total_cost_mtd: number;
  alerts_processed_mtd: number;
  time_saved_hours_mtd: number;
  estimated_value_mtd: number;
  version: string;
  runtime: string;
  max_autonomy_level: number;
  tags: string[];
  last_heartbeat_at: string;
  false_positive_rate: number;
  true_positive_rate: number;
  avg_confidence: number;
  analyst_satisfaction_score: number;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  agents_invoked?: string[];
  timestamp: Date;
}

type TabType = 'registry' | 'lifecycle' | 'commander' | 'economics' | 'trust' | 'permissions' | 'collaboration' | 'threatsurface' | 'marketplace' | 'autonomy' | 'compliance' | 'learning' | 'forensics' | 'fleet' | 'drift' | 'sla';

export default function AgentControlPlane() {
  const [activeTab, setActiveTab] = useState<TabType>('registry');
  const [agents, setAgents] = useState<AgentIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<AgentIdentity | null>(null);
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [commandProcessing, setCommandProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations]);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_identities')
        .select('*')
        .order('trust_score', { ascending: false });
      if (!error && data) setAgents(data);
    } catch (e) { /* fallback handled by empty state */ }
    setLoading(false);
  };

  const filteredAgents = agents.filter(a => {
    const matchesSearch = searchFilter === '' ||
      a.display_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      a.agent_slug.toLowerCase().includes(searchFilter.toLowerCase()) ||
      a.tags?.some(t => t.includes(searchFilter.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || a.category === categoryFilter;
    const matchesState = stateFilter === 'all' || a.lifecycle_state === stateFilter;
    return matchesSearch && matchesCategory && matchesState;
  });

  const totalCostMTD = agents.reduce((s, a) => s + (a.total_cost_mtd || 0), 0);
  const totalValueMTD = agents.reduce((s, a) => s + (a.estimated_value_mtd || 0), 0);
  const totalTimeSaved = agents.reduce((s, a) => s + (a.time_saved_hours_mtd || 0), 0);
  const totalAlerts = agents.reduce((s, a) => s + (a.alerts_processed_mtd || 0), 0);
  const avgTrust = agents.length ? agents.reduce((s, a) => s + a.trust_score, 0) / agents.length : 0;
  const healthyCount = agents.filter(a => a.health_status === 'healthy').length;

  const handleCommand = async () => {
    if (!commandInput.trim()) return;
    const userMsg: ConversationMessage = { role: 'user', content: commandInput, timestamp: new Date() };
    setConversations(prev => [...prev, userMsg]);
    setCommandInput('');
    setCommandProcessing(true);

    setTimeout(() => {
      const response = processCommand(commandInput);
      setConversations(prev => [...prev, { role: 'assistant', content: response.content, agents_invoked: response.agents, timestamp: new Date() }]);
      setCommandProcessing(false);
    }, 800 + Math.random() * 1200);
  };

  const processCommand = (cmd: string): { content: string; agents: string[] } => {
    const lower = cmd.toLowerCase();
    if (lower.includes('critical') || lower.includes('threat') || lower.includes('alert')) {
      return {
        content: `**Threat Assessment Complete**\n\nI've queried the Triage Agent, AI Correlation Engine, and Threat Hunter across all active telemetry.\n\n**Current Critical Threats:**\n- 3 active APT campaigns targeting financial endpoints (APT29, Lazarus, FIN7)\n- 1 ongoing brute-force attack against VPN gateway (185.220.101.x)\n- 2 lateral movement patterns detected in VLAN-42\n\n**Agent Actions Taken:**\n- Vanguard Response: Blocked 47 IPs in last hour\n- Triage Agent: Classified 1,247 alerts (94.2% auto-resolved)\n- Threat Hunter: Identified 3 new IOCs from traffic analysis\n\n**Recommended Actions:**\n1. Escalate APT29 indicators to SOC L3\n2. Enable enhanced monitoring on VLAN-42\n3. Update firewall rules for VPN gateway`,
        agents: ['triage', 'ai_correlation', 'threat_hunter', 'vanguard']
      };
    }
    if (lower.includes('status') || lower.includes('health') || lower.includes('how are')) {
      return {
        content: `**Fleet Status Report**\n\n**${healthyCount}/${agents.length} agents healthy** | Avg Trust Score: ${avgTrust.toFixed(1)}%\n\n**Top Performers (Last 24h):**\n- Real-Time CEP: 1.2M events processed, 4ms avg latency\n- Orchestrator: 892K tasks coordinated, 99.99% uptime\n- Triage Agent: 52.4K alerts classified, 96.7% accuracy\n\n**Needs Attention:**\n- Autonomous Response Learner: degraded (training pipeline stalled)\n- CISO Assistant: elevated latency (model warm-up after update)\n\n**Economics:** $${totalCostMTD.toFixed(0)} spent / $${(totalValueMTD/1000).toFixed(0)}K value delivered = **${(totalValueMTD/totalCostMTD).toFixed(0)}x ROI**`,
        agents: ['orchestrator', 'realtime_cep']
      };
    }
    if (lower.includes('investigate') || lower.includes('look into') || lower.includes('what happened')) {
      return {
        content: `**Investigation Initiated**\n\nI've dispatched a multi-agent investigation team:\n\n1. **NOVA** - Scanning network topology for anomalous connections\n2. **Forensics Agent** - Collecting endpoint artifacts from affected hosts\n3. **CTI Attribution** - Cross-referencing IOCs with threat intelligence feeds\n4. **Vector Memory** - Searching historical incidents for similar patterns\n\n**Preliminary Findings (12s elapsed):**\n- Entity correlation identified 3 compromised accounts sharing behavioral patterns\n- Network graph shows lateral movement from DMZ to internal segment\n- Similarity score: 87% match with previous APT29 campaign (Case #2024-0847)\n\nFull investigation report will be ready in ~45 seconds. Shall I auto-create a case?`,
        agents: ['nova', 'forensics', 'cti_attribution', 'vector_memory']
      };
    }
    if (lower.includes('roi') || lower.includes('cost') || lower.includes('value') || lower.includes('economics')) {
      return {
        content: `**Agent Fleet Economics - MTD**\n\n| Metric | Value |\n|--------|-------|\n| Total Compute Cost | $${totalCostMTD.toFixed(2)} |\n| Estimated Value Delivered | $${(totalValueMTD/1000).toFixed(0)}K |\n| Time Saved | ${totalTimeSaved.toFixed(0)} analyst-hours |\n| Alerts Auto-Processed | ${(totalAlerts/1000).toFixed(0)}K |\n| ROI Multiple | **${(totalValueMTD/totalCostMTD).toFixed(0)}x** |\n\n**Cost Per Alert:** $${(totalCostMTD/totalAlerts).toFixed(4)}\n**Cost Per Analyst-Hour Saved:** $${(totalCostMTD/totalTimeSaved).toFixed(2)}\n\n**Top Value Generators:**\n1. Real-Time CEP: $3.2M value ($373 cost)\n2. SOC Orchestrator: $2.1M value ($713 cost)\n3. Threat Hunter: $1.25M value ($813 cost)`,
        agents: ['orchestrator']
      };
    }
    return {
      content: `I understand your request. Let me route this to the appropriate agents.\n\n**Processing:** "${cmd}"\n\nI've analyzed the query against our 60-agent fleet. Here's what I can do:\n\n- **Ask about threats**: "What are the most critical threats right now?"\n- **Check status**: "How are my agents doing?"\n- **Investigate**: "Investigate suspicious activity on server X"\n- **Economics**: "What's our agent ROI this month?"\n- **Hunt**: "Hunt for indicators of lateral movement"\n- **Deploy**: "Deploy additional monitoring on segment Y"\n\nWould you like me to proceed with any of these actions?`,
      agents: ['orchestrator']
    };
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'registry', label: 'Agent Registry', icon: Fingerprint },
    { id: 'lifecycle', label: 'Lifecycle & Governance', icon: ShieldCheck },
    { id: 'trust', label: 'Trust Intelligence', icon: Shield },
    { id: 'permissions', label: 'Permission Gov.', icon: Lock },
    { id: 'collaboration', label: 'Collaboration', icon: Network },
    { id: 'threatsurface', label: 'Threat Surface', icon: ShieldAlert },
    { id: 'commander', label: 'SOC Commander', icon: Terminal },
    { id: 'economics', label: 'Economics', icon: DollarSign },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'autonomy', label: 'Autonomy Sim', icon: Gauge },
    { id: 'compliance', label: 'Compliance', icon: FileCheck },
    { id: 'learning', label: 'Learning', icon: GraduationCap },
    { id: 'forensics', label: 'Forensics', icon: Microscope },
    { id: 'fleet', label: 'Fleet Orch.', icon: Radio },
    { id: 'drift', label: 'Drift Detection', icon: TrendingDown },
    { id: 'sla', label: 'SLA Mgmt', icon: ClipboardCheck },
  ];

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-400';
      case 'degraded': return 'text-amber-400';
      case 'unhealthy': return 'text-red-400';
      case 'offline': return 'text-slate-500';
      default: return 'text-blue-400';
    }
  };

  const getHealthBg = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500/10 border-emerald-500/30';
      case 'degraded': return 'bg-amber-500/10 border-amber-500/30';
      case 'unhealthy': return 'bg-red-500/10 border-red-500/30';
      default: return 'bg-slate-500/10 border-slate-500/30';
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'active': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'approved': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'pending_review': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'quarantined': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'retired': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getTrustColor = (score: number) => {
    if (score >= 95) return 'text-emerald-400';
    if (score >= 90) return 'text-cyan-400';
    if (score >= 85) return 'text-blue-400';
    if (score >= 80) return 'text-amber-400';
    return 'text-red-400';
  };

  const categories = [...new Set(agents.map(a => a.category))];

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col">
      {/* Header Stats Bar */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">Total Agents</span>
          </div>
          <div className="text-xl font-bold text-slate-100">{agents.length}</div>
          <div className="text-xs text-emerald-400">{healthyCount} healthy</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400">Avg Trust</span>
          </div>
          <div className={`text-xl font-bold ${getTrustColor(avgTrust)}`}>{avgTrust.toFixed(1)}%</div>
          <div className="text-xs text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />+2.1 this week</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Alerts/MTD</span>
          </div>
          <div className="text-xl font-bold text-slate-100">{(totalAlerts/1000).toFixed(0)}K</div>
          <div className="text-xs text-slate-400">auto-processed</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Hours Saved</span>
          </div>
          <div className="text-xl font-bold text-slate-100">{(totalTimeSaved/1000).toFixed(1)}K</div>
          <div className="text-xs text-emerald-400">{(totalTimeSaved/160).toFixed(0)} FTE equivalent</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-400">Value Delivered</span>
          </div>
          <div className="text-xl font-bold text-emerald-400">${(totalValueMTD/1000000).toFixed(1)}M</div>
          <div className="text-xs text-slate-400">vs ${(totalCostMTD/1000).toFixed(1)}K cost</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400">ROI Multiple</span>
          </div>
          <div className="text-xl font-bold text-cyan-400">{totalCostMTD > 0 ? (totalValueMTD/totalCostMTD).toFixed(0) : '0'}x</div>
          <div className="text-xs text-emerald-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />+12% vs last month</div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-4 bg-slate-800/30 p-1 rounded-lg border border-slate-700/30">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'registry' && (
          <AgentRegistryTab
            agents={filteredAgents}
            loading={loading}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            categories={categories}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
            getHealthColor={getHealthColor}
            getHealthBg={getHealthBg}
            getStateColor={getStateColor}
            getTrustColor={getTrustColor}
          />
        )}
        {activeTab === 'lifecycle' && (
          <AgentLifecycleTab agents={agents} getStateColor={getStateColor} getHealthColor={getHealthColor} />
        )}
        {activeTab === 'commander' && (
          <SOCCommanderTab
            conversations={conversations}
            commandInput={commandInput}
            setCommandInput={setCommandInput}
            handleCommand={handleCommand}
            commandProcessing={commandProcessing}
            chatEndRef={chatEndRef}
          />
        )}
        {activeTab === 'economics' && (
          <AgentEconomicsTab agents={agents} totalCostMTD={totalCostMTD} totalValueMTD={totalValueMTD} totalTimeSaved={totalTimeSaved} />
        )}
        {activeTab === 'trust' && (
          <AgentTrustTab agents={agents} getTrustColor={getTrustColor} />
        )}
        {activeTab === 'permissions' && (
          <AgentPermissionsTab agents={agents} />
        )}
        {activeTab === 'collaboration' && (
          <AgentCollaborationTab agents={agents} />
        )}
        {activeTab === 'threatsurface' && (
          <AgentThreatSurfaceTab agents={agents} />
        )}
        {activeTab === 'marketplace' && (
          <AgentMarketplaceTab />
        )}
        {activeTab === 'autonomy' && (
          <AgentAutonomySimTab />
        )}
        {activeTab === 'compliance' && (
          <AgentComplianceTab />
        )}
        {activeTab === 'learning' && (
          <AgentLearningTab />
        )}
        {activeTab === 'forensics' && (
          <AgentForensicsTab />
        )}
        {activeTab === 'fleet' && (
          <AgentFleetOrchTab />
        )}
        {activeTab === 'drift' && (
          <AgentDriftTab />
        )}
        {activeTab === 'sla' && (
          <AgentSLATab />
        )}
      </div>
    </div>
  );
}

function AgentRegistryTab({ agents, loading, searchFilter, setSearchFilter, categoryFilter, setCategoryFilter, stateFilter, setStateFilter, categories, selectedAgent, setSelectedAgent, getHealthColor, getHealthBg, getStateColor, getTrustColor }: any) {
  return (
    <div className="flex h-full gap-4">
      {/* Agent List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Filters */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search agents by name, slug, or tag..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c: string) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="all">All States</option>
            <option value="active">Active</option>
            <option value="degraded">Degraded</option>
            <option value="quarantined">Quarantined</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Agent</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Health</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">Trust</th>
                <th className="text-left py-2 px-3 text-slate-400 font-medium">State</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">Alerts/MTD</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">Uptime</th>
                <th className="text-right py-2 px-3 text-slate-400 font-medium">Latency</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent: AgentIdentity) => (
                <tr
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                    selectedAgent?.id === agent.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${agent.health_status === 'healthy' ? 'bg-emerald-400' : agent.health_status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'}`} />
                      <div>
                        <div className="text-slate-200 font-medium">{agent.display_name}</div>
                        <div className="text-xs text-slate-500">{agent.agent_type} / {agent.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs font-medium ${getHealthColor(agent.health_status)}`}>
                      {agent.health_status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${agent.trust_score >= 93 ? 'bg-emerald-400' : agent.trust_score >= 88 ? 'bg-cyan-400' : 'bg-amber-400'}`}
                          style={{ width: `${agent.trust_score}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono ${getTrustColor(agent.trust_score)}`}>{agent.trust_score}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getStateColor(agent.lifecycle_state)}`}>
                      {agent.lifecycle_state}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300 font-mono text-xs">
                    {agent.alerts_processed_mtd > 1000 ? `${(agent.alerts_processed_mtd/1000).toFixed(1)}K` : agent.alerts_processed_mtd}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300 font-mono text-xs">
                    {agent.uptime_percent}%
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300 font-mono text-xs">
                    {agent.avg_response_time_ms}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Detail Panel */}
      {selectedAgent && (
        <div className="w-80 bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">{selectedAgent.display_name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${getStateColor(selectedAgent.lifecycle_state)}`}>
              {selectedAgent.lifecycle_state}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">{selectedAgent.description}</p>

          <div className="space-y-3">
            <DetailRow label="Agent ID" value={selectedAgent.agent_slug} />
            <DetailRow label="Version" value={selectedAgent.version} />
            <DetailRow label="Runtime" value={selectedAgent.runtime} />
            <DetailRow label="Autonomy Level" value={`${selectedAgent.max_autonomy_level}/5`} />
            <DetailRow label="Trust Score" value={`${selectedAgent.trust_score}%`} color={getTrustColor(selectedAgent.trust_score)} />
            <DetailRow label="True Positive Rate" value={`${(selectedAgent.true_positive_rate * 100).toFixed(1)}%`} />
            <DetailRow label="False Positive Rate" value={`${(selectedAgent.false_positive_rate * 100).toFixed(1)}%`} />
            <DetailRow label="Avg Confidence" value={`${selectedAgent.avg_confidence}%`} />
            <DetailRow label="Analyst Satisfaction" value={`${selectedAgent.analyst_satisfaction_score}/5.0`} />

            <div className="border-t border-slate-700/50 pt-3 mt-3">
              <div className="text-xs text-slate-500 mb-2">Performance MTD</div>
              <DetailRow label="Cost" value={`$${selectedAgent.total_cost_mtd.toFixed(2)}`} />
              <DetailRow label="Value" value={`$${(selectedAgent.estimated_value_mtd/1000).toFixed(0)}K`} color="text-emerald-400" />
              <DetailRow label="ROI" value={`${(selectedAgent.estimated_value_mtd / Math.max(selectedAgent.total_cost_mtd, 1)).toFixed(0)}x`} color="text-cyan-400" />
              <DetailRow label="Time Saved" value={`${selectedAgent.time_saved_hours_mtd.toFixed(0)}h`} />
              <DetailRow label="Tasks Done" value={selectedAgent.tasks_completed_total.toLocaleString()} />
            </div>

            <div className="border-t border-slate-700/50 pt-3 mt-3">
              <div className="text-xs text-slate-500 mb-2">Tags</div>
              <div className="flex flex-wrap gap-1">
                {selectedAgent.tags?.map((tag: string) => (
                  <span key={tag} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-mono ${color || 'text-slate-300'}`}>{value}</span>
    </div>
  );
}

function AgentLifecycleTab({ agents, getStateColor, getHealthColor }: any) {
  const stateGroups = {
    active: agents.filter((a: AgentIdentity) => a.lifecycle_state === 'active'),
    degraded: agents.filter((a: AgentIdentity) => a.health_status === 'degraded'),
    pending_review: agents.filter((a: AgentIdentity) => a.lifecycle_state === 'pending_review'),
    quarantined: agents.filter((a: AgentIdentity) => a.lifecycle_state === 'quarantined'),
  };

  const lifecycleStages = [
    { id: 'draft', label: 'Draft', color: 'bg-slate-500', count: 0 },
    { id: 'pending_review', label: 'Pending Review', color: 'bg-amber-500', count: stateGroups.pending_review.length },
    { id: 'approved', label: 'Approved', color: 'bg-blue-500', count: 0 },
    { id: 'active', label: 'Active', color: 'bg-emerald-500', count: stateGroups.active.length },
    { id: 'degraded', label: 'Degraded', color: 'bg-amber-500', count: stateGroups.degraded.length },
    { id: 'quarantined', label: 'Quarantined', color: 'bg-red-500', count: stateGroups.quarantined.length },
    { id: 'retired', label: 'Retired', color: 'bg-slate-600', count: 0 },
  ];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Lifecycle Pipeline Visualization */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Agent Lifecycle Pipeline</h3>
        <div className="flex items-center gap-1">
          {lifecycleStages.map((stage, i) => (
            <div key={stage.id} className="flex items-center flex-1">
              <div className="flex-1 text-center">
                <div className={`w-8 h-8 rounded-full ${stage.color} mx-auto mb-1 flex items-center justify-center`}>
                  <span className="text-xs font-bold text-white">{stage.count}</span>
                </div>
                <div className="text-xs text-slate-400">{stage.label}</div>
              </div>
              {i < lifecycleStages.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Governance Rules */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Governance Policies</h3>
        <div className="grid grid-cols-2 gap-3">
          <GovernanceCard
            icon={<Lock className="w-4 h-4 text-amber-400" />}
            title="Approval Required"
            description="All new agents require security review before activation"
            active={true}
          />
          <GovernanceCard
            icon={<Eye className="w-4 h-4 text-cyan-400" />}
            title="Continuous Monitoring"
            description="Trust scores recalculated every 60 seconds from analyst feedback"
            active={true}
          />
          <GovernanceCard
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            title="Auto-Quarantine"
            description="Agents with trust < 70% are automatically quarantined"
            active={true}
          />
          <GovernanceCard
            icon={<RefreshCw className="w-4 h-4 text-emerald-400" />}
            title="Self-Healing"
            description="Degraded agents auto-restart with fallback configuration"
            active={true}
          />
          <GovernanceCard
            icon={<Users className="w-4 h-4 text-blue-400" />}
            title="Least Privilege"
            description="Permissions expire after 24h, require re-grant for sensitive ops"
            active={true}
          />
          <GovernanceCard
            icon={<Layers className="w-4 h-4 text-purple-400" />}
            title="Max Autonomy Cap"
            description="Level 5 agents limited to 3 concurrent autonomous actions"
            active={true}
          />
        </div>
      </div>

      {/* Agents Needing Attention */}
      {stateGroups.degraded.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Agents Requiring Attention
          </h3>
          <div className="space-y-2">
            {stateGroups.degraded.map((agent: AgentIdentity) => (
              <div key={agent.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                <div>
                  <div className="text-sm text-slate-200">{agent.display_name}</div>
                  <div className="text-xs text-slate-400">{agent.description?.slice(0, 60)}...</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 hover:bg-emerald-500/30">
                    Restart
                  </button>
                  <button className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded border border-red-500/30 hover:bg-red-500/30">
                    Quarantine
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GovernanceCard({ icon, title, description, active }: { icon: any; title: string; description: string; active: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${active ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-900/30 border-slate-800/30 opacity-50'}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-slate-200">{title}</span>
        {active && <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />}
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

function SOCCommanderTab({ conversations, commandInput, setCommandInput, handleCommand, commandProcessing, chatEndRef }: any) {
  const suggestions = [
    "What are the most critical threats right now?",
    "How are my agents performing today?",
    "Investigate lateral movement in VLAN-42",
    "What's our agent fleet ROI this month?",
    "Show me agents with degraded trust scores",
    "Hunt for C2 beaconing patterns",
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
              <Terminal className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">SOC Commander</h3>
            <p className="text-sm text-slate-400 max-w-md mb-6">
              Natural language interface to your entire agent fleet. Ask questions, trigger investigations,
              check status, and command autonomous responses across all 60 agents.
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-lg">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setCommandInput(s); }}
                  className="text-left text-xs bg-slate-800/50 border border-slate-700/50 rounded-lg p-2.5 text-slate-300 hover:bg-slate-700/50 hover:border-cyan-500/30 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {conversations.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${
              msg.role === 'user'
                ? 'bg-cyan-500/20 border border-cyan-500/30'
                : 'bg-slate-800/50 border border-slate-700/50'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-medium text-cyan-300">SOC Commander</span>
                  {msg.agents_invoked && msg.agents_invoked.length > 0 && (
                    <span className="text-xs text-slate-500">
                      via {msg.agents_invoked.join(', ')}
                    </span>
                  )}
                </div>
              )}
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{msg.content}</div>
              <div className="text-xs text-slate-500 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {commandProcessing && (
          <div className="flex justify-start">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-slate-400">Querying agent fleet...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-700/50 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={e => setCommandInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCommand()}
            placeholder="Ask your agent fleet anything... (e.g., 'What threats should I worry about?')"
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={handleCommand}
            disabled={commandProcessing || !commandInput.trim()}
            className="px-4 py-2.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentEconomicsTab({ agents, totalCostMTD, totalValueMTD, totalTimeSaved }: any) {
  const topValueAgents = [...agents]
    .sort((a: AgentIdentity, b: AgentIdentity) => b.estimated_value_mtd - a.estimated_value_mtd)
    .slice(0, 10);

  const topROIAgents = [...agents]
    .filter((a: AgentIdentity) => a.total_cost_mtd > 0)
    .sort((a: AgentIdentity, b: AgentIdentity) =>
      (b.estimated_value_mtd / b.total_cost_mtd) - (a.estimated_value_mtd / a.total_cost_mtd)
    )
    .slice(0, 10);

  const categoryEconomics = agents.reduce((acc: any, a: AgentIdentity) => {
    if (!acc[a.category]) acc[a.category] = { cost: 0, value: 0, hours: 0, count: 0 };
    acc[a.category].cost += a.total_cost_mtd || 0;
    acc[a.category].value += a.estimated_value_mtd || 0;
    acc[a.category].hours += a.time_saved_hours_mtd || 0;
    acc[a.category].count += 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <EconCard title="Cost per Alert" value={`$${(totalCostMTD / Math.max(agents.reduce((s: number, a: AgentIdentity) => s + a.alerts_processed_mtd, 0), 1)).toFixed(4)}`} subtitle="vs $4.50 industry avg" trend="down" />
        <EconCard title="Cost per Hour Saved" value={`$${(totalCostMTD / Math.max(totalTimeSaved, 1)).toFixed(2)}`} subtitle="vs $85/hr analyst cost" trend="down" />
        <EconCard title="Breach Prevention Value" value={`$${(totalValueMTD/1000000).toFixed(1)}M`} subtitle="estimated damages avoided" trend="up" />
        <EconCard title="FTE Equivalent" value={`${(totalTimeSaved/160).toFixed(0)} analysts`} subtitle="working 40hr weeks" trend="up" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top Value Generators */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Top Value Generators</h3>
          <div className="space-y-2">
            {topValueAgents.map((agent: AgentIdentity, i: number) => (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 truncate">{agent.display_name}</div>
                </div>
                <span className="text-xs font-mono text-emerald-400">${(agent.estimated_value_mtd/1000).toFixed(0)}K</span>
                <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${(agent.estimated_value_mtd / topValueAgents[0].estimated_value_mtd) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top ROI */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Highest ROI Agents</h3>
          <div className="space-y-2">
            {topROIAgents.map((agent: AgentIdentity, i: number) => {
              const roi = agent.estimated_value_mtd / Math.max(agent.total_cost_mtd, 1);
              return (
                <div key={agent.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{agent.display_name}</div>
                  </div>
                  <span className="text-xs font-mono text-cyan-400">{roi.toFixed(0)}x</span>
                  <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{ width: `${Math.min((roi / (topROIAgents[0].estimated_value_mtd / Math.max(topROIAgents[0].total_cost_mtd, 1))) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Economics by Category</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 text-slate-400 font-medium">Category</th>
              <th className="text-center py-2 text-slate-400 font-medium">Agents</th>
              <th className="text-right py-2 text-slate-400 font-medium">Cost</th>
              <th className="text-right py-2 text-slate-400 font-medium">Value</th>
              <th className="text-right py-2 text-slate-400 font-medium">Hours Saved</th>
              <th className="text-right py-2 text-slate-400 font-medium">ROI</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categoryEconomics).sort(([,a]: any, [,b]: any) => b.value - a.value).map(([cat, data]: any) => (
              <tr key={cat} className="border-b border-slate-800/30">
                <td className="py-2 text-slate-200 capitalize">{cat.replace('_', ' ')}</td>
                <td className="py-2 text-center text-slate-300">{data.count}</td>
                <td className="py-2 text-right font-mono text-slate-300">${data.cost.toFixed(0)}</td>
                <td className="py-2 text-right font-mono text-emerald-400">${(data.value/1000).toFixed(0)}K</td>
                <td className="py-2 text-right font-mono text-blue-300">{data.hours.toFixed(0)}h</td>
                <td className="py-2 text-right font-mono text-cyan-400">{(data.value / Math.max(data.cost, 1)).toFixed(0)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EconCard({ title, value, subtitle, trend }: { title: string; value: string; subtitle: string; trend: 'up' | 'down' }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-slate-100">{value}</span>
        {trend === 'up' ? (
          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
        ) : (
          <ArrowDownRight className="w-4 h-4 text-emerald-400" />
        )}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
    </div>
  );
}

// ============================================================================
// SPRINT 2: Advanced Governance & Intelligence Tabs
// ============================================================================

function AgentTrustTab({ agents, getTrustColor }: any) {
  const [trustHistory, setTrustHistory] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loadingTrust, setLoadingTrust] = useState(true);

  useEffect(() => {
    loadTrustData();
  }, []);

  const loadTrustData = async () => {
    const [historyRes, anomalyRes] = await Promise.all([
      supabase.from('agent_trust_history').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('agent_trust_history').select('*, agent_identities(display_name)').eq('anomaly_detected', true).order('created_at', { ascending: false }).limit(50),
    ]);
    if (historyRes.data) setTrustHistory(historyRes.data);
    if (anomalyRes.data) setAnomalies(anomalyRes.data);
    setLoadingTrust(false);
  };

  const trustDistribution = agents.reduce((acc: any, a: any) => {
    const bucket = a.trust_score >= 95 ? 'excellent' : a.trust_score >= 90 ? 'good' : a.trust_score >= 85 ? 'acceptable' : a.trust_score >= 75 ? 'concerning' : 'critical';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});

  const recentAnomalies = anomalies.slice(0, 8);
  const agentTrustTrends = selectedAgentId
    ? trustHistory.filter((h: any) => h.agent_id === selectedAgentId).slice(0, 30)
    : [];

  const avgDecayRate = trustHistory.length > 0
    ? trustHistory.reduce((s: number, h: any) => s + (h.decay_rate || 0), 0) / trustHistory.length
    : 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Trust Distribution */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { key: 'excellent', label: 'Excellent (95+)', color: 'emerald', count: trustDistribution.excellent || 0 },
          { key: 'good', label: 'Good (90-94)', color: 'cyan', count: trustDistribution.good || 0 },
          { key: 'acceptable', label: 'Acceptable (85-89)', color: 'blue', count: trustDistribution.acceptable || 0 },
          { key: 'concerning', label: 'Concerning (75-84)', color: 'amber', count: trustDistribution.concerning || 0 },
          { key: 'critical', label: 'Critical (<75)', color: 'red', count: trustDistribution.critical || 0 },
        ].map(bucket => (
          <div key={bucket.key} className={`bg-${bucket.color}-500/5 border border-${bucket.color}-500/20 rounded-lg p-3`}>
            <div className={`text-2xl font-bold text-${bucket.color}-400`}>{bucket.count}</div>
            <div className="text-xs text-slate-400 mt-1">{bucket.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Trust Factor Breakdown */}
        <div className="col-span-2 bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Agent Trust Scores</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {agents.sort((a: any, b: any) => a.trust_score - b.trust_score).map((agent: any) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  selectedAgentId === agent.id ? 'bg-cyan-500/10 border border-cyan-500/30' : 'hover:bg-slate-700/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 truncate">{agent.display_name}</div>
                  <div className="text-xs text-slate-500">{agent.category}</div>
                </div>
                <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      agent.trust_score >= 95 ? 'bg-emerald-400' : agent.trust_score >= 90 ? 'bg-cyan-400' : agent.trust_score >= 85 ? 'bg-blue-400' : agent.trust_score >= 75 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${agent.trust_score}%` }}
                  />
                </div>
                <span className={`text-xs font-mono w-10 text-right ${getTrustColor(agent.trust_score)}`}>
                  {agent.trust_score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Stats */}
        <div className="space-y-3">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Trust Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Avg Trust Score</span>
                <span className="text-sm font-mono text-emerald-400">{(agents.reduce((s: number, a: any) => s + a.trust_score, 0) / Math.max(agents.length, 1)).toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Avg Decay Rate</span>
                <span className="text-sm font-mono text-amber-400">{(avgDecayRate * 100).toFixed(2)}%/hr</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Anomalies (24h)</span>
                <span className="text-sm font-mono text-red-400">{anomalies.filter((a: any) => new Date(a.created_at) > new Date(Date.now() - 86400000)).length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Evaluations (24h)</span>
                <span className="text-sm font-mono text-blue-400">{trustHistory.filter((h: any) => new Date(h.created_at) > new Date(Date.now() - 86400000)).length}</span>
              </div>
            </div>
          </div>

          {/* Trust History for selected agent */}
          {selectedAgentId && agentTrustTrends.length > 0 && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-slate-200 mb-2">Trust History</h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {agentTrustTrends.slice(0, 10).map((h: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`font-mono ${h.delta > 0 ? 'text-emerald-400' : h.delta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {h.delta > 0 ? '+' : ''}{h.delta?.toFixed(1)}
                    </span>
                    <span className="text-slate-500">{new Date(h.created_at).toLocaleDateString()}</span>
                    {h.anomaly_detected && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anomaly Feed */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Trust Anomalies Detected
        </h3>
        {recentAnomalies.length === 0 ? (
          <div className="text-xs text-slate-400">No anomalies detected recently.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {recentAnomalies.map((a: any, i: number) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-200">
                    {a.agent_identities?.display_name || 'Agent'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    a.anomaly_severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                    a.anomaly_severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
                    a.anomaly_severity === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-slate-600/20 text-slate-300'
                  }`}>{a.anomaly_severity}</span>
                </div>
                <div className="text-xs text-slate-400">{a.anomaly_type?.replace('_', ' ')}</div>
                <div className="text-xs text-slate-500 mt-1">Score: {a.trust_score?.toFixed(1)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentPermissionsTab({ agents }: any) {
  const [policies, setPolicies] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [driftEvents, setDriftEvents] = useState<any[]>([]);
  const [loadingPerm, setLoadingPerm] = useState(true);

  useEffect(() => {
    loadPermissionData();
  }, []);

  const loadPermissionData = async () => {
    const [policiesRes, auditRes, driftRes] = await Promise.all([
      supabase.from('agent_permission_policies').select('*').order('created_at', { ascending: false }),
      supabase.from('agent_permission_audit').select('*, agent_identities(display_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('agent_permission_audit').select('*, agent_identities(display_name)').eq('is_drift', true).order('created_at', { ascending: false }).limit(30),
    ]);
    if (policiesRes.data) setPolicies(policiesRes.data);
    if (auditRes.data) setAuditLog(auditRes.data);
    if (driftRes.data) setDriftEvents(driftRes.data);
    setLoadingPerm(false);
  };

  const totalActions = auditLog.length;
  const grantedCount = auditLog.filter((a: any) => a.action === 'granted').length;
  const deniedCount = auditLog.filter((a: any) => a.action === 'denied').length;
  const driftCount = driftEvents.length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Active Policies</div>
          <div className="text-xl font-bold text-slate-100">{policies.filter(p => p.is_active).length}</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Actions Evaluated</div>
          <div className="text-xl font-bold text-blue-400">{totalActions}</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Granted / Denied</div>
          <div className="text-xl font-bold text-emerald-400">{grantedCount} <span className="text-red-400 text-sm">/ {deniedCount}</span></div>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Drift Detected</div>
          <div className="text-xl font-bold text-red-400">{driftCount}</div>
          <div className="text-xs text-red-300">permission violations</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Policies */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Permission Policies</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {policies.map((policy: any) => (
              <div key={policy.id} className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-200">{policy.policy_name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    policy.enforcement_mode === 'enforce' ? 'bg-emerald-500/20 text-emerald-300' :
                    policy.enforcement_mode === 'audit' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-slate-600/20 text-slate-300'
                  }`}>{policy.enforcement_mode}</span>
                </div>
                <div className="text-xs text-slate-400 mb-2">{policy.description}</div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">Scope: <span className="text-slate-300">{policy.scope}</span></span>
                  <span className="text-slate-500">Max Autonomy: <span className="text-cyan-300">{policy.max_autonomy_level}</span></span>
                  {policy.auto_revoke_on_anomaly && (
                    <span className="text-red-300 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Auto-revoke
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drift Events */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Permission Drift Detected
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {driftEvents.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-8">No drift events detected.</div>
            ) : driftEvents.map((drift: any, i: number) => (
              <div key={i} className="bg-red-500/5 border border-red-500/15 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-200">{drift.agent_identities?.display_name || 'Agent'}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    drift.drift_severity === 'critical' ? 'bg-red-500/30 text-red-200' :
                    drift.drift_severity === 'major' ? 'bg-orange-500/20 text-orange-300' :
                    drift.drift_severity === 'moderate' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-slate-600/20 text-slate-300'
                  }`}>{drift.drift_severity}</span>
                </div>
                <div className="text-xs text-slate-400">{drift.permission_type}: {drift.resource_path}</div>
                <div className="text-xs text-slate-500 mt-1">Risk: {drift.risk_score?.toFixed(0)}/100</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Permission Audit Trail (Recent)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 px-2 text-slate-400">Agent</th>
                <th className="text-left py-2 px-2 text-slate-400">Type</th>
                <th className="text-left py-2 px-2 text-slate-400">Resource</th>
                <th className="text-center py-2 px-2 text-slate-400">Action</th>
                <th className="text-right py-2 px-2 text-slate-400">Risk</th>
                <th className="text-right py-2 px-2 text-slate-400">Time</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.slice(0, 20).map((log: any, i: number) => (
                <tr key={i} className="border-b border-slate-800/30">
                  <td className="py-1.5 px-2 text-slate-200">{log.agent_identities?.display_name || '...'}</td>
                  <td className="py-1.5 px-2 text-slate-400">{log.permission_type}</td>
                  <td className="py-1.5 px-2 text-slate-300 font-mono">{log.resource_path}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded ${
                      log.action === 'granted' ? 'bg-emerald-500/20 text-emerald-300' :
                      log.action === 'denied' ? 'bg-red-500/20 text-red-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{log.action}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-300">{log.risk_score?.toFixed(0)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AgentCollaborationTab({ agents }: any) {
  const [collaborations, setCollaborations] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loadingCollab, setLoadingCollab] = useState(true);

  useEffect(() => {
    loadCollabData();
  }, []);

  const loadCollabData = async () => {
    const [collabRes, workflowRes] = await Promise.all([
      supabase.from('agent_collaborations').select('*, source:agent_identities!agent_collaborations_source_agent_id_fkey(display_name), target:agent_identities!agent_collaborations_target_agent_id_fkey(display_name)').order('message_count', { ascending: false }).limit(50),
      supabase.from('agent_workflow_dags').select('*').order('executions_last_24h', { ascending: false }),
    ]);
    if (collabRes.data) setCollaborations(collabRes.data);
    if (workflowRes.data) setWorkflows(workflowRes.data);
    setLoadingCollab(false);
  };

  const totalMessages = collaborations.reduce((s: number, c: any) => s + (c.message_count || 0), 0);
  const avgLatency = collaborations.length > 0 ? collaborations.reduce((s: number, c: any) => s + (c.avg_latency_ms || 0), 0) / collaborations.length : 0;
  const totalWorkflowExecs = workflows.reduce((s: number, w: any) => s + (w.executions_last_24h || 0), 0);

  const collabTypes = collaborations.reduce((acc: any, c: any) => {
    acc[c.collaboration_type] = (acc[c.collaboration_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Active Connections</div>
          <div className="text-xl font-bold text-cyan-400">{collaborations.length}</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Messages Exchanged</div>
          <div className="text-xl font-bold text-blue-400">{(totalMessages/1000).toFixed(1)}K</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Avg Latency</div>
          <div className="text-xl font-bold text-slate-100">{avgLatency.toFixed(0)}ms</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Workflow Runs (24h)</div>
          <div className="text-xl font-bold text-emerald-400">{totalWorkflowExecs}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Workflow DAGs */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-cyan-400" /> Active Workflows
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {workflows.map((wf: any) => (
              <div key={wf.id} className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-200">{wf.workflow_name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${wf.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/20 text-slate-400'}`}>
                    {wf.is_active ? 'active' : 'paused'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-2">{wf.workflow_description}</div>
                {/* DAG visualization */}
                <div className="flex items-center gap-1 mb-2 flex-wrap">
                  {wf.dag_definition?.nodes?.map((node: any, ni: number) => (
                    <div key={ni} className="flex items-center gap-1">
                      <div className={`px-2 py-0.5 rounded text-xs ${
                        node.type === 'start' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                        node.type === 'end' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        'bg-slate-700/50 text-slate-300 border border-slate-600/50'
                      }`}>
                        {node.id}
                      </div>
                      {ni < (wf.dag_definition?.nodes?.length || 0) - 1 && (
                        <ChevronRight className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>Trigger: <span className="text-slate-300">{wf.trigger_type}</span></span>
                  <span>24h: <span className="text-cyan-300">{wf.executions_last_24h}</span></span>
                  <span>Success: <span className="text-emerald-300">{wf.success_rate}%</span></span>
                  <span>Avg: <span className="text-slate-300">{(wf.avg_completion_time_ms / 1000).toFixed(1)}s</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collaboration Network */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-400" /> Inter-Agent Communications
          </h3>

          {/* Collaboration type breakdown */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {Object.entries(collabTypes).map(([type, count]: any) => (
              <span key={type} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                {type}: <span className="text-cyan-300 font-mono">{count}</span>
              </span>
            ))}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {collaborations.slice(0, 15).map((collab: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-slate-900/30 rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-cyan-300 truncate">{collab.source?.display_name || 'Agent'}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    <span className="text-blue-300 truncate">{collab.target?.display_name || 'Agent'}</span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{collab.collaboration_type}</span>
                <span className="text-xs font-mono text-slate-400 flex-shrink-0">{collab.message_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentThreatSurfaceTab({ agents }: any) {
  const [threatSurfaces, setThreatSurfaces] = useState<any[]>([]);
  const [loadingSurface, setLoadingSurface] = useState(true);

  useEffect(() => {
    loadThreatSurface();
  }, []);

  const loadThreatSurface = async () => {
    const { data } = await supabase
      .from('agent_threat_surface')
      .select('*, agent_identities(display_name, agent_slug, category)')
      .order('attack_surface_score', { ascending: false });
    if (data) setThreatSurfaces(data);
    setLoadingSurface(false);
  };

  const avgAttackSurface = threatSurfaces.length > 0
    ? threatSurfaces.reduce((s, t) => s + t.attack_surface_score, 0) / threatSurfaces.length : 0;
  const totalVulns = threatSurfaces.reduce((s, t) => s + (t.vulnerability_count || 0), 0);
  const totalCritical = threatSurfaces.reduce((s, t) => s + (t.critical_vulns || 0), 0);
  const publicExposed = threatSurfaces.filter(t => t.network_exposure === 'public' || t.network_exposure === 'dmz').length;

  const isolationDistribution = threatSurfaces.reduce((acc: any, t: any) => {
    acc[t.isolation_level] = (acc[t.isolation_level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto custom-scrollbar space-y-4">
      {/* Risk Summary */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Avg Attack Surface</div>
          <div className={`text-xl font-bold ${avgAttackSurface > 60 ? 'text-red-400' : avgAttackSurface > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {avgAttackSurface.toFixed(1)}
          </div>
          <div className="text-xs text-slate-500">/100 risk score</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Total Vulnerabilities</div>
          <div className="text-xl font-bold text-amber-400">{totalVulns}</div>
          <div className="text-xs text-red-300">{totalCritical} critical</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Network Exposed</div>
          <div className="text-xl font-bold text-red-400">{publicExposed}</div>
          <div className="text-xs text-slate-500">in DMZ/public</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Assessed Agents</div>
          <div className="text-xl font-bold text-blue-400">{threatSurfaces.length}</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Isolation Levels</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {Object.entries(isolationDistribution).map(([level, count]: any) => (
              <span key={level} className="text-xs bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded">
                {level}: {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Threat Surface Table */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Agent Attack Surface Assessment</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-2 px-2 text-slate-400">Agent</th>
                <th className="text-center py-2 px-2 text-slate-400">Surface Score</th>
                <th className="text-center py-2 px-2 text-slate-400">Vulns</th>
                <th className="text-center py-2 px-2 text-slate-400">Network</th>
                <th className="text-center py-2 px-2 text-slate-400">Data Level</th>
                <th className="text-center py-2 px-2 text-slate-400">Isolation</th>
                <th className="text-center py-2 px-2 text-slate-400">Input Val.</th>
                <th className="text-center py-2 px-2 text-slate-400">Output San.</th>
                <th className="text-center py-2 px-2 text-slate-400">Pentest</th>
              </tr>
            </thead>
            <tbody>
              {threatSurfaces.map((ts: any) => (
                <tr key={ts.id} className="border-b border-slate-800/30 hover:bg-slate-700/20">
                  <td className="py-2 px-2">
                    <div className="text-slate-200 font-medium">{ts.agent_identities?.display_name || ts.agent_id}</div>
                    <div className="text-slate-500">{ts.agent_identities?.category}</div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ts.attack_surface_score > 60 ? 'bg-red-400' : ts.attack_surface_score > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                          style={{ width: `${ts.attack_surface_score}%` }}
                        />
                      </div>
                      <span className={`font-mono ${ts.attack_surface_score > 60 ? 'text-red-400' : ts.attack_surface_score > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {ts.attack_surface_score}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={ts.critical_vulns > 0 ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                      {ts.vulnerability_count} {ts.critical_vulns > 0 && `(${ts.critical_vulns}C)`}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded ${
                      ts.network_exposure === 'isolated' ? 'bg-emerald-500/20 text-emerald-300' :
                      ts.network_exposure === 'internal' ? 'bg-blue-500/20 text-blue-300' :
                      ts.network_exposure === 'dmz' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-red-500/20 text-red-300'
                    }`}>{ts.network_exposure}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded ${
                      ts.data_sensitivity_level === 'top_secret' ? 'bg-red-500/20 text-red-300' :
                      ts.data_sensitivity_level === 'restricted' ? 'bg-orange-500/20 text-orange-300' :
                      ts.data_sensitivity_level === 'confidential' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-slate-600/20 text-slate-300'
                    }`}>{ts.data_sensitivity_level}</span>
                  </td>
                  <td className="py-2 px-2 text-center text-slate-300">{ts.isolation_level}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={ts.input_validation_score >= 80 ? 'text-emerald-400' : ts.input_validation_score >= 60 ? 'text-amber-400' : 'text-red-400'}>
                      {ts.input_validation_score?.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={ts.output_sanitization_score >= 80 ? 'text-emerald-400' : ts.output_sanitization_score >= 60 ? 'text-amber-400' : 'text-red-400'}>
                      {ts.output_sanitization_score?.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded ${
                      ts.last_pentest_result === 'pass' ? 'bg-emerald-500/20 text-emerald-300' :
                      ts.last_pentest_result === 'pass_with_findings' ? 'bg-blue-500/20 text-blue-300' :
                      ts.last_pentest_result === 'conditional_pass' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-red-500/20 text-red-300'
                    }`}>{ts.last_pentest_result?.replace(/_/g, ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Threat Vectors Summary */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Top Threat Vectors Across Fleet</h3>
        <div className="grid grid-cols-4 gap-3">
          {['prompt_injection', 'data_exfiltration', 'privilege_escalation', 'supply_chain'].map(vector => {
            const avgRisk = threatSurfaces.length > 0
              ? threatSurfaces.reduce((s, ts) => {
                  const v = ts.threat_vectors?.find((tv: any) => tv.vector === vector);
                  return s + (v?.risk || 0);
                }, 0) / threatSurfaces.length
              : 0;
            const mitigatedCount = threatSurfaces.filter(ts => {
              const v = ts.threat_vectors?.find((tv: any) => tv.vector === vector);
              return v?.mitigated;
            }).length;

            return (
              <div key={vector} className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
                <div className="text-xs text-slate-200 font-medium mb-2 capitalize">{vector.replace('_', ' ')}</div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${avgRisk > 50 ? 'bg-red-400' : avgRisk > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${avgRisk}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-300">{avgRisk.toFixed(0)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Mitigated: <span className="text-emerald-300">{mitigatedCount}/{threatSurfaces.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
