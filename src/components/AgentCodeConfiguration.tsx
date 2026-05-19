import { useState, useEffect, useMemo } from 'react';
import { Code, Settings, FileCode, Terminal, Box, Database, Workflow, Copy, Check, Brain, Cpu, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PRODUCTION_AGENT_CODE } from '../lib/productionAgentCode';

interface Agent {
  id: string;
  slug?: string;
  name: string;
  type: string;
  description: string;
  optimization_method: string;
  config: any;
  category?: string;
  aliases?: string[];
  cadence?: string;
  owns_decision?: boolean;
  phases?: number[];
  source_files?: string[];
  production_code?: string;
  config_yaml?: string;
  integration_code?: string;
  llm_config?: any;
  dependencies?: string[];
  language?: string;
  notes?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  soc_primary: 'SOC Primary',
  pipeline: 'Pipeline',
  correlation: 'Correlation',
  response: 'Response',
  discovery: 'Discovery',
  learning: 'Learning',
  adversarial: 'Adversarial',
  assistant: 'Assistant',
  threat_intel: 'Threat Intel',
  malware: 'Malware',
  infra: 'Infrastructure',
  build_time: 'Build-Time (BMAD)',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  soc_primary: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  pipeline: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  correlation: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  response: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  discovery: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
  learning: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  adversarial: 'text-red-400 border-red-500/30 bg-red-500/10',
  assistant: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  threat_intel: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  malware: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  infra: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
  build_time: 'text-lime-400 border-lime-500/30 bg-lime-500/10',
  other: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

const navigateToFeatureLab = () => {
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: 'featurelab' }));
};

