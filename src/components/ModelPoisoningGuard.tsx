import { useState, useEffect } from 'react';
import {
  Shield, AlertTriangle, Brain, Database, CheckCircle, Clock,
  Lock, Play, ChevronDown, ChevronUp, RefreshCw, ShieldAlert,
  ShieldCheck, Fingerprint, FlaskConical, Gauge
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

interface MLModel {
  id: string;
  model_name: string;
  model_type: string;
  framework: string;
  version: string;
  training_data_source: string;
  training_samples: number;
  feature_count: number;
  accuracy_baseline: number;
  accuracy_current: number;
  drift_score: number;
  integrity_score: number;
  poisoning_risk: 'critical' | 'high' | 'medium' | 'low';
  status: 'healthy' | 'degraded' | 'compromised' | 'quarantined';
  owner: string;
  description: string;
  last_audit: string;
  deployed_at: string;
  created_at: string;
}

interface PoisoningDetection {
  id: string;
  model_id: string;
  detection_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  affected_samples: number;
  total_samples_checked: number;
  attack_vector: string;
  mitre_technique: string;
  description: string;
  llm_analysis: string;
  remediation: string;
  status: 'detected' | 'investigating' | 'mitigated' | 'false_positive';
  indicators: any;
  detected_at: string;
}

interface TrainingDataAudit {
  id: string;
  model_id: string;
  audit_type: string;
  dataset_name: string;
  total_samples: number;
  clean_samples: number;
  suspicious_samples: number;
  poisoned_samples: number;
  integrity_score: number;
  spectral_signature_score: number;
  distribution_anomaly_score: number;
  label_consistency_score: number;
  findings: string;
  audit_duration_ms: number;
  audited_at: string;
}

interface ModelSimulation {
  id: string;
  model_id: string;
  simulation_type: string;
  attack_strength: number;
  original_accuracy: number;
  poisoned_accuracy: number;
  accuracy_drop: number;
  detection_rate: number;
  false_positive_rate: number;
  samples_poisoned: number;
  total_samples: number;
  defense_method: string;
  defense_effectiveness: number;
  llm_explanation: string;
  simulation_duration_ms: number;
  simulated_at: string;
}

interface DefenseConfig {
  id: string;
  model_id: string;
  defense_type: string;
  enabled: boolean;
  sensitivity: number;
  auto_quarantine: boolean;
  alert_threshold: number;
  last_triggered: string;
  config_json: any;
  created_at: string;
}

type Tab = 'registry' | 'detections' | 'simulation' | 'integrity' | 'defense';

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/40',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
};

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  compromised: 'bg-red-500',
  quarantined: 'bg-red-700',
  detected: 'bg-red-400',
  investigating: 'bg-amber-400',
  mitigated: 'bg-emerald-400',
  false_positive: 'bg-slate-400',
};

const CircularGauge = ({ value, size = 64, stroke = 5, color = 'emerald' }: { value: number; size?: number; stroke?: number; color?: string }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const clr = value >= 80 ? 'stroke-emerald-400' : value >= 60 ? 'stroke-amber-400' : 'stroke-red-400';
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-700" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={`${clr} transition-all duration-1000 ease-out`}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

const MiniBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex-1">
    <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
  </div>
);

const ScoreBar = ({ label, value }: { label: string; value: number }) => {
  const clr = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-slate-400">{label}</span><span className="text-slate-300">{value.toFixed(1)}%</span></div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${clr} rounded-full transition-all duration-700`} style={{ width: `${value}%` }} /></div>
    </div>
  );
};

const Badge = ({ text, variant = 'default' }: { text: string; variant?: string }) => {
  const cls = SEV_COLORS[variant] || 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
  return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{text}</span>;
};

const FormattedText = ({ text }: { text: string }) => (
  <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
    {(text || '').split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
  </div>
);

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'registry', label: 'Model Registry', icon: Database },
  { key: 'detections', label: 'Poisoning Detections', icon: ShieldAlert },
  { key: 'simulation', label: 'Attack Simulation', icon: FlaskConical },
  { key: 'integrity', label: 'Data Integrity', icon: Fingerprint },
  { key: 'defense', label: 'Defense Config', icon: ShieldCheck },
];

const SIM_PHASES = [
  'Injecting poisoned samples...',
  'Measuring model degradation...',
  'Testing defense effectiveness...',
  'Generating analysis...',
];

