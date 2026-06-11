import { useState, useEffect } from 'react';
import { TrendingUp, Clock, AlertTriangle, Shield, Zap, Target, Brain, ChevronRight, Activity } from 'lucide-react';

interface ThreatForecast {
  id: string;
  vector: string;
  probability: number;
  timeframe: string;
  hoursUntil: number;
  targetAgents: string[];
  mitreTactic: string;
  basedOn: string[];
  recommendedAction: string;
  confidence: number;
  trend: 'rising' | 'stable' | 'declining';
}

interface TemporalPattern {
  hour: number;
  attackProbability: number;
  dominantVector: string;
}

const FORECASTS: ThreatForecast[] = [
  {
    id: 'fc-001', vector: 'Multi-Turn Escalation (Novel Variant)',
    probability: 0.78, timeframe: '6-12h', hoursUntil: 8,
    targetAgents: ['CISO Assistant', 'Playbook Generator'],
    mitreTactic: 'T1566.002 (Spearphishing Link adapted for LLM)',
    basedOn: ['3 partial bypasses in last 24h', 'Evolutionary fitness trending up (0.12→0.21)', 'Similar pattern preceded full bypass on 2026-06-04'],
    recommendedAction: 'Strengthen multi-turn detection window from 5 to 3 turns for target agents',
    confidence: 0.82, trend: 'rising',
  },
  {
    id: 'fc-002', vector: 'Indirect Injection via External Data',
    probability: 0.64, timeframe: '12-24h', hoursUntil: 18,
    targetAgents: ['Enrichment Agent', 'Document Analyzer'],
    mitreTactic: 'T1059.007 (Command Scripting adapted)',
    basedOn: ['New threat feed containing adversarial payloads detected', 'Document Analyzer processing 340% more external docs', 'Historical: injection success correlates with volume spikes'],
    recommendedAction: 'Enable strict input sanitization on all external data ingestion paths',
    confidence: 0.71, trend: 'rising',
  },
  {
    id: 'fc-003', vector: 'Tool Abuse Chain (Cross-Agent)',
    probability: 0.52, timeframe: '24-48h', hoursUntil: 36,
    targetAgents: ['Playbook Generator', 'Response Orchestrator'],
    mitreTactic: 'T1569.002 (Service Execution adapted)',
    basedOn: ['Conspiracy detection flagged privilege escalation chain', 'Playbook Generator ARS declining (-0.8)', 'Tool boundary definitions pending review'],
    recommendedAction: 'Audit and restrict tool-calling boundaries for Playbook Generator; require human approval for Response Orchestrator triggers from non-direct callers',
    confidence: 0.65, trend: 'stable',
  },
  {
    id: 'fc-004', vector: 'Language Switch Evasion (Low-Resource)',
    probability: 0.41, timeframe: '24-48h', hoursUntil: 42,
    targetAgents: ['Shadow AI Detector', 'Enrichment Agent'],
    mitreTactic: 'T1027.010 (Obfuscation adapted)',
    basedOn: ['2 successful bypasses using Zulu+code mix', 'Low-resource language detection coverage at 82%', 'Adversarial evolution trending toward polyglot payloads'],
    recommendedAction: 'Deploy multilingual classifier update; add language-detection pre-filter for all prompt inputs',
    confidence: 0.58, trend: 'declining',
  },
  {
    id: 'fc-005', vector: 'Credential Harvesting via Agent Persona',
    probability: 0.33, timeframe: '48h+', hoursUntil: 60,
    targetAgents: ['CISO Assistant'],
    mitreTactic: 'T1078.004 (Cloud Account adapted)',
    basedOn: ['CISO Assistant has access to credential store metadata', 'Partial system prompt extraction detected (Gen 47)', 'External threat intel: new AI-targeting credential campaigns'],
    recommendedAction: 'Revoke credential store metadata access from CISO Assistant; isolate to read-only advisory role',
    confidence: 0.47, trend: 'stable',
  },
];

const TEMPORAL_PATTERN: TemporalPattern[] = Array.from({ length: 48 }, (_, i) => ({
  hour: i,
  attackProbability: Math.max(0.05, Math.sin(i / 4) * 0.3 + 0.4 + (i > 30 ? 0.15 : 0) + Math.random() * 0.1),
  dominantVector: i < 12 ? 'Multi-Turn' : i < 24 ? 'Indirect Injection' : i < 36 ? 'Tool Abuse' : 'Language Switch',
}));

