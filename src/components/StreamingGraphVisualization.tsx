import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, GitBranch, AlertTriangle, Network, Zap, TrendingUp, Database, Link2, Clock, Cpu, Brain, Sliders, Target, Shield, Eye, CheckCircle, XCircle, Radio } from 'lucide-react';
import CEPLiveGraph from './CEPLiveGraph';
import RealTimeGraphStreaming from './RealTimeGraphStreaming';
import { enrichAttackSteps, PHASE_COLORS, SEVERITY_COLORS, type EnrichedAttackStep } from '../lib/cepAttackEnrichment';

interface GraphVertex {
  vertex_id: string;
  vertex_type: string;
  properties: any;
  risk_score: number;
  is_active: boolean;
}

interface GraphEdge {
  edge_id: string;
  source_vertex_id: string;
  target_vertex_id: string;
  edge_type: string;
  is_suspicious: boolean;
  confidence_score: number;
}

interface CEPMatch {
  pattern_id: number;
  match_id: string;
  severity: string;
  confidence_score: number;
  match_details: any;
  created_at: string;
}

export default function StreamingGraphVisualization() {
  const [activeTab, setActiveTab] = useState<'graph' | 'cep' | 'realtime'>('graph');
  const [vertices, setVertices] = useState<GraphVertex[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [cepMatches, setCepMatches] = useState<CEPMatch[]>([]);
  const [stats, setStats] = useState({
    vertexCount: 0,
    edgeCount: 0,
    suspiciousCount: 0,
    highRiskVertices: 0,
    avgConfidence: 0
  });
  const [selectedVertex, setSelectedVertex] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCEPPattern, setSelectedCEPPattern] = useState<CEPMatch | null>(null);
  const [showCEPModal, setShowCEPModal] = useState(false);
  const [showRuleCreator, setShowRuleCreator] = useState(false);
  const [patternViewMode, setPatternViewMode] = useState<'sequence' | 'graph'>('sequence');
  const [correlationRuleName, setCorrelationRuleName] = useState('');
  const [correlationRuleDesc, setCorrelationRuleDesc] = useState('');
  const [showSimilarityConfig, setShowSimilarityConfig] = useState(true);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.75);
  const [timeDecay, setTimeDecay] = useState(0.95);
  const [maxSimilarResults, setMaxSimilarResults] = useState(10);
  const [similarPatterns, setSimilarPatterns] = useState<(CEPMatch & { similarity: number })[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [animatingPattern, setAnimatingPattern] = useState(false);
  const [enrichedSteps, setEnrichedSteps] = useState<EnrichedAttackStep[]>([]);
  const [ruleCreating, setRuleCreating] = useState(false);
  const [ruleSuccess, setRuleSuccess] = useState(false);

  useEffect(() => {
    loadGraphData();
    const interval = setInterval(loadGraphData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadGraphData = async () => {
    try {
      setLoading(true);
      const [verticesRes, edgesRes, cepRes] = await Promise.all([
        supabase.from('streaming_graph_vertices').select('*').eq('is_active', true).order('risk_score', { ascending: false }).limit(50),
        supabase.from('streaming_graph_edges').select('*').limit(100),
        supabase.from('cep_pattern_matches').select('*').order('created_at', { ascending: false }).limit(15)
      ]);

      if (verticesRes.data) {
        setVertices(verticesRes.data);
        const highRisk = verticesRes.data.filter(v => v.risk_score > 7).length;

        if (edgesRes.data) {
          setEdges(edgesRes.data);
          const suspicious = edgesRes.data.filter(e => e.is_suspicious).length;
          const avgConf = edgesRes.data.reduce((acc, e) => acc + e.confidence_score, 0) / edgesRes.data.length;

          setStats({
            vertexCount: verticesRes.data.length,
            edgeCount: edgesRes.data.length,
            suspiciousCount: suspicious,
            highRiskVertices: highRisk,
            avgConfidence: avgConf * 100
          });
        }
      }
      if (cepRes.data) setCepMatches(cepRes.data);
    } catch (error) {
      console.error('Error loading graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-300';
      case 'high': return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      default: return 'text-blue-700 bg-blue-100 border-blue-300';
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 8) return 'bg-red-500';
    if (score >= 6) return 'bg-orange-500';
    if (score >= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getVertexConnections = (vertexId: string) => {
    return edges.filter(e => e.source_vertex_id === vertexId || e.target_vertex_id === vertexId);
  };

  const vertexTypeColors: Record<string, string> = {
    'user': 'bg-blue-500',
    'ip_address': 'bg-purple-500',
    'domain': 'bg-green-500',
    'process': 'bg-orange-500',
    'file': 'bg-pink-500',
    'device': 'bg-teal-500',
    'application': 'bg-indigo-500',
  };

  const getVertexColor = (type: string) => {
    return vertexTypeColors[type] || 'bg-slate-500';
  };

  const findSimilarPatterns = (pattern: CEPMatch) => {
    setLoadingSimilar(true);
    setTimeout(() => {
      const scored = cepMatches
        .filter(m => m.match_id !== pattern.match_id)
        .map(m => {
          let score = 0;
          if (m.severity === pattern.severity) score += 0.3;
          else if (
            (m.severity === 'critical' && pattern.severity === 'high') ||
            (m.severity === 'high' && pattern.severity === 'critical')
          ) score += 0.15;
          const confDiff = Math.abs(m.confidence_score - pattern.confidence_score);
          score += Math.max(0, 0.25 * (1 - confDiff * 5));
          const pName = pattern.match_details?.pattern?.toLowerCase() || '';
          const mName = m.match_details?.pattern?.toLowerCase() || '';
          if (pName && mName) {
            const pWords = pName.split(/\s+/);
            const mWords = mName.split(/\s+/);
            const overlap = pWords.filter((w: string) => mWords.includes(w)).length;
            score += 0.35 * (overlap / Math.max(pWords.length, mWords.length, 1));
          }
          const timeDiff = Math.abs(new Date(m.created_at).getTime() - new Date(pattern.created_at).getTime()) / 3600000;
          score += 0.1 * Math.pow(timeDecay, timeDiff);
          return { ...m, similarity: Math.min(score, 1) };
        })
        .filter(m => m.similarity >= similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxSimilarResults);
      setSimilarPatterns(scored);
      setLoadingSimilar(false);
    }, 800);
  };

  const handleCEPPatternClick = (match: CEPMatch) => {
    setSelectedCEPPattern(match);
    setShowCEPModal(true);
    setShowRuleCreator(false);
    setRuleSuccess(false);
    setAnimatingPattern(true);
    setTimeout(() => setAnimatingPattern(false), 600);
    const vectors = match.match_details?.attack_vector || [];
    if (vectors.length > 0) {
      setEnrichedSteps(enrichAttackSteps(vectors, match.created_at, match.severity));
    } else {
      setEnrichedSteps([]);
    }
    findSimilarPatterns(match);
  };

  const handleCreateCorrelationRule = async () => {
    if (!selectedCEPPattern) return;
    setRuleCreating(true);
    setRuleSuccess(false);

    try {
      const ruleName = correlationRuleName || `Auto-generated from Pattern #${selectedCEPPattern.pattern_id}`;
      const ruleDesc = correlationRuleDesc || generateRuleDescription(selectedCEPPattern);
      const attackVector = selectedCEPPattern.match_details?.attack_vector || [];

      const { error } = await supabase
        .from('correlation_rules')
        .insert({
          rule_name: ruleName,
          rule_description: ruleDesc,
          severity: selectedCEPPattern.severity,
          status: 'active',
          confidence_score: selectedCEPPattern.confidence_score,
          generated_by: 'cep-pattern-engine',
          agent_reasoning: `Rule auto-generated from CEP pattern match: ${selectedCEPPattern.match_details?.pattern || 'Unknown'}. Confidence: ${(selectedCEPPattern.confidence_score * 100).toFixed(0)}%.`,
          rule_logic: {
            conditions: [
              {
                type: 'sequence',
                events: attackVector,
                time_window: '1 hour',
                order: 'sequential'
              },
              {
                type: 'threshold',
                field: 'confidence_score',
                operator: '>=',
                value: selectedCEPPattern.confidence_score
              }
            ],
            actions: [
              { type: 'create_alert', severity: selectedCEPPattern.severity, title: `Detected: ${selectedCEPPattern.match_details?.pattern}` },
              { type: 'enrich_events', add_tags: [`cep:${selectedCEPPattern.match_id}`, 'auto_correlation'] }
            ]
          },
          tags: ['cep-generated', selectedCEPPattern.severity, selectedCEPPattern.match_details?.pattern?.split(' ')[0]?.toLowerCase() || 'unknown']
        });

      if (error) throw error;

      setRuleSuccess(true);
      setCorrelationRuleName('');
      setCorrelationRuleDesc('');
      setTimeout(() => {
        setShowRuleCreator(false);
        setRuleSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error creating correlation rule:', error);
      setRuleSuccess(false);
    } finally {
      setRuleCreating(false);
    }
  };

  const generateRuleDescription = (pattern: CEPMatch) => {
    const events = pattern.match_details?.events || [];
    if (events.length > 0) {
      const eventTypes = events.map((e: any) => e.type || 'event').join(' → ');
      return `Detects pattern: ${eventTypes}. Confidence threshold: ${(pattern.confidence_score * 100).toFixed(0)}%. ${pattern.match_details?.description || ''}`;
    }
    return `Correlation rule based on ${pattern.match_details?.pattern || 'CEP pattern'} with ${(pattern.confidence_score * 100).toFixed(0)}% confidence threshold`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Streaming Graph Analytics</h2>
        </div>
        <div className="flex gap-3">
          <div className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Live Streaming
          </div>
          {loading && (
            <div className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2">
              <Cpu className="w-4 h-4 animate-spin" />
              Processing
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
        <button
          onClick={() => setActiveTab('graph')}
          className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
            activeTab === 'graph'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Network className="w-5 h-5" />
          Graph View
        </button>
        <button
          onClick={() => setActiveTab('cep')}
          className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
            activeTab === 'cep'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Zap className="w-5 h-5" />
          CEP Live Graph
        </button>
        <button
          onClick={() => setActiveTab('realtime')}
          className={`flex-1 px-6 py-3 font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
            activeTab === 'realtime'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Radio className="w-5 h-5" />
          Real-Time Graph Streaming
        </button>
      </div>

      {activeTab === 'cep' ? (
        <CEPLiveGraph />
      ) : activeTab === 'realtime' ? (
        <RealTimeGraphStreaming />
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Network className="w-10 h-10 opacity-80" />
                <TrendingUp className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-sm font-medium opacity-90 mb-1">Active Vertices</p>
              <p className="text-4xl font-bold">{stats.vertexCount}</p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <GitBranch className="w-10 h-10 opacity-80" />
                <Link2 className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-sm font-medium opacity-90 mb-1">Relationships</p>
              <p className="text-4xl font-bold">{stats.edgeCount}</p>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className="w-10 h-10 opacity-80" />
                <Activity className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-sm font-medium opacity-90 mb-1">Suspicious Links</p>
              <p className="text-4xl font-bold">{stats.suspiciousCount}</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Database className="w-10 h-10 opacity-80" />
                <AlertTriangle className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-sm font-medium opacity-90 mb-1">High Risk</p>
              <p className="text-4xl font-bold">{stats.highRiskVertices}</p>
            </div>

            <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <Zap className="w-10 h-10 opacity-80" />
                <Clock className="w-5 h-5 opacity-60" />
              </div>
              <p className="text-sm font-medium opacity-90 mb-1">Avg Confidence</p>
              <p className="text-4xl font-bold">{stats.avgConfidence.toFixed(0)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Entity Vertices</h3>
                    <p className="text-sm text-slate-600 mt-1">28+ entity types tracked in real-time</p>
                  </div>
                  <div className="px-3 py-1 bg-white rounded-lg border border-slate-200 text-sm font-semibold text-slate-700">
                    {vertices.length} Active
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {vertices.map((vertex) => {
                    const connections = getVertexConnections(vertex.vertex_id);
                    const isSelected = selectedVertex === vertex.vertex_id;

                    return (
                      <div
                        key={vertex.vertex_id}
                        onClick={() => setSelectedVertex(isSelected ? null : vertex.vertex_id)}
                        className={`border-2 rounded-lg p-4 transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50 shadow-md'
                            : 'border-slate-200 hover:border-slate-400 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${getVertexColor(vertex.vertex_type)}`} />
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              {vertex.vertex_id.substring(0, 12)}...
                            </span>
                          </div>
                          <span className={`px-3 py-1 rounded-md text-xs font-bold ${getVertexColor(vertex.vertex_type)} text-white`}>
                            {vertex.vertex_type.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-700">
                            Risk Score: {vertex.risk_score.toFixed(1)}/10
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${getRiskColor(vertex.risk_score)}`}
                                style={{ width: `${vertex.risk_score * 10}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Link2 className="w-4 h-4" />
                              <span className="font-semibold">{connections.length} Connections</span>
                            </div>
                            {connections.length > 0 && (
                              <div className="space-y-1">
                                {connections.slice(0, 3).map((edge) => (
                                  <div key={edge.edge_id} className="flex items-center gap-2 text-xs bg-slate-100 rounded px-2 py-1">
                                    <span className={`w-2 h-2 rounded-full ${edge.is_suspicious ? 'bg-red-500' : 'bg-green-500'}`} />
                                    <span className="text-slate-700">{edge.edge_type}</span>
                                    <span className="text-slate-500">({(edge.confidence_score * 100).toFixed(0)}%)</span>
                                  </div>
                                ))}
                                {connections.length > 3 && (
                                  <div className="text-xs text-slate-500 italic pl-2">
                                    +{connections.length - 3} more connections
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">CEP Pattern Matches</h3>
                    <p className="text-sm text-slate-600 mt-1">Complex event processing detections</p>
                  </div>
                  <Zap className="w-6 h-6 text-amber-500" />
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {cepMatches.map((match) => (
                    <div
                      key={match.match_id}
                      onClick={() => handleCEPPatternClick(match)}
                      className={`rounded-lg p-4 border-2 transition-all hover:shadow-lg cursor-pointer hover:scale-[1.02] ${getSeverityColor(match.severity)}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-3 py-1 rounded-md text-xs font-bold border-2 ${
                          match.severity === 'critical' ? 'bg-red-600 text-white border-red-700' :
                          match.severity === 'high' ? 'bg-orange-600 text-white border-orange-700' :
                          match.severity === 'medium' ? 'bg-yellow-600 text-white border-yellow-700' :
                          'bg-blue-600 text-white border-blue-700'
                        }`}>
                          {match.severity.toUpperCase()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-slate-600" />
                          <span className="text-sm font-bold text-slate-700">
                            {(match.confidence_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <p className="text-sm font-bold text-slate-900 mb-2">
                        {match.match_details?.pattern || `Pattern #${match.pattern_id}`}
                      </p>

                      {match.match_details?.description && (
                        <p className="text-xs text-slate-700 mb-2 leading-relaxed">
                          {match.match_details.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-300">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(match.created_at).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          Pattern ID: {match.pattern_id}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-xl p-8 border border-slate-700">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Activity className="w-7 h-7 text-emerald-400" />
              Graph Processing Capabilities
            </h3>
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center hover:bg-white/15 transition-all">
                <Clock className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-white mb-2">~10s</p>
                <p className="text-sm text-slate-300 font-medium">Update Latency</p>
                <p className="text-xs text-slate-400 mt-1">Real-time processing</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center hover:bg-white/15 transition-all">
                <Database className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-white mb-2">28+</p>
                <p className="text-sm text-slate-300 font-medium">Entity Types</p>
                <p className="text-xs text-slate-400 mt-1">Comprehensive coverage</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center hover:bg-white/15 transition-all">
                <Zap className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-white mb-2">Real-Time</p>
                <p className="text-sm text-slate-300 font-medium">CEP Detection</p>
                <p className="text-xs text-slate-400 mt-1">Complex event patterns</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20 text-center hover:bg-white/15 transition-all">
                <Network className="w-8 h-8 text-purple-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-white mb-2">Streaming</p>
                <p className="text-sm text-slate-300 font-medium">Graph Updates</p>
                <p className="text-xs text-slate-400 mt-1">Continuous analysis</p>
              </div>
            </div>
          </div>
        </>
      )}

      {showCEPModal && selectedCEPPattern && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowCEPModal(false)}>
          <div
            className={`bg-[#0c1222] border border-slate-700/50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-hidden transition-all duration-500 ${animatingPattern ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-slate-900 via-[#0f1a2e] to-slate-900 px-8 py-5 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <Zap className="w-7 h-7 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">CEP Pattern Analysis</h3>
                    <p className="text-slate-400 text-sm mt-0.5">Complex Event Processing -- Deep Pattern Inspection</p>
                  </div>
                </div>
                <button onClick={() => setShowCEPModal(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                  <Activity className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(92vh-80px)] space-y-5 custom-scrollbar">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Severity', value: selectedCEPPattern.severity.toUpperCase(), color: selectedCEPPattern.severity === 'critical' ? 'red' : selectedCEPPattern.severity === 'high' ? 'orange' : 'amber', icon: <AlertTriangle className="w-4 h-4" /> },
                  { label: 'Confidence', value: `${(selectedCEPPattern.confidence_score * 100).toFixed(0)}%`, color: 'emerald', icon: <Shield className="w-4 h-4" /> },
                  { label: 'Pattern ID', value: `#${selectedCEPPattern.pattern_id}`, color: 'blue', icon: <Target className="w-4 h-4" /> },
                  { label: 'Similar Found', value: loadingSimilar ? '...' : `${similarPatterns.length}`, color: 'cyan', icon: <Eye className="w-4 h-4" /> },
                ].map((stat, i) => (
                  <div key={i} className={`bg-${stat.color}-500/5 border border-${stat.color}-500/20 rounded-xl p-4`}>
                    <div className={`text-${stat.color}-400 mb-2`}>{stat.icon}</div>
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white">Similarity Rule Configuration</h4>
                  </div>
                  <button
                    onClick={() => { setShowSimilarityConfig(!showSimilarityConfig); }}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {showSimilarityConfig ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {showSimilarityConfig && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[11px] text-slate-400">Similarity Threshold</label>
                        <span className="text-[11px] text-cyan-400 font-mono font-semibold">{(similarityThreshold * 100).toFixed(0)}%</span>
                      </div>
                      <input type="range" min="0.50" max="0.99" step="0.01" value={similarityThreshold}
                        onChange={e => setSimilarityThreshold(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500" />
                      <p className="text-[9px] text-slate-600 mt-1">Minimum cosine similarity for pattern match</p>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[11px] text-slate-400">Time Decay Factor</label>
                        <span className="text-[11px] text-cyan-400 font-mono font-semibold">{timeDecay.toFixed(2)}</span>
                      </div>
                      <input type="range" min="0.80" max="1.00" step="0.01" value={timeDecay}
                        onChange={e => setTimeDecay(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500" />
                      <p className="text-[9px] text-slate-600 mt-1">Exponential decay for temporal relevance</p>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[11px] text-slate-400">Max Results</label>
                        <span className="text-[11px] text-cyan-400 font-mono font-semibold">{maxSimilarResults}</span>
                      </div>
                      <input type="range" min="3" max="25" step="1" value={maxSimilarResults}
                        onChange={e => setMaxSimilarResults(parseInt(e.target.value))}
                        className="w-full accent-cyan-500" />
                      <p className="text-[9px] text-slate-600 mt-1">Maximum similar patterns to return</p>
                    </div>
                  </div>
                )}
                {showSimilarityConfig && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => selectedCEPPattern && findSimilarPatterns(selectedCEPPattern)}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <Target className="w-3.5 h-3.5" /> Re-scan Similar Patterns
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-slate-400" />
                    <h4 className="text-sm font-bold text-white">Attack Chain Visualization</h4>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700/50">{enrichedSteps.length} steps</span>
                  </div>
                  <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                    <button onClick={() => setPatternViewMode('sequence')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${patternViewMode === 'sequence' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      Sequence
                    </button>
                    <button onClick={() => setPatternViewMode('graph')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${patternViewMode === 'graph' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      Graph View
                    </button>
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl border border-slate-700/30 overflow-hidden">
                  {patternViewMode === 'sequence' ? (
                    <div className="p-5 space-y-0 max-h-[420px] overflow-y-auto custom-scrollbar">
                      {enrichedSteps.map((step, idx) => {
                        const phaseColor = PHASE_COLORS[step.phase] || '#3b82f6';
                        const sevColor = SEVERITY_COLORS[step.severity] || '#3b82f6';
                        return (
                          <div key={idx}>
                            <div className="flex items-start gap-4 group">
                              <div className="flex flex-col items-center flex-shrink-0">
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ring-4 transition-all group-hover:scale-110"
                                  style={{ backgroundColor: sevColor, ringColor: `${sevColor}33` }}
                                >
                                  {idx + 1}
                                </div>
                                {idx < enrichedSteps.length - 1 && (
                                  <div className="w-0.5 h-6 mt-1" style={{ background: `linear-gradient(to bottom, ${sevColor}99, transparent)` }} />
                                )}
                              </div>
                              <div className="flex-1 pb-3 min-w-0">
                                <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/30 hover:border-slate-600/50 transition-all group-hover:bg-slate-800/80">
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0 flex-1">
                                      <span className="font-semibold text-white text-sm block truncate">{step.name}</span>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase text-white" style={{ backgroundColor: phaseColor }}>{step.tactic}</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-slate-700/80 text-slate-300 border border-slate-600/50">{step.technique}</span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 flex-shrink-0 mt-0.5">{new Date(step.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
                                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-700/30">
                                    <span className="text-[9px] font-mono text-slate-600">src: {step.source}</span>
                                    <span className="text-[9px] font-mono text-slate-600">phase: {step.phase}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ color: sevColor, backgroundColor: `${sevColor}15`, border: `1px solid ${sevColor}30` }}>{step.severity}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="relative overflow-x-auto">
                      <div className="p-4 min-w-[800px]" style={{ minHeight: `${Math.max(400, Math.ceil(enrichedSteps.length / 5) * 160 + 100)}px` }}>
                        <svg className="w-full h-full" viewBox={`0 0 900 ${Math.max(400, Math.ceil(enrichedSteps.length / 5) * 160 + 100)}`} preserveAspectRatio="xMidYMid meet">
                          <defs>
                            <marker id="arrowDark" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                            </marker>
                            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                              <feGaussianBlur stdDeviation="4" result="blur" />
                              <feFlood floodColor="#3b82f640" result="color" />
                              <feComposite in="color" in2="blur" operator="in" result="glow" />
                              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                          </defs>
                          {enrichedSteps.map((step, idx) => {
                            const cols = 5;
                            const row = Math.floor(idx / cols);
                            const col = row % 2 === 0 ? idx % cols : cols - 1 - (idx % cols);
                            const xSpacing = 160;
                            const ySpacing = 140;
                            const x = 90 + col * xSpacing;
                            const y = 70 + row * ySpacing;
                            const phaseColor = PHASE_COLORS[step.phase] || '#3b82f6';
                            const sevColor = SEVERITY_COLORS[step.severity] || '#3b82f6';

                            let nx: number | null = null;
                            let ny: number | null = null;
                            if (idx < enrichedSteps.length - 1) {
                              const nRow = Math.floor((idx + 1) / cols);
                              const nCol = nRow % 2 === 0 ? (idx + 1) % cols : cols - 1 - ((idx + 1) % cols);
                              nx = 90 + nCol * xSpacing;
                              ny = 70 + nRow * ySpacing;
                            }

                            const label = step.name.length > 18 ? step.name.substring(0, 16) + '...' : step.name;
                            const tacticLabel = step.tactic.length > 20 ? step.tactic.substring(0, 18) + '...' : step.tactic;

                            return (
                              <g key={idx}>
                                {nx !== null && ny !== null && (
                                  <>
                                    <line x1={x} y1={y} x2={nx} y2={ny} stroke="#475569" strokeWidth="1.5" strokeDasharray="5,3" markerEnd="url(#arrowDark)" opacity="0.6" />
                                    <circle r="2.5" fill={phaseColor} opacity="0.9">
                                      <animateMotion dur={`${1.5 + idx * 0.1}s`} repeatCount="indefinite" path={`M${x},${y} L${nx},${ny}`} />
                                    </circle>
                                  </>
                                )}
                                <circle cx={x} cy={y} r="24" fill={sevColor} opacity="0.15" />
                                <circle cx={x} cy={y} r="24" fill="none" stroke={sevColor} strokeWidth="1" opacity="0.3">
                                  <animate attributeName="r" values="24;30;24" dur={`${3 + idx * 0.2}s`} repeatCount="indefinite" />
                                  <animate attributeName="opacity" values="0.3;0.05;0.3" dur={`${3 + idx * 0.2}s`} repeatCount="indefinite" />
                                </circle>
                                <circle cx={x} cy={y} r="20" fill={phaseColor} stroke={sevColor} strokeWidth="2" filter="url(#nodeGlow)" opacity="0.95" />
                                <text x={x} y={y} textAnchor="middle" dy="0.4em" fill="white" fontWeight="bold" fontSize="12">{idx + 1}</text>
                                <text x={x} y={y + 32} textAnchor="middle" fill="#e2e8f0" fontWeight="600" fontSize="9">{label}</text>
                                <text x={x} y={y + 44} textAnchor="middle" fill={phaseColor} fontWeight="500" fontSize="8">{tacticLabel}</text>
                                <text x={x} y={y - 30} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">{step.severity.toUpperCase()}</text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                      <div className="px-5 pb-4 flex flex-wrap gap-2">
                        {Object.entries(PHASE_COLORS).filter(([phase]) => enrichedSteps.some(s => s.phase === phase)).map(([phase, color]) => (
                          <div key={phase} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-[9px] text-slate-400 capitalize">{phase.replace('-', ' ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {similarPatterns.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white">Similar Patterns ({similarPatterns.length})</h4>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {similarPatterns.map((sp) => {
                      const sevColor = sp.severity === 'critical' ? 'red' : sp.severity === 'high' ? 'orange' : 'amber';
                      return (
                        <button
                          key={sp.match_id}
                          onClick={() => handleCEPPatternClick(sp)}
                          className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-left hover:border-cyan-500/40 transition-all group"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-${sevColor}-500/15 text-${sevColor}-400 border border-${sevColor}-500/20`}>
                              {sp.severity}
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400 font-semibold">{(sp.similarity * 100).toFixed(0)}% match</span>
                          </div>
                          <p className="text-xs text-white font-semibold truncate">{sp.match_details?.pattern || `Pattern #${sp.pattern_id}`}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Confidence: {(sp.confidence_score * 100).toFixed(0)}%</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {loadingSimilar && (
                <div className="flex items-center justify-center py-6 gap-3">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">Scanning for similar patterns...</span>
                </div>
              )}

              {showRuleCreator && (
                <div className="bg-slate-800/40 border border-blue-500/30 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-blue-400" />
                      <h4 className="text-sm font-bold text-white">Create Correlation Rule</h4>
                    </div>
                    <button onClick={() => setShowRuleCreator(false)} className="text-slate-400 hover:text-white transition-colors">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  {ruleSuccess ? (
                    <div className="flex items-center gap-3 py-6 justify-center">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Correlation rule created successfully</span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">Rule Name</label>
                        <input
                          type="text"
                          value={correlationRuleName}
                          onChange={(e) => setCorrelationRuleName(e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                          placeholder="e.g., Detect Stuxnet-Style ICS Attack Chain"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">Description</label>
                        <textarea
                          value={correlationRuleDesc}
                          onChange={(e) => setCorrelationRuleDesc(e.target.value)}
                          rows={3}
                          className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
                          placeholder="Describe what this correlation rule detects..."
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Severity</div>
                          <div className="text-sm font-bold text-white capitalize">{selectedCEPPattern.severity}</div>
                        </div>
                        <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Attack Steps</div>
                          <div className="text-sm font-bold text-white">{enrichedSteps.length}</div>
                        </div>
                        <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Confidence</div>
                          <div className="text-sm font-bold text-white">{(selectedCEPPattern.confidence_score * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowRuleCreator(false)}
                          className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-semibold transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateCorrelationRule}
                          disabled={ruleCreating}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ruleCreating ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" />
                              Create Rule
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
                <p className="text-xs text-slate-500">
                  {showRuleCreator ? 'Configure and save the correlation rule above' : 'Create a detection rule from this pattern or explore similar matches'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { setShowCEPModal(false); setShowRuleCreator(false); }}
                    className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-semibold transition-all">
                    Close
                  </button>
                  {!showRuleCreator && (
                    <button onClick={() => { setShowRuleCreator(true); setCorrelationRuleName(`Detect ${selectedCEPPattern.match_details?.pattern || 'Pattern'}`); setCorrelationRuleDesc(generateRuleDescription(selectedCEPPattern)); }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5">
                      <Brain className="w-4 h-4" /> Create Rule
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
