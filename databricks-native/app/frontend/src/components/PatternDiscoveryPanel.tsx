import { useState, useEffect } from 'react';
import { Scan, Play, Eye, AlertTriangle, TrendingUp, Database, Settings, X, Activity, Zap, CheckCircle, Clock, Bot, FileCode } from 'lucide-react';
import PatternGraph3D from './PatternGraph3D';
import RawDataAnalysis from './RawDataAnalysis';
import { supabase } from '../lib/supabase';
import { generateMockDiscoveryProfiles, generateMockDiscoveredPatterns } from '../lib/mockData';
import { aiCorrelationAgent } from '../lib/aiCorrelationAgent';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';
import DaCInspectorModal from './DaCInspectorModal';
import type { AIGeneratedRule } from './DaCInspectorModal';

function convertAgentRuleToAIGeneratedRule(agentRule: any, pattern: any): AIGeneratedRule {
  const eventSequence: string[] = agentRule.rule_logic?.conditions
    ?.find((c: any) => c.type === 'sequence')?.events || pattern.event_sequence || [];

  const threshold = agentRule.rule_logic?.conditions
    ?.find((c: any) => c.type === 'threshold');

  const conditions = [
    ...eventSequence.map((evt: string, i: number) => ({
      field: `event_type[${i}]`,
      operator: 'equals',
      value: evt,
      window: i > 0 ? '1h' : '',
    })),
    ...(threshold ? [{
      field: threshold.field || 'occurrence_count',
      operator: threshold.operator || '>=',
      value: String(threshold.value || 2),
    }] : []),
  ];

  const pseudoLines = [
    `RULE "${agentRule.rule_name}"`,
    `  SEVERITY ${agentRule.severity?.toUpperCase() || 'HIGH'}`,
    `  WINDOW  1 HOUR`,
    ``,
    `  DETECT SEQUENCE:`,
    ...eventSequence.map((e: string, i: number) => `    [${i + 1}] ${e}`),
    ``,
    threshold ? `  WHERE ${threshold.field} ${threshold.operator} ${threshold.value}` : null,
    ``,
    `  ON MATCH:`,
    `    CREATE ALERT severity=${agentRule.severity}`,
    `    ENRICH WITH tags=[auto_correlation, pattern:${pattern.pattern_name}]`,
    ``,
    `  -- Confidence: ${agentRule.confidence_score}%`,
    `  -- Generated from pattern: ${pattern.pattern_name}`,
  ].filter(Boolean).join('\n');

  const graphNodes: AIGeneratedRule['graph_nodes'] = [];
  const graphEdges: AIGeneratedRule['graph_edges'] = [];

  eventSequence.forEach((evt: string, i: number) => {
    graphNodes.push({ id: `src_${i}`, label: evt, type: 'source', detail: `Event stage ${i + 1}` });
  });

  if (conditions.length > 0) {
    graphNodes.push({ id: 'cond_threshold', label: threshold ? `${threshold.field} ${threshold.operator} ${threshold.value}` : 'Threshold', type: 'condition', detail: 'Occurrence threshold' });
  }

  graphNodes.push({ id: 'detect_main', label: agentRule.rule_name, type: 'detection', detail: pattern.description?.substring(0, 60) || '' });

  const actions = agentRule.rule_logic?.actions || [];
  actions.forEach((a: any, i: number) => {
    graphNodes.push({ id: `act_${i}`, label: a.type === 'create_alert' ? 'Create Alert' : a.type === 'enrich_events' ? 'Enrich Events' : a.type, type: 'action', detail: a.title || a.add_tags?.join(', ') || '' });
  });

  eventSequence.forEach((_: string, i: number) => {
    if (i < eventSequence.length - 1) {
      graphEdges.push({ from: `src_${i}`, to: `src_${i + 1}`, label: 'then' });
    }
  });
  if (eventSequence.length > 0) {
    graphEdges.push({ from: `src_${eventSequence.length - 1}`, to: 'cond_threshold', label: 'evaluate' });
  }
  graphEdges.push({ from: 'cond_threshold', to: 'detect_main', label: 'triggers' });
  actions.forEach((_: any, i: number) => {
    graphEdges.push({ from: 'detect_main', to: `act_${i}`, label: 'executes' });
  });

  const mitreMap: Record<string, string[]> = {
    failed_login: ['T1110 - Brute Force', 'TA0006 - Credential Access'],
    privilege_escalation: ['T1068 - Exploitation for Privilege Escalation', 'TA0004 - Privilege Escalation'],
    lateral_movement: ['T1021 - Remote Services', 'TA0008 - Lateral Movement'],
    data_exfiltration: ['T1041 - Exfiltration Over C2', 'TA0010 - Exfiltration'],
    suspicious_transfer: ['T1048 - Exfiltration Over Alternative Protocol'],
    malware_execution: ['T1204 - User Execution', 'TA0002 - Execution'],
    port_scan: ['T1046 - Network Service Discovery', 'TA0007 - Discovery'],
    dns_tunneling: ['T1071.004 - DNS', 'TA0011 - Command and Control'],
    credential_dump: ['T1003 - OS Credential Dumping'],
    command_control: ['T1071 - Application Layer Protocol'],
  };

  const mitreTactics = [...new Set(
    eventSequence.flatMap((e: string) => mitreMap[e] || [`TA0001 - ${e}`])
  )];

  const dataSourceMap: Record<string, string> = {
    failed_login: 'Authentication Logs',
    privilege_escalation: 'Sysmon / Windows Security',
    lateral_movement: 'Network Flow Data',
    data_exfiltration: 'DLP / Proxy Logs',
    suspicious_transfer: 'NetFlow / Firewall',
    malware_execution: 'EDR Telemetry',
    port_scan: 'IDS/IPS Alerts',
    dns_tunneling: 'DNS Query Logs',
    credential_dump: 'LSASS Memory / Sysmon',
    command_control: 'Proxy / DNS Logs',
  };

  const dataSources = [...new Set(
    eventSequence.map((e: string) => dataSourceMap[e] || 'System Logs')
  )];

  const enhancementIdeas: AIGeneratedRule['enhancement_ideas'] = [
    { title: 'Add GeoIP Enrichment', description: `Correlate source IPs across ${eventSequence.length} stages with GeoIP data to detect impossible travel.` },
    { title: 'Behavioral Baseline Comparison', description: 'Compare this pattern against 30-day behavioral baselines to reduce false positives.' },
    { title: 'Threat Intel Feed Integration', description: 'Cross-reference IOCs in this sequence with STIX/TAXII threat intelligence feeds.' },
  ];

  if (pattern.is_anomaly) {
    enhancementIdeas.push({ title: 'ML Anomaly Score Weighting', description: 'Incorporate anomaly score from the ML model to dynamically adjust severity.' });
  }
  if (pattern.pattern_type === 'zero_day_indicator') {
    enhancementIdeas.push({ title: 'Zero-Day Sandbox Detonation', description: 'Automatically submit associated artifacts to the AI malware sandbox for behavioral analysis.' });
  }

  return {
    rule_name: agentRule.rule_name,
    rule_description: agentRule.rule_description,
    severity: agentRule.severity || 'high',
    confidence_score: (agentRule.confidence_score || 75) / 100,
    rule_logic: {
      conditions,
      sequence: eventSequence,
      time_window: '1h',
      threshold: threshold ? { field: threshold.field, operator: threshold.operator, value: threshold.value } : undefined,
      pseudo_code: pseudoLines,
    },
    mitre_tactics: mitreTactics,
    data_sources: dataSources,
    graph_nodes: graphNodes,
    graph_edges: graphEdges,
    enhancement_ideas: enhancementIdeas,
  };
}

