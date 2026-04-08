import { useState, useEffect, useCallback } from 'react';
import { Shield, BookOpen, AlertTriangle, GitBranch, Clock, Eye, EyeOff, Zap, MapPin, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import NegativeCorrelationRules from './NegativeCorrelationRules';
import NegativeCorrelationDetections from './NegativeCorrelationDetections';
import NegativeCorrelationGraph from './NegativeCorrelationGraph';
import NegativeCorrelationTimeline from './NegativeCorrelationTimeline';

type Tab = 'overview' | 'rules' | 'detections' | 'graph';

interface Rule {
  id: string;
  rule_name: string;
  rule_code: string;
  category: string;
  description: string;
  observed_event: string;
  expected_event: string;
  time_window_seconds: number;
  constraint_logic: string;
  constraint_query: string;
  severity: string;
  confidence_base: number;
  mitre_techniques: string[];
  false_positive_notes: string;
  enabled: boolean;
  detection_count: number;
  last_fired_at: string;
}

interface Detection {
  id: string;
  rule_id: string;
  detection_time: string;
  observed_event_detail: any;
  missing_event_detail: any;
  entity_type: string;
  entity_id: string;
  confidence_score: number;
  severity: string;
  status: string;
  evidence_chain: any[];
  analyst_notes: string;
  time_gap_seconds: number;
  physics_violation: any;
  rule_name?: string;
  rule_code?: string;
  rule_category?: string;
}

const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'rules', label: 'Correlation Rules', icon: BookOpen },
  { id: 'detections', label: 'Live Detections', icon: AlertTriangle },
  { id: 'graph', label: 'Absence Graph', icon: GitBranch },
];

const CATEGORY_STATS: Record<string, { icon: typeof Eye; color: string; bg: string }> = {
  missing_prerequisite: { icon: GitBranch, color: 'text-red-400', bg: 'bg-red-950/30 border-red-500/20' },
  impossible_coexistence: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-950/30 border-amber-500/20' },
  missing_consequence: { icon: EyeOff, color: 'text-cyan-400', bg: 'bg-cyan-950/30 border-cyan-500/20' },
  temporal_impossibility: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-950/30 border-orange-500/20' },
  physics_violation: { icon: MapPin, color: 'text-rose-400', bg: 'bg-rose-950/30 border-rose-500/20' },
};

export default function NegativeCorrelationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, detectionsRes] = await Promise.all([
        supabase.from('negative_correlation_rules').select('*').order('detection_count', { ascending: false }),
        supabase.from('negative_correlation_detections').select('*').order('detection_time', { ascending: false }),
      ]);

      const rulesData = rulesRes.data || [];
      const detectionsData = detectionsRes.data || [];

      setRules(rulesData);

      const ruleMap = new Map(rulesData.map(r => [r.id, r]));
      setDetections(detectionsData.map(d => ({
        ...d,
        rule_name: ruleMap.get(d.rule_id)?.rule_name || '',
        rule_code: ruleMap.get(d.rule_id)?.rule_code || '',
        rule_category: ruleMap.get(d.rule_id)?.category || '',
      })));
    } catch (err) {
      console.error('Error loading negative correlation data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openDetections = detections.filter(d => d.status === 'open');
  const criticalDetections = detections.filter(d => d.severity === 'critical');
  const categoryCounts = rules.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryDetections = detections.reduce((acc, d) => {
    const cat = d.rule_category || '';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalDetectionCount = rules.reduce((sum, r) => sum + r.detection_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <NegativeIcon />
            </div>
            {openDetections.length > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center border-2 border-slate-950">
                <span className="text-[8px] font-bold text-white">{openDetections.length}</span>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Negative Correlation Engine</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-500/20 font-medium">
                {openDetections.length} Open
              </span>
            </div>
            <p className="text-xs text-slate-500">Detecting the dog that didn't bark -- finding threats by what's missing</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <p className="text-lg font-bold text-white">{rules.length}</p>
            <p className="text-[10px] text-slate-500">Rules Active</p>
          </div>
          <div className="w-px h-8 bg-slate-700/30" />
          <div className="text-right">
            <p className="text-lg font-bold text-red-400">{criticalDetections.length}</p>
            <p className="text-[10px] text-slate-500">Critical</p>
          </div>
          <div className="w-px h-8 bg-slate-700/30" />
          <div className="text-right">
            <p className="text-lg font-bold text-slate-300">{totalDetectionCount.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Total Firings</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-700/30">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all relative ${
              activeTab === tab.id ? 'text-red-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'detections' && openDetections.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 ml-1">
                {openDetections.length}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(CATEGORY_STATS).map(([key, config]) => {
              const Icon = config.icon;
              const labels: Record<string, string> = {
                missing_prerequisite: 'Missing Prerequisite',
                impossible_coexistence: 'Impossible Coexistence',
                missing_consequence: 'Missing Consequence',
                temporal_impossibility: 'Temporal Impossibility',
                physics_violation: 'Physics Violation',
              };
              return (
                <div key={key} className={`${config.bg} border rounded-xl p-3 hover:scale-[1.02] transition-transform`}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className={`text-lg font-bold ${config.color}`}>{categoryCounts[key] || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">{labels[key]}</p>
                  <p className="text-[9px] text-slate-600 mt-1">{categoryDetections[key] || 0} active detections</p>
                </div>
              );
            })}
          </div>

          <NegativeCorrelationTimeline detections={detections} loading={loading} />

          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Recent Critical Detections
            </h3>
            <NegativeCorrelationDetections
              detections={detections.filter(d => d.severity === 'critical').slice(0, 5)}
              loading={loading}
            />
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <NegativeCorrelationRules rules={rules} loading={loading} />
      )}

      {activeTab === 'detections' && (
        <NegativeCorrelationDetections detections={detections} loading={loading} />
      )}

      {activeTab === 'graph' && (
        <NegativeCorrelationGraph detections={detections} loading={loading} />
      )}
    </div>
  );
}

function NegativeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
      <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
      <line x1="8" y1="12" x2="16" y2="12" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" opacity="0.4" strokeWidth="1" />
    </svg>
  );
}
