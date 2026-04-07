import { useState, useEffect } from 'react';
import { Activity, Target, Cpu, Zap, TrendingUp, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FuzzingCampaign {
  id: string;
  campaign_name: string;
  fuzzer_type: string;
  target_type: string;
  target_name: string;
  status: string;
  total_executions: number;
  executions_per_second: number;
  total_crashes: number;
  unique_crashes: number;
  code_coverage_percent: number;
  start_time: string;
}

interface PentestCampaign {
  id: string;
  campaign_name: string;
  campaign_type: string;
  methodology: string;
  agent_model: string;
  status: string;
  targets_count: number;
  vulnerabilities_found: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  exploited_count: number;
  risk_score: number;
  start_time: string;
}

interface AITool {
  id: string;
  tool_name: string;
  tool_type: string;
  tool_purpose: string;
  target_vulnerability: string;
  programming_language: string;
  ai_model: string;
  effectiveness_score: number;
  success_rate: number;
  times_used: number;
  detection_rate: number;
}

interface AttackChain {
  id: string;
  chain_name: string;
  attack_scenario: string;
  initial_access_technique: string;
  current_stage: number;
  total_stages: number;
  success: boolean;
  start_time: string;
  duration_seconds: number;
  detection_events: number;
}

export default function RedTeamAutomation() {
  const [activeTab, setActiveTab] = useState<'fuzzing' | 'pentest' | 'ai_tools' | 'attack_chains'>('fuzzing');
  const [loading, setLoading] = useState(true);

  const [fuzzingCampaigns, setFuzzingCampaigns] = useState<FuzzingCampaign[]>([]);
  const [pentestCampaigns, setPentestCampaigns] = useState<PentestCampaign[]>([]);
  const [aiTools, setAiTools] = useState<AITool[]>([]);
  const [attackChains, setAttackChains] = useState<AttackChain[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      console.log('[RedTeam] Starting data load...');
      setLoading(true);

      const [fuzzRes, pentestRes, toolsRes, chainsRes] = await Promise.all([
        supabase.from('fuzzing_campaigns').select('*').order('start_time', { ascending: false }),
        supabase.from('pentest_campaigns').select('*').order('start_time', { ascending: false }),
        supabase.from('ai_generated_tools').select('*').order('effectiveness_score', { ascending: false }),
        supabase.from('attack_chains').select('*').order('start_time', { ascending: false })
      ]);

      console.log('[RedTeam] Data loaded:', {
        fuzzing: fuzzRes.data?.length || 0,
        pentest: pentestRes.data?.length || 0,
        tools: toolsRes.data?.length || 0,
        chains: chainsRes.data?.length || 0
      });

      if (fuzzRes.error) console.error('[RedTeam] Fuzzing error:', fuzzRes.error);
      if (pentestRes.error) console.error('[RedTeam] Pentest error:', pentestRes.error);
      if (toolsRes.error) console.error('[RedTeam] Tools error:', toolsRes.error);
      if (chainsRes.error) console.error('[RedTeam] Chains error:', chainsRes.error);

      const fuzzData = fuzzRes.data || [];
      const pentestData = pentestRes.data || [];
      const toolsData = toolsRes.data || [];
      const chainsData = chainsRes.data || [];

      console.log('[RedTeam] Setting state with data:', {
        fuzz: fuzzData.length,
        pentest: pentestData.length,
        tools: toolsData.length,
        chains: chainsData.length
      });

      setFuzzingCampaigns(fuzzData);
      setPentestCampaigns(pentestData);
      setAiTools(toolsData);
      setAttackChains(chainsData);

      setLoading(false);
      console.log('[RedTeam] Data load complete');
    } catch (error) {
      console.error('[RedTeam] Error loading data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'text-green-400';
      case 'running': case 'in_progress': return 'text-blue-400';
      case 'failed': return 'text-red-400';
      case 'paused': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const totalFuzzingExecs = fuzzingCampaigns.reduce((sum, c) => sum + (c.total_executions || 0), 0);
  const totalCrashes = fuzzingCampaigns.reduce((sum, c) => sum + (c.total_crashes || 0), 0);
  const totalVulns = pentestCampaigns.reduce((sum, c) => sum + (c.vulnerabilities_found || 0), 0);
  const totalCritical = pentestCampaigns.reduce((sum, c) => sum + (c.critical_findings || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-cyan-400 animate-pulse">Loading Red Team Automation...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Red Team Automation</h1>
          <p className="text-slate-400">AI-powered fuzzing, penetration testing, and autonomous exploitation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-8 h-8 text-yellow-400" />
            <span className="text-2xl font-bold text-white">{formatNumber(totalFuzzingExecs)}</span>
          </div>
          <div className="text-sm text-slate-400">Fuzzing Executions</div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <span className="text-2xl font-bold text-white">{totalCrashes}</span>
          </div>
          <div className="text-sm text-slate-400">Total Crashes Found</div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 text-orange-400" />
            <span className="text-2xl font-bold text-white">{totalVulns}</span>
          </div>
          <div className="text-sm text-slate-400">Vulnerabilities</div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <Shield className="w-8 h-8 text-red-500" />
            <span className="text-2xl font-bold text-white">{totalCritical}</span>
          </div>
          <div className="text-sm text-slate-400">Critical Findings</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('fuzzing')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'fuzzing'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                : 'text-slate-400 hover:text-white hover:bg-slate-750'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Fuzzing Campaigns</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('pentest')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'pentest'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                : 'text-slate-400 hover:text-white hover:bg-slate-750'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Target className="w-4 h-4" />
              <span>Penetration Testing</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('ai_tools')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'ai_tools'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                : 'text-slate-400 hover:text-white hover:bg-slate-750'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Cpu className="w-4 h-4" />
              <span>AI-Generated Tools</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('attack_chains')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'attack_chains'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900'
                : 'text-slate-400 hover:text-white hover:bg-slate-750'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-4 h-4" />
              <span>Attack Chains</span>
            </div>
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'fuzzing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Active Fuzzing Campaigns</h3>
                <span className="text-sm text-slate-400">{fuzzingCampaigns.length} campaigns</span>
              </div>

              {fuzzingCampaigns.length === 0 ? (
                <div className="text-center py-12 text-slate-400">No fuzzing campaigns found</div>
              ) : (
                <div className="space-y-3">
                  {fuzzingCampaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-cyan-500/50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-white font-medium">{campaign.campaign_name}</h4>
                          <p className="text-sm text-slate-400 mt-1">{campaign.target_type} - {campaign.target_name}</p>
                        </div>
                        <span className={`text-sm font-medium ${getStatusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-3">
                        <div>
                          <div className="text-xs text-slate-500">Fuzzer</div>
                          <div className="text-sm text-white font-medium">{campaign.fuzzer_type}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Executions</div>
                          <div className="text-sm text-cyan-400 font-medium">{formatNumber(campaign.total_executions)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Exec/sec</div>
                          <div className="text-sm text-green-400 font-medium">{campaign.executions_per_second?.toFixed(1)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Crashes</div>
                          <div className="text-sm text-red-400 font-medium">{campaign.total_crashes} ({campaign.unique_crashes} unique)</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Coverage</div>
                          <div className="text-sm text-yellow-400 font-medium">{campaign.code_coverage_percent?.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'pentest' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Penetration Testing Campaigns</h3>
                <span className="text-sm text-slate-400">{pentestCampaigns.length} campaigns</span>
              </div>

              {pentestCampaigns.length === 0 ? (
                <div className="text-center py-12 text-slate-400">No pentest campaigns found</div>
              ) : (
                <div className="space-y-3">
                  {pentestCampaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-orange-500/50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-white font-medium">{campaign.campaign_name}</h4>
                          <p className="text-sm text-slate-400 mt-1">
                            {campaign.campaign_type} - {campaign.methodology}
                            {campaign.agent_model && <span className="ml-2 text-cyan-400">({campaign.agent_model})</span>}
                          </p>
                        </div>
                        <span className={`text-sm font-medium ${getStatusColor(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-3">
                        <div>
                          <div className="text-xs text-slate-500">Targets</div>
                          <div className="text-sm text-white font-medium">{campaign.targets_count}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Critical</div>
                          <div className="text-sm text-red-400 font-medium">{campaign.critical_findings}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">High</div>
                          <div className="text-sm text-orange-400 font-medium">{campaign.high_findings}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Medium</div>
                          <div className="text-sm text-yellow-400 font-medium">{campaign.medium_findings}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Exploited</div>
                          <div className="text-sm text-purple-400 font-medium">{campaign.exploited_count}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Risk Score</div>
                          <div className="text-sm text-red-400 font-medium">{campaign.risk_score?.toFixed(1)}/10</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai_tools' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">AI-Generated Exploitation Tools</h3>
                <span className="text-sm text-slate-400">{aiTools.length} tools</span>
              </div>

              {aiTools.length === 0 ? (
                <div className="text-center py-12 text-slate-400">No AI tools found</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {aiTools.map((tool) => (
                    <div key={tool.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-purple-500/50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-white font-medium">{tool.tool_name}</h4>
                          <p className="text-xs text-slate-400 mt-1">{tool.tool_purpose}</p>
                        </div>
                        <span className="text-xs px-2 py-1 bg-slate-800 text-cyan-400 rounded">{tool.tool_type}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                        <div>
                          <div className="text-slate-500">Target</div>
                          <div className="text-white">{tool.target_vulnerability}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Language</div>
                          <div className="text-white">{tool.programming_language}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">AI Model</div>
                          <div className="text-cyan-400">{tool.ai_model}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Effectiveness</div>
                          <div className="text-green-400 font-medium">{tool.effectiveness_score?.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Success Rate</div>
                          <div className="text-yellow-400 font-medium">{tool.success_rate?.toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Times Used</div>
                          <div className="text-white font-medium">{tool.times_used}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'attack_chains' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Multi-Stage Attack Chains</h3>
                <span className="text-sm text-slate-400">{attackChains.length} chains</span>
              </div>

              {attackChains.length === 0 ? (
                <div className="text-center py-12 text-slate-400">No attack chains found</div>
              ) : (
                <div className="space-y-3">
                  {attackChains.map((chain) => (
                    <div key={chain.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-red-500/50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="text-white font-medium">{chain.chain_name}</h4>
                          <p className="text-sm text-slate-400 mt-1">{chain.attack_scenario}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {chain.success ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <Activity className="w-5 h-5 text-yellow-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all"
                            style={{ width: `${(chain.current_stage / chain.total_stages) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          Stage {chain.current_stage}/{chain.total_stages}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500">Initial Access</div>
                          <div className="text-white capitalize">{chain.initial_access_technique}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Duration</div>
                          <div className="text-cyan-400">{Math.floor(chain.duration_seconds / 60)}m</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Detections</div>
                          <div className="text-orange-400">{chain.detection_events}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Status</div>
                          <div className={chain.success ? 'text-green-400' : 'text-yellow-400'}>
                            {chain.success ? 'Success' : 'In Progress'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