const PatternDiscoveryPanel = () => {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<any>(null);
  const [activeView, setActiveView] = useState<'graph' | 'list' | 'raw'>('graph');
  const [threatFilter, setThreatFilter] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);
  const [correlationRules, setCorrelationRules] = useState<any[]>([]);
  const [agentStats, setAgentStats] = useState<any>(null);
  const [processingAgent, setProcessingAgent] = useState(false);
  const [dacRule, setDacRule] = useState<AIGeneratedRule | null>(null);
  const [showDaCInspector, setShowDaCInspector] = useState(false);

  useEffect(() => {
    loadData();
    loadCorrelationRules();
    loadAgentStats();
    const interval = setInterval(() => {
      loadData();
      loadCorrelationRules();
      loadAgentStats();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [profilesResult, patternsResult] = await Promise.all([
        supabase.from('discovery_profiles').select('*'),
        supabase.from('discovered_patterns').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      setProfiles(profilesResult.data && profilesResult.data.length > 0 ? profilesResult.data : generateMockDiscoveryProfiles());
      setPatterns(patternsResult.data && patternsResult.data.length > 0 ? patternsResult.data : generateMockDiscoveredPatterns());
    } catch (error) {
      console.error('Error loading pattern discovery data:', error);
      setProfiles(generateMockDiscoveryProfiles());
      setPatterns(generateMockDiscoveredPatterns());
    } finally {
      setLoading(false);
    }
  };

  const loadCorrelationRules = async () => {
    try {
      const { data, error } = await supabase
        .from('correlation_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCorrelationRules(data || []);
    } catch (error) {
      console.error('Error loading correlation rules:', error);
    }
  };

  const loadAgentStats = async () => {
    try {
      const stats = await aiCorrelationAgent.getAgentStatistics();
      setAgentStats(stats);
    } catch (error) {
      console.error('Error loading agent stats:', error);
    }
  };

  const runAIAgent = async () => {
    setProcessingAgent(true);
    try {
      await aiCorrelationAgent.processAllPatterns();
      await loadCorrelationRules();
      await loadAgentStats();
    } catch (error) {
      console.error('Error running AI agent:', error);
    } finally {
      setProcessingAgent(false);
    }
  };

  const filteredPatterns = threatFilter === 'all'
    ? patterns
    : patterns.filter(p => p.threat_level === threatFilter);

  const stats = {
    totalPatterns: patterns.length,
    threats: patterns.filter(p => p.pattern_type === 'threat_sequence').length,
    anomalies: patterns.filter(p => p.is_anomaly).length,
    zeroDay: patterns.filter(p => p.pattern_type === 'zero_day_indicator').length,
  };

  return (
    <div className="space-y-6">
      <MLModelExplainer {...ML_MODELS.patternDiscovery} />

      <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Scan className="w-6 h-6 text-purple-500" />
              <span>Pattern Discovery</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              AI-powered threat detection identifying unknown and zero-day patterns
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveView('graph')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                activeView === 'graph' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>3D View</span>
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                activeView === 'list' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>List View</span>
            </button>
            <button
              onClick={() => setActiveView('raw')}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                activeView === 'raw' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Raw Data</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <StatCard title="Total Patterns" value={stats.totalPatterns} icon={<Scan className="w-5 h-5" />} color="purple" />
          <StatCard title="Threat Sequences" value={stats.threats} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
          <StatCard title="Anomalies" value={stats.anomalies} icon={<Eye className="w-5 h-5" />} color="yellow" />
          <StatCard title="Zero-Day Indicators" value={stats.zeroDay} icon={<TrendingUp className="w-5 h-5" />} color="orange" />
          <StatCard title="AI-Generated Rules" value={correlationRules.filter(r => r.generated_by === 'ai_agent').length} icon={<Bot className="w-5 h-5" />} color="cyan" />
        </div>

        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Bot className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold flex items-center space-x-2">
                  <span>AI Correlation Agent</span>
                  {processingAgent && <Clock className="w-4 h-4 animate-spin text-blue-400" />}
                </h3>
                <p className="text-slate-400 text-sm">
                  {agentStats ? (
                    `Active rules: ${agentStats.activeRules} • Testing: ${agentStats.testingRules} • Avg confidence: ${agentStats.avgConfidence}%`
                  ) : (
                    'Automatically generates correlation rules from discovered patterns'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={runAIAgent}
              disabled={processingAgent}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors font-semibold"
            >
              <Zap className="w-4 h-4" />
              <span>{processingAgent ? 'Processing...' : 'Run Agent'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <span className="text-slate-400 text-sm">Filter by Threat Level:</span>
          {['all', 'critical', 'high', 'medium', 'low'].map((level) => (
            <button
              key={level}
              onClick={() => setThreatFilter(level)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                threatFilter === level
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'raw' ? (
        <RawDataAnalysis />
      ) : activeView === 'graph' ? (
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
          <div className="h-[700px] rounded-lg overflow-hidden border border-slate-700">
            <PatternGraph3D
              patterns={filteredPatterns}
              selectedPattern={selectedPattern?.id}
              onPatternClick={(id) => setSelectedPattern(patterns.find(p => p.id === id))}
            />
          </div>
          <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-slate-300">Critical</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-slate-300">High</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-slate-300">Medium</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-slate-300">Low</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
          <div className="space-y-3 max-h-[700px] overflow-y-auto">
            {filteredPatterns.map((pattern) => (
              <div
                key={pattern.id}
                onClick={() => setSelectedPattern(pattern)}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-white font-semibold">{pattern.pattern_name}</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold border ${
                        pattern.threat_level === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                        pattern.threat_level === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' :
                        pattern.threat_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                        'bg-green-500/20 text-green-400 border-green-500/50'
                      }`}>
                        {pattern.threat_level}
                      </span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs capitalize">
                        {pattern.pattern_type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">{pattern.description}</p>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500">Occurrences</p>
                        <p className="text-white font-semibold">{pattern.occurrence_count}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Confidence</p>
                        <p className="text-white font-semibold">{pattern.confidence_score}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500">First Seen</p>
                        <p className="text-white font-semibold">{new Date(pattern.first_seen).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Status</p>
                        <p className="text-white font-semibold">
                          {pattern.investigated ? 'Reviewed' : 'Pending'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {correlationRules.length > 0 && (
        <div className="bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Zap className="w-5 h-5 text-blue-400" />
              <span>Generated Correlation Rules</span>
            </h3>
            <span className="text-sm text-slate-400">{correlationRules.length} rules</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {correlationRules.slice(0, 6).map((rule) => (
              <div
                key={rule.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-white font-semibold text-sm mb-1">{rule.rule_name}</h4>
                    <p className="text-slate-400 text-xs mb-3 line-clamp-2">{rule.rule_description}</p>
                  </div>
                  <button
                    onClick={() => {
                      const fakePattern = {
                        pattern_name: rule.rule_name,
                        description: rule.rule_description,
                        event_sequence: rule.rule_logic?.conditions?.find((c: any) => c.type === 'sequence')?.events || [],
                        is_anomaly: rule.tags?.includes('anomaly'),
                        pattern_type: rule.tags?.find((t: string) => t !== 'ai_generated' && t !== 'anomaly' && t !== 'known_pattern') || 'threat_sequence',
                      };
                      const converted = convertAgentRuleToAIGeneratedRule(rule, fakePattern);
                      setDacRule(converted);
                      setShowDaCInspector(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-cyan-500/20 text-slate-500 hover:text-cyan-400 transition-colors flex-shrink-0"
                    title="Inspect DaC Logic"
                  >
                    <FileCode className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      rule.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      rule.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      rule.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {rule.severity}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      rule.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      rule.status === 'testing' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {rule.status}
                    </span>
                  </div>
                  {rule.generated_by === 'ai_agent' && (
                    <Bot className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Confidence: {rule.confidence_score}%</span>
                  <span className="text-slate-500">Triggers: {rule.trigger_count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPattern && (
        <PatternDetailsModal
          pattern={selectedPattern}
          onClose={() => setSelectedPattern(null)}
          onGenerateRule={async (pattern) => {
            const agentRule = await aiCorrelationAgent.analyzePatternAndGenerateRule(pattern);
            if (agentRule) {
              const converted = convertAgentRuleToAIGeneratedRule(agentRule, pattern);
              setDacRule(converted);
              setShowDaCInspector(true);
            }
          }}
        />
      )}

      {showDaCInspector && dacRule && (
        <DaCInspectorModal
          rule={dacRule}
          onClose={() => {
            setShowDaCInspector(false);
            setDacRule(null);
          }}
          onRuleSaved={async () => {
            await loadCorrelationRules();
            await loadAgentStats();
            setSelectedPattern(null);
          }}
        />
      )}
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) => {
  const colorClasses: Record<string, string> = {
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    red: 'bg-red-500/20 border-red-500/30 text-red-400',
    yellow: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-sm">{title}</p>
        {icon}
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
};

const PatternDetailsModal = ({ pattern, onClose, onGenerateRule }: { pattern: any; onClose: () => void; onGenerateRule: (pattern: any) => Promise<void> }) => {
  const [generating, setGenerating] = useState(false);

  const handleGenerateRule = async () => {
    setGenerating(true);
    await onGenerateRule(pattern);
    setGenerating(false);
  };
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-semibold text-white">{pattern.pattern_name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-slate-400 text-sm">Description</label>
            <p className="text-white mt-1">{pattern.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-slate-400 text-sm">Pattern Type</label>
              <p className="text-white mt-1 capitalize">{pattern.pattern_type.replace('_', ' ')}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Threat Level</label>
              <p className="text-white mt-1 capitalize">{pattern.threat_level}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Occurrences</label>
              <p className="text-white mt-1">{pattern.occurrence_count}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Confidence Score</label>
              <p className="text-white mt-1">{pattern.confidence_score}%</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">First Seen</label>
              <p className="text-white mt-1">{new Date(pattern.first_seen).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-slate-400 text-sm">Last Seen</label>
              <p className="text-white mt-1">{new Date(pattern.last_seen).toLocaleString()}</p>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">Event Sequence</label>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex flex-wrap gap-2">
                {pattern.event_sequence.map((event: string, idx: number) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded">{event}</span>
                    {idx < pattern.event_sequence.length - 1 && (
                      <span className="text-slate-500">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {pattern.is_baseline && (
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-sm">Baseline Pattern</span>
            )}
            {pattern.is_anomaly && (
              <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm">Anomaly</span>
            )}
            {pattern.rule_created && (
              <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded text-sm">Rule Created</span>
            )}
          </div>

          <div className="flex space-x-3 pt-4 border-t border-slate-800">
            <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              Investigate Pattern
            </button>
            <button
              onClick={handleGenerateRule}
              disabled={generating}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Zap className="w-4 h-4" />
              <span>{generating ? 'Generating...' : 'Generate Rule (AI)'}</span>
            </button>
            <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors">
              Mark as False Positive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatternDiscoveryPanel;