const AgentCodeConfiguration = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'config' | 'integration' | 'llm'>('overview');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const [canonicalRes, aiRes, implRes] = await Promise.all([
        supabase.from('canonical_agents').select('*').order('category').order('name'),
        supabase.from('ai_agents').select('*'),
        supabase.from('agent_implementations').select('*'),
      ]);

      const canonicalRows = canonicalRes.data || [];
      const aiRows = aiRes.data || [];
      const implRows = implRes.data || [];

      const implBySlug = new Map<string, any>();
      implRows.forEach((i) => implBySlug.set(i.slug, i));

      const aiByName = new Map<string, any>();
      aiRows.forEach((a) => {
        aiByName.set((a.name || '').toLowerCase(), a);
        aiByName.set((a.type || '').toLowerCase(), a);
      });

      const merged: Agent[] = canonicalRows.map((c: any) => {
        const aliasKeys = [c.name, c.slug, ...(c.aliases || [])].map((s: string) => (s || '').toLowerCase());
        const ai = aliasKeys.map((k) => aiByName.get(k)).find(Boolean);
        const impl = implBySlug.get(c.slug);
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          type: ai?.type || c.slug,
          description: c.role || ai?.description || '',
          optimization_method: c.agent_type || ai?.optimization_method || 'hybrid',
          config: ai?.config || {},
          category: c.category || 'other',
          aliases: c.aliases || [],
          cadence: c.cadence,
          owns_decision: c.owns_decision,
          phases: c.phases || [],
          source_files: c.source_files || [],
          production_code: impl?.production_code || '',
          config_yaml: impl?.config_yaml || '',
          integration_code: impl?.integration_code || '',
          llm_config: impl?.llm_config || {},
          dependencies: impl?.dependencies || [],
          language: impl?.language || 'python',
          notes: impl?.notes || '',
        };
      });

      const canonicalKeys = new Set<string>();
      canonicalRows.forEach((c: any) => {
        [c.name, c.slug, ...(c.aliases || [])].forEach((k: string) => canonicalKeys.add((k || '').toLowerCase()));
      });
      aiRows.forEach((a) => {
        if (!canonicalKeys.has((a.name || '').toLowerCase()) && !canonicalKeys.has((a.type || '').toLowerCase())) {
          merged.push({
            id: a.id,
            name: a.name,
            type: a.type,
            description: a.description || '',
            optimization_method: a.optimization_method || 'hybrid',
            config: a.config || {},
            category: 'other',
            aliases: [],
            cadence: 'on_demand',
            owns_decision: false,
            phases: [],
            source_files: [],
          });
        }
      });

      setAgents(merged);
      if (merged.length > 0) setSelectedAgent(merged[0]);
      setLoading(false);
    } catch (error) {
      console.error('Error loading agents:', error);
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => set.add(a.category || 'other'));
    return Array.from(set);
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (categoryFilter !== 'all' && (a.category || 'other') !== categoryFilter) return false;
      if (!q) return true;
      const hay = [a.name, a.type, a.description, ...(a.aliases || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [agents, search, categoryFilter]);

  const groupedAgents = useMemo(() => {
    const groups = new Map<string, Agent[]>();
    filteredAgents.forEach((a) => {
      const cat = a.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(a);
    });
    return Array.from(groups.entries());
  }, [filteredAgents]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAgentImplementation = (agent: Agent) => {
    if (agent.production_code && agent.production_code.trim().length > 0) {
      return agent.production_code;
    }
    const typeKey = (agent.type || agent.slug || '').toLowerCase();
    if (typeKey.includes('triage')) return PRODUCTION_AGENT_CODE.triage;
    if (typeKey.includes('enrichment')) return PRODUCTION_AGENT_CODE.enrichment;
    if (typeKey.includes('hunt') || typeKey.includes('threat_hunter')) return PRODUCTION_AGENT_CODE.threat_hunter;
    if (typeKey.includes('orchestrat')) return PRODUCTION_AGENT_CODE.orchestrator;
    if (typeKey.includes('response') || typeKey.includes('investigation')) return PRODUCTION_AGENT_CODE.agent_base;
    return PRODUCTION_AGENT_CODE.agent_base;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-slate-950">
      {/* Agent Sidebar */}
      <div className="w-80 border-r border-slate-800 overflow-y-auto bg-slate-900/50 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-white font-semibold flex items-center space-x-2">
            <Box className="w-5 h-5 text-blue-500" />
            <span>Agent Registry</span>
            <span className="ml-auto text-xs text-slate-400 font-normal">{agents.length} total</span>
          </h3>
          <p className="text-slate-400 text-xs mt-1">Canonical SOC + build-time agents</p>

          <button
            onClick={navigateToFeatureLab}
            className="mt-3 w-full px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Agent</span>
          </button>
          <p className="text-slate-500 text-[10px] mt-1.5 text-center">Opens Feature Lab BMAD workflow</p>

          <div className="mt-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents, aliases..."
              className="w-full pl-8 pr-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                categoryFilter === 'all'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                  categoryFilter === cat
                    ? CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
                    : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {groupedAgents.map(([cat, list]) => (
            <div key={cat}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>{CATEGORY_LABELS[cat] || cat}</span>
                <span className="text-slate-600">{list.length}</span>
              </div>
              <div className="space-y-1">
                {list.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all border ${
                      selectedAgent?.id === agent.id
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-slate-800/40 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{agent.name}</div>
                    {agent.aliases && agent.aliases.length > 0 && (
                      <div className="text-[10px] opacity-60 mt-0.5 truncate">
                        aka {agent.aliases.slice(0, 2).join(', ')}
                        {agent.aliases.length > 2 ? '...' : ''}
                      </div>
                    )}
                    <div className="text-[10px] opacity-70 mt-1 flex items-center space-x-2">
                      <span>{agent.optimization_method}</span>
                      {agent.cadence && (
                        <>
                          <span className="opacity-40">•</span>
                          <span>{agent.cadence.replace('_', ' ')}</span>
                        </>
                      )}
                      {agent.owns_decision && (
                        <>
                          <span className="opacity-40">•</span>
                          <span className="text-amber-300">decides</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredAgents.length === 0 && (
            <div className="text-center text-slate-500 text-xs py-8">No agents match your filters</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAgent && (
          <>
            {/* Header */}
            <div className="bg-slate-900/50 border-b border-slate-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedAgent.name}</h2>
                  <p className="text-slate-400 text-sm mt-1">{selectedAgent.description}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-3">
                    {selectedAgent.category && (
                      <span className={`px-3 py-1 rounded text-xs font-semibold border ${CATEGORY_COLORS[selectedAgent.category] || CATEGORY_COLORS.other}`}>
                        {CATEGORY_LABELS[selectedAgent.category] || selectedAgent.category}
                      </span>
                    )}
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold border border-blue-500/30">
                      {selectedAgent.type.toUpperCase()}
                    </span>
                    <span className="px-3 py-1 bg-slate-500/20 text-slate-300 rounded text-xs font-semibold border border-slate-500/30">
                      {selectedAgent.optimization_method}
                    </span>
                    {selectedAgent.cadence && (
                      <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded text-xs font-semibold border border-cyan-500/30">
                        {selectedAgent.cadence.replace('_', ' ')}
                      </span>
                    )}
                    {selectedAgent.owns_decision && (
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded text-xs font-semibold border border-amber-500/30">
                        autonomous
                      </span>
                    )}
                    {selectedAgent.phases && selectedAgent.phases.length > 0 && (
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-semibold border border-emerald-500/30">
                        Phases {selectedAgent.phases.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex space-x-2 mt-6 border-t border-slate-800 pt-4">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'overview'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>Overview</span>
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'code'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Code className="w-4 h-4" />
                  <span>Implementation</span>
                </button>
                <button
                  onClick={() => setActiveTab('config')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'config'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Configuration</span>
                </button>
                <button
                  onClick={() => setActiveTab('integration')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'integration'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Workflow className="w-4 h-4" />
                  <span>Integration</span>
                </button>
                <button
                  onClick={() => setActiveTab('llm')}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                    activeTab === 'llm'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Brain className="w-4 h-4" />
                  <span>LLM & ML</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Agent Description</h3>
                    <p className="text-slate-300 leading-relaxed">{selectedAgent.description}</p>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Optimization Method</h3>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded border border-purple-500/30 font-mono text-sm">
                          {selectedAgent.optimization_method}
                        </div>
                      </div>
                      {selectedAgent.optimization_method === 'hybrid' && (
                        <p className="text-slate-400 text-sm">
                          Combines rule-based systems with machine learning for optimal performance and interpretability.
                        </p>
                      )}
                      {selectedAgent.optimization_method === 'TAO' && (
                        <p className="text-slate-400 text-sm">
                          Threat Attribution Optimization - Advanced correlation of threat intelligence across multiple feeds.
                        </p>
                      )}
                      {selectedAgent.optimization_method === 'ALHF' && (
                        <p className="text-slate-400 text-sm">
                          Adaptive Learning from Human Feedback - Continuously improves from analyst corrections and feedback.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Key Capabilities</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 text-sm font-semibold mb-1">Automated Decision Making</div>
                        <div className="text-slate-400 text-xs">Makes intelligent decisions without human intervention</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 text-sm font-semibold mb-1">Real-time Processing</div>
                        <div className="text-slate-400 text-xs">Processes events in milliseconds</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-purple-400 text-sm font-semibold mb-1">Self-Learning</div>
                        <div className="text-slate-400 text-xs">Improves accuracy over time</div>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-orange-400 text-sm font-semibold mb-1">Multi-source Correlation</div>
                        <div className="text-slate-400 text-xs">Analyzes data from multiple systems</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'code' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold flex items-center space-x-2">
                      <Terminal className="w-5 h-5 text-green-500" />
                      <span>Python Implementation</span>
                    </h3>
                    <button
                      onClick={() => copyToClipboard(getAgentImplementation(selectedAgent))}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center space-x-2"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                    <pre className="p-6 overflow-x-auto text-sm">
                      <code className="text-green-400 font-mono">
                        {getAgentImplementation(selectedAgent)}
                      </code>
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className="space-y-4">
                  <h3 className="text-white font-semibold flex items-center space-x-2">
                    <Database className="w-5 h-5 text-blue-500" />
                    <span>Agent Configuration</span>
                  </h3>

                  {selectedAgent.config_yaml && selectedAgent.config_yaml.trim().length > 0 && (
                    <div className="bg-slate-900 rounded-lg border border-slate-700">
                      <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">config.yaml</span>
                        <button
                          onClick={() => copyToClipboard(selectedAgent.config_yaml || '')}
                          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="text-sm overflow-x-auto p-4">
                        <code className="text-amber-200 font-mono whitespace-pre">
                          {selectedAgent.config_yaml}
                        </code>
                      </pre>
                    </div>
                  )}

                  {selectedAgent.dependencies && selectedAgent.dependencies.length > 0 && (
                    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                      <h4 className="text-white font-semibold mb-3">Runtime Dependencies</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedAgent.dependencies.map((dep) => (
                          <span key={dep} className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-full text-xs font-mono">
                            {dep}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAgent.source_files && selectedAgent.source_files.length > 0 && (
                    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                      <h4 className="text-white font-semibold mb-3">Source Files</h4>
                      <ul className="space-y-1.5 text-sm">
                        {selectedAgent.source_files.map((f) => (
                          <li key={f} className="text-slate-300 font-mono text-xs flex items-center space-x-2">
                            <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedAgent.notes && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                      <div className="text-amber-400 font-semibold text-sm mb-1">Operational Notes</div>
                      <p className="text-slate-300 text-sm">{selectedAgent.notes}</p>
                    </div>
                  )}

                  {Object.keys(selectedAgent.config || {}).length > 0 && (
                    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                      <h4 className="text-white font-semibold mb-3">Runtime Configuration (DB)</h4>
                      <div className="space-y-2 text-sm">
                        {Object.entries(selectedAgent.config).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-start border-b border-slate-800 pb-2">
                            <span className="text-slate-400 font-mono">{key}</span>
                            <span className="text-slate-300">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'integration' && (
                <div className="space-y-6">
                  {selectedAgent.integration_code && selectedAgent.integration_code.trim().length > 0 && (
                    <div className="bg-slate-900 rounded-lg border border-slate-700">
                      <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">caller-snippet.ts</span>
                        <button
                          onClick={() => copyToClipboard(selectedAgent.integration_code || '')}
                          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="text-sm overflow-x-auto p-4">
                        <code className="text-cyan-200 font-mono whitespace-pre">
                          {selectedAgent.integration_code}
                        </code>
                      </pre>
                    </div>
                  )}

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4 flex items-center space-x-2">
                      <Workflow className="w-5 h-5 text-green-500" />
                      <span>Integration Points</span>
                    </h3>
                    <div className="space-y-3">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 font-semibold mb-2">Input Sources</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Event Stream (Kafka/Redis)</li>
                          <li>• Database Queries (PostgreSQL)</li>
                          <li>• API Endpoints (REST/GraphQL)</li>
                          <li>• Message Queue (RabbitMQ)</li>
                        </ul>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 font-semibold mb-2">Output Destinations</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Alert Management System</li>
                          <li>• Case Management (SOAR)</li>
                          <li>• Metrics Dashboard</li>
                          <li>• Audit Log</li>
                        </ul>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-purple-400 font-semibold mb-2">External APIs</div>
                        <ul className="text-slate-300 text-sm space-y-1">
                          <li>• Threat Intelligence Feeds</li>
                          <li>• SIEM Systems (Splunk, QRadar)</li>
                          <li>• EDR Platforms (CrowdStrike, SentinelOne)</li>
                          <li>• Cloud Security (AWS GuardDuty, Azure Sentinel)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Communication Protocol</h3>
                    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                      <pre className="text-sm overflow-x-auto">
                        <code className="text-cyan-300 font-mono">{`{
  "message_type": "agent_communication",
  "from": "triage_agent",
  "to": "enrichment_agent",
  "payload": {
    "alert_id": "alert-123",
    "iocs": ["192.168.1.100", "malicious.com"],
    "priority": "high"
  },
  "timestamp": "2025-10-14T10:30:00Z"
}`}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'llm' && (
                <div className="space-y-6">
                  {selectedAgent.llm_config && Object.keys(selectedAgent.llm_config).length > 0 && (
                    <div className="bg-slate-900 rounded-lg border border-slate-700">
                      <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400 flex items-center space-x-2">
                          <Brain className="w-3.5 h-3.5 text-pink-400" />
                          <span>llm_config (live from agent_implementations)</span>
                        </span>
                        <button
                          onClick={() => copyToClipboard(JSON.stringify(selectedAgent.llm_config, null, 2))}
                          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="text-sm overflow-x-auto p-4">
                        <code className="text-pink-200 font-mono whitespace-pre">
                          {JSON.stringify(selectedAgent.llm_config, null, 2)}
                        </code>
                      </pre>
                    </div>
                  )}

                  {(selectedAgent.type === 'triage' || selectedAgent.type === 'investigation' || selectedAgent.type === 'orchestrator') && (
                    <div className="bg-gradient-to-br from-purple-900/20 to-slate-900 rounded-lg p-6 border border-purple-500/30">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-400" />
                        LLM Prompt Configuration
                      </h3>

                      {selectedAgent.type === 'triage' && (
                        <div className="space-y-4">
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                            <h4 className="text-purple-400 font-semibold mb-3">GPT-4 Triage Analysis Prompt</h4>
                            <div className="bg-slate-900 rounded p-4 font-mono text-xs text-green-300 overflow-x-auto mb-4">
                              <pre>{`You are a cybersecurity expert analyzing security alerts for triage.

Input:
- Alert Title: {{alert.title}}
- Severity: {{alert.severity}}
- Source: {{alert.source}}
- Indicators: {{alert.indicators}}
- Raw Data: {{alert.raw_data}}

Task:
Analyze this alert and provide a structured assessment.

Output Format (JSON):
{
  "is_true_positive": true/false,
  "confidence": 0.0-1.0,
  "severity": "info|low|medium|high|critical",
  "reasoning": "Brief explanation of your assessment",
  "recommended_actions": ["action1", "action2"],
  "related_ttps": ["MITRE ATT&CK IDs"],
  "false_positive_likelihood": 0.0-1.0
}

Consider:
1. Does this match known attack patterns?
2. Are the indicators consistent with malicious activity?
3. Is there context suggesting legitimate business activity?
4. What is the potential business impact?
5. Are there missing indicators that would help confirm?

Be concise and decisive. Focus on actionable intelligence.`}</pre>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Model</div>
                                <div className="text-white text-sm font-semibold">GPT-4 Turbo</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Temperature</div>
                                <div className="text-white text-sm font-semibold">0.1</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Max Tokens</div>
                                <div className="text-white text-sm font-semibold">500</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Timeout</div>
                                <div className="text-green-400 text-sm font-semibold">10s</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedAgent.type === 'investigation' && (
                        <div className="space-y-4">
                          <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                            <h4 className="text-purple-400 font-semibold mb-3">GPT-4 Attack Chain Analysis Prompt</h4>
                            <div className="bg-slate-900 rounded p-4 font-mono text-xs text-green-300 overflow-x-auto mb-4">
                              <pre>{`You are a threat intelligence analyst investigating a security incident.

Context:
- Trigger Event: {{trigger_alert}}
- Related Events: {{related_events}}
- Network Flow: {{network_data}}
- Endpoint Activity: {{endpoint_data}}
- Authentication Logs: {{auth_data}}
- Timeline: {{event_timeline}}

Objective:
Reconstruct the attack chain and identify:
1. Initial access method
2. Lateral movement paths
3. Persistence mechanisms
4. Data exfiltration attempts
5. Attacker objectives

Output Format (JSON):
{
  "attack_chain": [
    {
      "phase": "initial_access|execution|persistence|...",
      "timestamp": "ISO8601",
      "technique": "T1566.001",
      "description": "What happened",
      "confidence": 0.0-1.0,
      "evidence": ["event_ids"]
    }
  ],
  "threat_actor_profile": {
    "sophistication": "low|medium|high|nation_state",
    "likely_motivation": "financial|espionage|disruption",
    "similar_campaigns": ["campaign names"]
  },
  "blast_radius": {
    "affected_hosts": ["hostnames"],
    "compromised_accounts": ["usernames"],
    "data_at_risk": "description"
  },
  "recommended_containment": ["immediate actions"],
  "investigation_priority": "low|medium|high|critical"
}

Map all activities to MITRE ATT&CK framework.
Identify gaps in telemetry that limit visibility.`}</pre>
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Model</div>
                                <div className="text-white text-sm font-semibold">GPT-4</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Temperature</div>
                                <div className="text-white text-sm font-semibold">0.2</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Max Tokens</div>
                                <div className="text-white text-sm font-semibold">2000</div>
                              </div>
                              <div className="bg-slate-900 p-3 rounded">
                                <div className="text-slate-400 text-xs mb-1">Timeout</div>
                                <div className="text-green-400 text-sm font-semibold">30s</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ML Models Section */}
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Cpu className="w-6 h-6 text-cyan-400" />
                      Machine Learning Models
                    </h3>

                    {selectedAgent.type === 'triage' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Random Forest Classifier</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Configuration</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Algorithm:</span>
                                  <span className="text-white font-mono">RandomForestClassifier</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">n_estimators:</span>
                                  <span className="text-white font-mono">100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">max_depth:</span>
                                  <span className="text-white font-mono">10</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">min_samples_split:</span>
                                  <span className="text-white font-mono">2</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Performance Metrics</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Accuracy:</span>
                                  <span className="text-green-400 font-semibold">94.7%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Precision:</span>
                                  <span className="text-green-400 font-semibold">92.1%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Recall:</span>
                                  <span className="text-green-400 font-semibold">96.3%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Inference Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;5ms</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 bg-slate-900 rounded p-3">
                            <div className="text-slate-400 text-xs mb-2">Feature Extraction</div>
                            <div className="text-white text-xs font-mono">
                              source_encoding, severity_score, ioc_count, reputation_score, time_risk, occurrence_rate
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'enrichment' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Vector Embeddings for IOC Similarity</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Embedding Model</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Model:</span>
                                  <span className="text-white font-mono">text-embedding-3-large</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Dimensions:</span>
                                  <span className="text-white font-mono">3072</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Similarity:</span>
                                  <span className="text-white font-mono">cosine</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Index Type:</span>
                                  <span className="text-white font-mono">HNSW</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Index Configuration</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">M (HNSW):</span>
                                  <span className="text-white font-mono">16</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">ef_construction:</span>
                                  <span className="text-white font-mono">200</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">ef_search:</span>
                                  <span className="text-white font-mono">100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Query Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;50ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'investigation' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Graph Neural Network for Attack Chain Analysis</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Architecture</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Type:</span>
                                  <span className="text-white font-mono">Graph Attention Network</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Layers:</span>
                                  <span className="text-white font-mono">3 GAT layers</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Hidden Units:</span>
                                  <span className="text-white font-mono">128</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Attention Heads:</span>
                                  <span className="text-white font-mono">8</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Detection Performance</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Lateral Movement:</span>
                                  <span className="text-green-400 font-semibold">97.2%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Persistence:</span>
                                  <span className="text-green-400 font-semibold">95.8%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Exfiltration:</span>
                                  <span className="text-green-400 font-semibold">93.4%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Processing Time:</span>
                                  <span className="text-green-400 font-semibold">&lt;200ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedAgent.type === 'response' && (
                      <div className="space-y-4">
                        <div className="bg-slate-800/50 rounded-lg p-4">
                          <h4 className="text-cyan-400 font-semibold mb-3">Risk Scoring Model (Ensemble)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Model Components</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Base Models:</span>
                                  <span className="text-white font-mono">3 (RF, XGBoost, LGBM)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Meta-Learner:</span>
                                  <span className="text-white font-mono">Logistic Regression</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Features:</span>
                                  <span className="text-white font-mono">24 dimensions</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Update Frequency:</span>
                                  <span className="text-white font-mono">Hourly</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm mb-2">Safety Metrics</div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">False Block Rate:</span>
                                  <span className="text-yellow-400 font-semibold">0.02%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Missed Threats:</span>
                                  <span className="text-yellow-400 font-semibold">1.3%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Avg Risk Score:</span>
                                  <span className="text-green-400 font-semibold">0.23</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Inference:</span>
                                  <span className="text-green-400 font-semibold">&lt;3ms</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Model Training & Monitoring */}
                  <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
                    <h3 className="text-white font-semibold mb-4">Training & Monitoring</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-green-400 font-semibold mb-2 text-sm">Training Data</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• 10M+ labeled samples</div>
                          <div>• 90/10 train/test split</div>
                          <div>• Stratified sampling</div>
                          <div>• Class balancing (SMOTE)</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-blue-400 font-semibold mb-2 text-sm">Retraining Schedule</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• Full retrain: Weekly</div>
                          <div>• Online learning: Daily</div>
                          <div>• A/B testing: Continuous</div>
                          <div>• Rollback on degradation</div>
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-4 rounded">
                        <div className="text-orange-400 font-semibold mb-2 text-sm">Monitoring</div>
                        <div className="space-y-1 text-xs text-slate-300">
                          <div>• Accuracy drift detection</div>
                          <div>• Feature distribution shift</div>
                          <div>• Latency tracking (p99)</div>
                          <div>• Prediction distribution</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentCodeConfiguration;
