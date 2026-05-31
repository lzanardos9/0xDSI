import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, AlertTriangle, CheckCircle, Clock, Target, Zap, Activity, TrendingUp, Database, Lock, Eye, Network } from 'lucide-react';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

interface ThreatModel {
  id: string;
  name: string;
  description: string;
  model_type: 'physical' | 'logical' | 'hybrid';
  auto_generated: boolean;
  confidence_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  assets: any[];
  attack_vectors: any[];
  mitre_tactics: string[];
  mitre_techniques: string[];
  created_at: string;
}

interface ThreatScenario {
  id: string;
  threat_model_id: string;
  scenario_name: string;
  description: string;
  threat_type: string;
  likelihood: string;
  impact: string;
  risk_score: number;
  attack_chain: any[];
  affected_assets: string[];
  vulnerabilities: string[];
  indicators: string[];
}

interface Mitigation {
  id: string;
  scenario_id: string;
  mitigation_type: string;
  control_name: string;
  description: string;
  implementation_status: string;
  effectiveness: string;
  cost: string;
  priority: number;
  owner: string;
}

const SmartThreatModeling = () => {
  const [threatModels, setThreatModels] = useState<ThreatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ThreatModel | null>(null);
  const [scenarios, setScenarios] = useState<ThreatScenario[]>([]);
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ThreatScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  useEffect(() => {
    fetchThreatModels();
  }, []);

  useEffect(() => {
    if (selectedModel) {
      fetchScenarios(selectedModel.id);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (selectedScenario) {
      fetchMitigations(selectedScenario.id);
    }
  }, [selectedScenario]);

  const fetchThreatModels = async () => {
    try {
      const { data, error } = await supabase
        .from('threat_models')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setThreatModels(data || []);
    } catch (error) {
      console.error('Error fetching threat models:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScenarios = async (modelId: string) => {
    try {
      const { data, error } = await supabase
        .from('threat_scenarios')
        .select('*')
        .eq('threat_model_id', modelId)
        .order('risk_score', { ascending: false });

      if (error) throw error;
      setScenarios(data || []);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
    }
  };

  const fetchMitigations = async (scenarioId: string) => {
    try {
      const { data, error } = await supabase
        .from('threat_mitigations')
        .select('*')
        .eq('scenario_id', scenarioId)
        .order('priority', { ascending: true });

      if (error) throw error;
      setMitigations(data || []);
    } catch (error) {
      console.error('Error fetching mitigations:', error);
    }
  };

  const filteredModels = threatModels.filter(model => {
    if (filterType !== 'all' && model.model_type !== filterType) return false;
    if (filterSeverity !== 'all' && model.severity !== filterSeverity) return false;
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
      case 'low': return 'text-green-400 bg-green-500/20 border-green-500';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'physical': return <Lock className="w-4 h-4" />;
      case 'logical': return <Network className="w-4 h-4" />;
      case 'hybrid': return <Database className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'implemented': return 'text-green-400';
      case 'in_progress': return 'text-yellow-400';
      case 'planned': return 'text-slate-400';
      default: return 'text-slate-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white">Loading threat models...</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 text-white p-6 overflow-hidden flex flex-col">
      <MLModelExplainer {...ML_MODELS.smartThreatModeling} />

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center space-x-3">
              <Shield className="w-8 h-8 text-blue-400" />
              <span>Smart Threat Modeling</span>
            </h1>
            <p className="text-slate-400 mt-1">AI-powered threat model generation from security patterns and events</p>
          </div>
          <div className="flex items-center space-x-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
            <Activity className="w-5 h-5 text-green-400 animate-pulse" />
            <span className="text-green-400 font-semibold">Auto-Generation Active</span>
          </div>
        </div>

        <div className="flex space-x-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm"
          >
            <option value="all">All Types</option>
            <option value="physical">Physical</option>
            <option value="logical">Logical</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 gap-6 overflow-hidden">
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <Target className="w-5 h-5 text-blue-400" />
            <span>Threat Models</span>
            <span className="ml-auto text-sm text-slate-400">{filteredModels.length} models</span>
          </h2>
          <div className="space-y-3 overflow-y-auto flex-1">
            {filteredModels.map((model) => (
              <div
                key={model.id}
                onClick={() => setSelectedModel(model)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedModel?.id === model.id
                    ? 'bg-slate-700 border-blue-500'
                    : 'bg-slate-800/50 border-slate-700 hover:border-blue-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getTypeIcon(model.model_type)}
                    <span className="font-semibold text-sm">{model.name}</span>
                  </div>
                  {model.auto_generated && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded flex items-center space-x-1">
                      <Zap className="w-3 h-3" />
                      <span>Auto</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{model.description}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded border ${getSeverityColor(model.severity)}`}>
                    {model.severity}
                  </span>
                  <span className="text-xs text-slate-500">
                    Confidence: {model.confidence_score?.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-xs text-slate-500 capitalize">{model.model_type}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-500">{model.mitre_tactics?.length || 0} tactics</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <span>Threat Scenarios</span>
            {selectedModel && <span className="ml-auto text-sm text-slate-400">{scenarios.length} scenarios</span>}
          </h2>
          {!selectedModel ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a threat model to view scenarios
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto flex-1">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedScenario?.id === scenario.id
                      ? 'bg-slate-700 border-orange-500'
                      : 'bg-slate-800/50 border-slate-700 hover:border-orange-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-semibold text-sm">{scenario.scenario_name}</span>
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                      Risk: {scenario.risk_score}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">{scenario.description}</p>
                  <div className="flex items-center space-x-4 text-xs">
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="w-3 h-3 text-yellow-400" />
                      <span className="text-slate-400">Likelihood:</span>
                      <span className={getSeverityColor(scenario.likelihood).split(' ')[0]}>{scenario.likelihood}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Activity className="w-3 h-3 text-red-400" />
                      <span className="text-slate-400">Impact:</span>
                      <span className={getSeverityColor(scenario.impact).split(' ')[0]}>{scenario.impact}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {scenario.attack_chain?.length || 0} steps • {scenario.vulnerabilities?.length || 0} vulnerabilities
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-green-400" />
            <span>Mitigations</span>
            {selectedScenario && <span className="ml-auto text-sm text-slate-400">{mitigations.length} controls</span>}
          </h2>
          {!selectedScenario ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a scenario to view mitigations
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto flex-1">
              {mitigations.map((mitigation) => (
                <div
                  key={mitigation.id}
                  className="p-4 rounded-lg border bg-slate-800/50 border-slate-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {mitigation.implementation_status === 'implemented' && <CheckCircle className="w-4 h-4 text-green-400" />}
                      {mitigation.implementation_status === 'in_progress' && <Clock className="w-4 h-4 text-yellow-400" />}
                      {mitigation.implementation_status === 'planned' && <Eye className="w-4 h-4 text-slate-400" />}
                      <span className="font-semibold text-sm">{mitigation.control_name}</span>
                    </div>
                    <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">
                      P{mitigation.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{mitigation.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className={`capitalize ${getStatusColor(mitigation.implementation_status)}`}>
                        {mitigation.implementation_status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">Effectiveness:</span>
                      <span className={mitigation.effectiveness === 'high' ? 'text-green-400' : mitigation.effectiveness === 'medium' ? 'text-yellow-400' : 'text-slate-400'}>
                        {mitigation.effectiveness}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500 capitalize">{mitigation.mitigation_type}</span>
                    <span className="text-slate-500">Cost: {mitigation.cost}</span>
                  </div>
                  {mitigation.owner && (
                    <div className="mt-2 text-xs text-slate-500">Owner: {mitigation.owner}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedScenario && (
        <div className="mt-6 bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 flex items-center space-x-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <span>Attack Chain Analysis</span>
          </h3>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {selectedScenario.attack_chain?.map((step: any, idx: number) => (
              <div key={idx} className="min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-semibold">
                    Step {step.step}
                  </span>
                  <span className="text-xs font-semibold text-white">{step.action}</span>
                </div>
                <p className="text-xs text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartThreatModeling;