export default function ModelPoisoningGuard() {
  const [tab, setTab] = useState<Tab>('registry');
  const [models, setModels] = useState<MLModel[]>([]);
  const [detections, setDetections] = useState<PoisoningDetection[]>([]);
  const [audits, setAudits] = useState<TrainingDataAudit[]>([]);
  const [simulations, setSimulations] = useState<ModelSimulation[]>([]);
  const [defenses, setDefenses] = useState<DefenseConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<MLModel | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simPhase, setSimPhase] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  const [simResult, setSimResult] = useState<any>(null);
  const [simConfig, setSimConfig] = useState({ modelId: '', attackType: 'label_flip', strength: 5 });
  const [poisonNodes, setPoisonNodes] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [mRes, dRes, aRes, sRes, dfRes] = await Promise.all([
      supabase.from('ml_model_registry').select('*').order('poisoning_risk'),
      supabase.from('poisoning_detections').select('*').order('detected_at', { ascending: false }),
      supabase.from('training_data_audits').select('*').order('audited_at', { ascending: false }),
      supabase.from('model_simulations').select('*').order('simulated_at', { ascending: false }),
      supabase.from('model_defense_configs').select('*').order('created_at'),
    ]);
    setModels(mRes.data || []);
    setDetections(dRes.data || []);
    setAudits(aRes.data || []);
    setSimulations(sRes.data || []);
    setDefenses(dfRes.data || []);
    if (mRes.data?.length && !simConfig.modelId) setSimConfig(c => ({ ...c, modelId: mRes.data![0].id }));
    setLoading(false);
  };

  const toggle = (id: string) => setExpandedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const modelName = (id: string) => models.find(m => m.id === id)?.model_name || 'Unknown';

  const runSimulation = () => {
    setSimRunning(true);
    setSimResult(null);
    setSimPhase(0);
    setSimProgress(0);
    setPoisonNodes(new Set());
    const totalNodes = 24;
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setSimProgress(progress);
      setSimPhase(Math.min(Math.floor(progress / 25), 3));
      if (progress < 80) {
        setPoisonNodes(prev => {
          const n = new Set(prev);
          const count = Math.floor((progress / 100) * totalNodes * (simConfig.strength / 10));
          while (n.size < count) n.add(Math.floor(Math.random() * totalNodes));
          return n;
        });
      }
      if (progress >= 100) {
        clearInterval(interval);
        const origAcc = 92 + Math.random() * 6;
        const drop = simConfig.strength * (0.3 + Math.random() * 0.4);
        setSimResult({
          attackType: simConfig.attackType,
          strength: simConfig.strength,
          originalAccuracy: origAcc,
          poisonedAccuracy: Math.max(origAcc - drop, 40),
          accuracyDrop: drop,
          detectionRate: 60 + Math.random() * 35,
          defenseEffectiveness: 55 + Math.random() * 40,
          samplesPoisoned: Math.floor(simConfig.strength * 50 + Math.random() * 200),
          analysis: `The ${simConfig.attackType.replace(/_/g, ' ')} attack at ${simConfig.strength}% strength resulted in a ${drop.toFixed(1)}% accuracy degradation. The attack targeted the model's decision boundaries by manipulating ${Math.floor(simConfig.strength * 50)} training samples. Defense mechanisms detected ${(60 + Math.random() * 35).toFixed(1)}% of poisoned inputs. Recommended action: increase spectral defense sensitivity and enable differential privacy with epsilon=0.1.`,
        });
        setSimRunning(false);
      }
    }, 50);
  };

  const stats = {
    total: models.length,
    atRisk: models.filter(m => m.poisoning_risk === 'critical' || m.poisoning_risk === 'high').length,
    activeDetections: detections.filter(d => d.status !== 'mitigated' && d.status !== 'false_positive').length,
    avgIntegrity: models.length ? models.reduce((s, m) => s + m.integrity_score, 0) / models.length : 0,
    activeDefenses: defenses.filter(d => d.enabled).length,
  };

  const statCards = [
    { label: 'Models Monitored', value: stats.total, icon: Database, color: 'text-cyan-400' },
    { label: 'Models at Risk', value: stats.atRisk, icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Active Detections', value: stats.activeDetections, icon: ShieldAlert, color: 'text-amber-400' },
    { label: 'Avg Integrity', value: `${stats.avgIntegrity.toFixed(1)}%`, icon: Gauge, color: 'text-emerald-400' },
    { label: 'Defenses Active', value: stats.activeDefenses, icon: ShieldCheck, color: 'text-cyan-400' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-slate-950">
      <div className="text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
        <p className="text-slate-400">Loading ML Poisoning Guard...</p>
      </div>
    </div>
  );

  return (
    <div className="h-full bg-slate-950 text-white overflow-auto">
      <div className="p-4 space-y-4">
        <MLModelExplainer {...ML_MODELS.modelPoisoningGuard} />

        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-cyan-400" />
          <div>
            <h1 className="text-xl font-bold">ML Model Poisoning Guard</h1>
            <p className="text-xs text-slate-400">Real-time monitoring of model integrity, poisoning detection, and defense orchestration</p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
              <div>
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-xs text-slate-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {tab === 'registry' && !selectedModel && (
          <div className="grid grid-cols-3 gap-3">
            {models.map(m => {
              const isPulsing = m.status === 'compromised' || m.status === 'degraded';
              return (
                <div key={m.id} onClick={() => setSelectedModel(m)}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-4 cursor-pointer hover:border-cyan-500/50 transition-all space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[m.status]} ${isPulsing ? 'animate-pulse' : ''}`} />
                        {m.model_name}
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Badge text={m.model_type} />
                        <Badge text={m.framework} />
                      </div>
                    </div>
                    <Badge text={m.poisoning_risk} variant={m.poisoning_risk} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <CircularGauge value={m.integrity_score} size={56} stroke={4} />
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{m.integrity_score.toFixed(0)}</div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-16">Baseline</span>
                        <MiniBar value={m.accuracy_baseline} max={100} color="bg-emerald-500" />
                        <span className="text-slate-300 w-12 text-right">{m.accuracy_baseline.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-16">Current</span>
                        <MiniBar value={m.accuracy_current} max={100} color={m.accuracy_current < m.accuracy_baseline - 2 ? 'bg-red-500' : 'bg-cyan-500'} />
                        <span className="text-slate-300 w-12 text-right">{m.accuracy_current.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Drift: {m.drift_score.toFixed(2)}</span>
                    <span>{m.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'registry' && selectedModel && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedModel(null)} className="text-slate-400 hover:text-white text-sm">&larr; Back</button>
                <h2 className="text-lg font-bold">{selectedModel.model_name}</h2>
                <Badge text={selectedModel.status} variant={selectedModel.poisoning_risk} />
              </div>
              <Badge text={`v${selectedModel.version}`} />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                { l: 'Integrity Score', v: `${selectedModel.integrity_score.toFixed(1)}%` },
                { l: 'Accuracy (Baseline)', v: `${selectedModel.accuracy_baseline.toFixed(2)}%` },
                { l: 'Accuracy (Current)', v: `${selectedModel.accuracy_current.toFixed(2)}%` },
                { l: 'Drift Score', v: selectedModel.drift_score.toFixed(4) },
                { l: 'Framework', v: selectedModel.framework },
                { l: 'Training Samples', v: selectedModel.training_samples.toLocaleString() },
                { l: 'Features', v: selectedModel.feature_count.toString() },
                { l: 'Owner', v: selectedModel.owner },
              ].map(({ l, v }) => (
                <div key={l} className="bg-slate-800/50 rounded p-3">
                  <div className="text-xs text-slate-500">{l}</div>
                  <div className="text-sm font-semibold mt-1">{v}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-300 mb-2">Description</div>
              <p className="text-sm text-slate-400">{selectedModel.description}</p>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-300 mb-2">Recent Detections</div>
              <div className="space-y-2">
                {detections.filter(d => d.model_id === selectedModel.id).slice(0, 5).map(d => (
                  <div key={d.id} className="bg-slate-800/50 rounded p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge text={d.severity} variant={d.severity} />
                      <span className="text-sm">{d.detection_type.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(d.detected_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {detections.filter(d => d.model_id === selectedModel.id).length === 0 && (
                  <p className="text-sm text-slate-500">No detections for this model.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'detections' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                {['critical', 'high', 'medium', 'low'].map(s => {
                  const count = detections.filter(d => d.severity === s).length;
                  return <Badge key={s} text={`${s}: ${count}`} variant={s} />;
                })}
              </div>
            </div>
            <div className="relative border-l-2 border-slate-700 ml-3 space-y-4">
              {detections.map(d => {
                const expanded = expandedIds.has(d.id);
                const isActive = d.status === 'detected' || d.status === 'investigating';
                return (
                  <div key={d.id} className="relative ml-6">
                    <div className={`absolute -left-[29px] top-3 w-3 h-3 rounded-full border-2 border-slate-900 ${STATUS_COLORS[d.severity] || 'bg-slate-500'} ${isActive ? 'animate-pulse' : ''}`} />
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge text={d.severity} variant={d.severity} />
                            <span className="font-semibold text-sm">{d.detection_type.replace(/_/g, ' ')}</span>
                            <Badge text={d.status} variant={d.status === 'mitigated' ? 'low' : d.status === 'investigating' ? 'medium' : 'critical'} />
                          </div>
                          <div className="text-xs text-slate-500">
                            Model: <span className="text-slate-300">{modelName(d.model_id)}</span> | Confidence: <span className="text-slate-300">{d.confidence.toFixed(1)}%</span> | Affected: <span className="text-slate-300">{d.affected_samples.toLocaleString()}/{d.total_samples_checked.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{new Date(d.detected_at).toLocaleString()}</div>
                      </div>
                      <p className="text-sm text-slate-400">{d.description}</p>
                      {d.mitre_technique && (
                        <div className="text-xs"><span className="text-slate-500">MITRE ATT&CK:</span> <span className="text-cyan-400 font-mono">{d.mitre_technique}</span></div>
                      )}
                      <button onClick={() => toggle(d.id)} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expanded ? 'Hide Analysis' : 'Show LLM Analysis & Remediation'}
                      </button>
                      {expanded && (
                        <div className="space-y-3 pt-2 border-t border-slate-800">
                          <div>
                            <div className="text-xs font-semibold text-cyan-400 mb-1 flex items-center gap-1"><Brain className="w-3 h-3" /> LLM Analysis</div>
                            <FormattedText text={d.llm_analysis} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-emerald-400 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Remediation</div>
                            <FormattedText text={d.remediation} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'simulation' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-cyan-400" /> Run Attack Simulation</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Target Model</label>
                    <select value={simConfig.modelId} onChange={e => setSimConfig(c => ({ ...c, modelId: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                      {models.map(m => <option key={m.id} value={m.id}>{m.model_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Attack Type</label>
                    <select value={simConfig.attackType} onChange={e => setSimConfig(c => ({ ...c, attackType: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500">
                      {['label_flip', 'backdoor_injection', 'gradient_manipulation', 'trigger_pattern', 'data_drift'].map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Attack Strength: {simConfig.strength}%</label>
                    <input type="range" min={1} max={20} value={simConfig.strength} onChange={e => setSimConfig(c => ({ ...c, strength: +e.target.value }))}
                      className="w-full accent-cyan-500" />
                  </div>
                  <button onClick={runSimulation} disabled={simRunning}
                    className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded transition-all">
                    {simRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {simRunning ? SIM_PHASES[simPhase] : 'Run Simulation'}
                  </button>
                  {simRunning && (
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all duration-100" style={{ width: `${simProgress}%` }} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className={`aspect-square rounded-full border-2 transition-all duration-300 flex items-center justify-center
                      ${poisonNodes.has(i) ? 'border-red-500 bg-red-500/30 shadow-lg shadow-red-500/20' : 'border-slate-600 bg-slate-800'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${poisonNodes.has(i) ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 text-center">Neural network nodes: <span className="text-emerald-400">clean</span> vs <span className="text-red-400">poisoned</span></p>
              </div>
              {simResult && (
                <div className="bg-slate-900 border border-cyan-500/30 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-cyan-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Simulation Results</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'Original Accuracy', v: `${simResult.originalAccuracy.toFixed(1)}%`, c: 'text-emerald-400' },
                      { l: 'Poisoned Accuracy', v: `${simResult.poisonedAccuracy.toFixed(1)}%`, c: 'text-red-400' },
                      { l: 'Accuracy Drop', v: `${simResult.accuracyDrop.toFixed(1)}%`, c: 'text-amber-400' },
                      { l: 'Detection Rate', v: `${simResult.detectionRate.toFixed(1)}%`, c: 'text-cyan-400' },
                      { l: 'Defense Effectiveness', v: `${simResult.defenseEffectiveness.toFixed(1)}%`, c: 'text-emerald-400' },
                      { l: 'Samples Poisoned', v: simResult.samplesPoisoned.toLocaleString(), c: 'text-red-400' },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="bg-slate-800/50 rounded p-2">
                        <div className="text-xs text-slate-500">{l}</div>
                        <div className={`font-bold ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-cyan-400 mb-1">Analysis</div>
                    <p className="text-sm text-slate-300 leading-relaxed">{simResult.analysis}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-slate-300">Previous Simulations</h3>
              {simulations.map(s => {
                const expanded = expandedIds.has(s.id);
                return (
                  <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge text={s.simulation_type.replace(/_/g, ' ')} />
                        <span className="text-sm text-slate-300">{modelName(s.model_id)}</span>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(s.simulated_at).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-20">Original</span>
                        <MiniBar value={s.original_accuracy} max={100} color="bg-emerald-500" />
                        <span className="w-14 text-right text-emerald-400">{s.original_accuracy.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-20">Poisoned</span>
                        <MiniBar value={s.poisoned_accuracy} max={100} color="bg-red-500" />
                        <span className="w-14 text-right text-red-400">{s.poisoned_accuracy.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 w-20">Defense</span>
                        <MiniBar value={s.defense_effectiveness} max={100} color="bg-cyan-500" />
                        <span className="w-14 text-right text-cyan-400">{s.defense_effectiveness.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Strength: {s.attack_strength}% | Drop: {s.accuracy_drop.toFixed(1)}%</span>
                      <span>{s.defense_method?.replace(/_/g, ' ')}</span>
                    </div>
                    <button onClick={() => toggle(s.id)} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                      {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {expanded ? 'Hide' : 'Show'} LLM Explanation
                    </button>
                    {expanded && (
                      <div className="pt-2 border-t border-slate-800">
                        <FormattedText text={s.llm_explanation} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'integrity' && (
          <div className="grid grid-cols-2 gap-3">
            {audits.map(a => (
              <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{a.dataset_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge text={a.audit_type.replace(/_/g, ' ')} />
                      <span className="text-xs text-slate-500">{modelName(a.model_id)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{new Date(a.audited_at).toLocaleDateString()}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ScoreBar label="Integrity" value={a.integrity_score} />
                  <ScoreBar label="Spectral Signature" value={a.spectral_signature_score} />
                  <ScoreBar label="Distribution Anomaly" value={100 - a.distribution_anomaly_score} />
                  <ScoreBar label="Label Consistency" value={a.label_consistency_score} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: 'Total', v: a.total_samples, c: 'text-slate-300' },
                    { l: 'Clean', v: a.clean_samples, c: 'text-emerald-400' },
                    { l: 'Suspicious', v: a.suspicious_samples, c: 'text-amber-400' },
                    { l: 'Poisoned', v: a.poisoned_samples, c: 'text-red-400' },
                  ].map(({ l, v, c }) => (
                    <div key={l} className="bg-slate-800/50 rounded p-2">
                      <div className={`text-sm font-bold ${c}`}>{v.toLocaleString()}</div>
                      <div className="text-xs text-slate-500">{l}</div>
                    </div>
                  ))}
                </div>
                {a.findings && (
                  <div className="text-xs text-slate-400 bg-slate-800/30 rounded p-2">{a.findings}</div>
                )}
                <div className="text-xs text-slate-500">Audit duration: {(a.audit_duration_ms / 1000).toFixed(1)}s</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'defense' && (
          <div className="space-y-4">
            {models.map(m => {
              const modelDefenses = defenses.filter(d => d.model_id === m.id);
              if (!modelDefenses.length) return null;
              return (
                <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[m.status]}`} />
                    <h3 className="font-semibold">{m.model_name}</h3>
                    <Badge text={m.poisoning_risk} variant={m.poisoning_risk} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {modelDefenses.map(d => (
                      <div key={d.id} className={`rounded-lg p-3 space-y-2 border ${d.enabled ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-800/20 border-slate-800 opacity-60'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{d.defense_type.replace(/_/g, ' ')}</span>
                          <div className={`w-9 h-5 rounded-full flex items-center transition-all ${d.enabled ? 'bg-emerald-500 justify-end' : 'bg-slate-600 justify-start'}`}>
                            <div className="w-4 h-4 bg-white rounded-full mx-0.5 shadow" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Sensitivity</span>
                            <span className="text-slate-300">{(d.sensitivity * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${d.sensitivity * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1">
                            {d.auto_quarantine ? <Lock className="w-3 h-3 text-amber-400" /> : <span className="w-3" />}
                            <span className={d.auto_quarantine ? 'text-amber-400' : 'text-slate-600'}>Auto-quarantine</span>
                          </div>
                          <span className="text-slate-500">Threshold: {(d.alert_threshold * 100).toFixed(0)}%</span>
                        </div>
                        {d.last_triggered && (
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Last: {new Date(d.last_triggered).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