const PredictiveThreatForecasting = () => {
  const [selectedForecast, setSelectedForecast] = useState<string>('fc-001');
  const [currentHour, setCurrentHour] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCurrentHour(h => (h + 1) % 48), 2000);
    return () => clearInterval(interval);
  }, []);

  const selected = FORECASTS.find(f => f.id === selectedForecast);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/30 flex items-center justify-center">
            <TrendingUp className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Predictive Threat Forecasting</h2>
            <p className="text-[10px] text-slate-500">48-hour attack surface forecast using temporal graph neural networks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[9px] text-blue-400 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Next update: 4m
          </div>
        </div>
      </div>

      {/* 48h Temporal Heatmap */}
      <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">48-Hour Attack Probability Forecast</span>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-slate-500">Low</span>
            <div className="flex gap-0.5">
              {['bg-emerald-500/30', 'bg-emerald-500/50', 'bg-amber-500/40', 'bg-amber-500/70', 'bg-red-500/50', 'bg-red-500/80'].map((c, i) => (
                <div key={i} className={`w-3 h-2 rounded-sm ${c}`} />
              ))}
            </div>
            <span className="text-[8px] text-slate-500">High</span>
          </div>
        </div>
        <div className="flex gap-px">
          {TEMPORAL_PATTERN.map((p, i) => {
            const intensity = p.attackProbability;
            const color = intensity > 0.7 ? 'bg-red-500' :
                          intensity > 0.5 ? 'bg-amber-500' :
                          intensity > 0.3 ? 'bg-emerald-500' : 'bg-emerald-500/30';
            const opacity = Math.max(0.3, intensity);
            return (
              <div
                key={i}
                className={`flex-1 h-8 rounded-sm transition-all ${color} ${
                  i === currentHour ? 'ring-1 ring-white/50' : ''
                }`}
                style={{ opacity }}
                title={`+${i}h: ${(intensity * 100).toFixed(0)}% — ${p.dominantVector}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[8px] text-slate-500">Now</span>
          <span className="text-[8px] text-slate-500">+12h</span>
          <span className="text-[8px] text-slate-500">+24h</span>
          <span className="text-[8px] text-slate-500">+36h</span>
          <span className="text-[8px] text-slate-500">+48h</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Forecast List */}
        <div className="lg:col-span-2 space-y-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Predicted Attack Vectors (Ranked by Probability)</span>
          {FORECASTS.map(forecast => (
            <div
              key={forecast.id}
              onClick={() => setSelectedForecast(forecast.id)}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                forecast.id === selectedForecast
                  ? 'bg-slate-800/60 border-cyan-500/30 ring-1 ring-cyan-500/10'
                  : 'bg-slate-800/20 border-slate-700/30 hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    forecast.probability > 0.7 ? 'bg-red-500/20 text-red-400' :
                    forecast.probability > 0.5 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {(forecast.probability * 100).toFixed(0)}%
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-200">{forecast.vector}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-slate-500">{forecast.timeframe}</span>
                      <span className="text-[9px] text-slate-500">|</span>
                      <span className="text-[9px] text-slate-500">{forecast.mitreTactic}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-0.5 text-[9px] ${
                    forecast.trend === 'rising' ? 'text-red-400' :
                    forecast.trend === 'declining' ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {forecast.trend === 'rising' ? '↑' : forecast.trend === 'declining' ? '↓' : '→'}
                    {forecast.trend}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    conf: {(forecast.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {forecast.id === selectedForecast && (
                <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-2">
                  <div>
                    <span className="text-[9px] text-slate-500 font-medium">Target Agents:</span>
                    <div className="flex gap-1 mt-1">
                      {forecast.targetAgents.map(a => (
                        <span key={a} className="px-1.5 py-0.5 bg-slate-700/50 border border-slate-600/30 rounded text-[9px] text-slate-300">{a}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-medium">Based On:</span>
                    <div className="space-y-0.5 mt-1">
                      {forecast.basedOn.map((b, i) => (
                        <div key={i} className="flex items-start gap-1.5 ml-1">
                          <Activity className="w-2.5 h-2.5 text-slate-500 mt-0.5 flex-shrink-0" />
                          <span className="text-[9px] text-slate-400">{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Shield className="w-3 h-3 text-emerald-400" />
                      <span className="text-[9px] text-emerald-400 font-medium">Pre-emptive Recommendation:</span>
                    </div>
                    <p className="text-[9px] text-slate-300 ml-4">{forecast.recommendedAction}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Model Performance</h3>
            <div className="space-y-2">
              {[
                { label: 'Prediction Accuracy (7d)', value: '87.3%', color: 'text-emerald-400' },
                { label: 'True Positive Rate', value: '91.2%', color: 'text-emerald-400' },
                { label: 'False Positive Rate', value: '8.4%', color: 'text-amber-400' },
                { label: 'Avg Lead Time', value: '14.2h', color: 'text-cyan-400' },
                { label: 'Threats Prevented', value: '23/27', color: 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400">{stat.label}</span>
                  <span className={`text-[10px] font-medium ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Input Signals</h3>
            <div className="space-y-1.5">
              {[
                'Adversarial Red Team fitness curves',
                'Agent behavioral drift scores',
                'External threat intelligence feeds',
                'Historical attack success patterns',
                'Agent interaction graph anomalies',
                'Temporal access patterns (time-of-day)',
                'Model vulnerability disclosures',
              ].map(signal => (
                <div key={signal} className="flex items-center gap-1.5">
                  <ChevronRight className="w-3 h-3 text-blue-400" />
                  <span className="text-[9px] text-slate-300">{signal}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/5 to-cyan-600/5 border border-blue-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-blue-400 font-semibold">vs Microsoft Agent 365</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Microsoft is reactive: detect → respond. 0xDSI is predictive: forecast threats 48h before they materialize using temporal graph neural networks trained on adversarial simulation data. Prevent, don't just detect.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictiveThreatForecasting;
