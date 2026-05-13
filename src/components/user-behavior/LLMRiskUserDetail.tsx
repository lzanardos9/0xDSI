import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Brain, AlertTriangle, Eye, Lock, Code, Shield, Clock, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  userEmail: string;
}

interface LLMProfile {
  user_id: string;
  current_risk_score: number;
  risk_level: string;
  risk_trend: string;
  total_interactions: number;
  high_risk_interactions: number;
  flagged_interactions: number;
  pii_exposure_risk: number;
  credential_exposure_risk: number;
  data_exfiltration_risk: number;
  policy_violation_risk: number;
  jailbreak_attempt_risk: number;
  is_escalated: boolean;
  escalation_reason: string | null;
  has_anomalous_behavior: boolean;
}

interface Interaction {
  id: string;
  timestamp: string;
  prompt_text: string;
  prompt_tokens: number;
  model_name: string;
  contains_pii: boolean;
  contains_credentials: boolean;
  contains_proprietary_data: boolean;
  is_jailbreak_attempt: boolean;
  is_data_exfiltration: boolean;
  data_sensitivity_level: string;
  interaction_risk_score: number;
  flagged_for_review: boolean;
  geo_location: string;
}

interface Incident {
  id: string;
  incident_type: string;
  severity: string;
  title: string;
  description: string;
  risk_score: number;
  status: string;
  created_at: string;
}

const sensitivityColor = (level: string) => {
  switch (level) {
    case 'restricted': return 'bg-red-500/20 text-red-300 border-red-500/30';
    case 'confidential': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'internal': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    default: return 'bg-slate-700 text-slate-300 border-slate-600';
  }
};

const trendIcon = (trend: string) => {
  if (trend === 'rapidly_increasing') return <TrendingUp className="w-4 h-4 text-red-400" />;
  if (trend === 'increasing') return <TrendingUp className="w-4 h-4 text-orange-400" />;
  if (trend === 'decreasing') return <TrendingDown className="w-4 h-4 text-emerald-400" />;
  return <span className="text-blue-400">━</span>;
};

export function LLMRiskUserDetail({ userEmail }: Props) {
  const [profile, setProfile] = useState<LLMProfile | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: profileData } = await supabase
        .from('llm_risk_profiles')
        .select('*')
        .ilike('user_email', userEmail)
        .maybeSingle();

      if (cancelled) return;

      if (!profileData) {
        setProfile(null);
        setInteractions([]);
        setIncidents([]);
        setLoading(false);
        return;
      }

      setProfile(profileData as LLMProfile);

      const [interactionsRes, incidentsRes] = await Promise.all([
        supabase
          .from('llm_interactions')
          .select('*')
          .eq('user_id', profileData.user_id)
          .order('timestamp', { ascending: false })
          .limit(15),
        supabase
          .from('llm_risk_incidents')
          .select('*')
          .eq('user_id', profileData.user_id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;
      setInteractions((interactionsRes.data as Interaction[]) || []);
      setIncidents((incidentsRes.data as Incident[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userEmail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading LLM risk profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Brain className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <div className="font-medium text-slate-300">No LLM activity recorded for this user</div>
        <div className="text-sm mt-1">This user has not interacted with monitored LLM endpoints.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {[
          { icon: Eye, label: 'PII Exposure', value: profile.pii_exposure_risk, color: 'red' },
          { icon: Lock, label: 'Credentials', value: profile.credential_exposure_risk, color: 'orange' },
          { icon: Shield, label: 'Exfiltration', value: profile.data_exfiltration_risk, color: 'amber' },
          { icon: AlertTriangle, label: 'Policy', value: profile.policy_violation_risk, color: 'yellow' },
          { icon: Code, label: 'Jailbreak', value: profile.jailbreak_attempt_risk, color: 'pink' },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <item.icon className="w-4 h-4 text-slate-400" />
              <span className="text-xl font-bold text-white">{item.value}</span>
            </div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Trend</div>
          <div className="flex items-center gap-2 mt-1">
            {trendIcon(profile.risk_trend)}
            <span className="text-sm font-medium text-slate-200 capitalize">
              {profile.risk_trend.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Interactions</div>
          <div className="text-sm font-medium text-slate-200 mt-1">
            {profile.total_interactions} total · <span className="text-red-400">{profile.high_risk_interactions} high-risk</span>
          </div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-wide">Anomaly</div>
          <div className="flex items-center gap-2 mt-1">
            {profile.has_anomalous_behavior ? (
              <>
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300 font-medium">Detected</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300 font-medium">Normal</span>
              </>
            )}
          </div>
        </div>
      </div>

      {profile.is_escalated && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-bold text-red-300">Escalated for Investigation</div>
            <div className="text-xs text-red-200/80 mt-1">{profile.escalation_reason}</div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wide">Recent LLM Interactions</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {interactions.length === 0 && (
            <div className="text-sm text-slate-500 py-4">No recent interactions</div>
          )}
          {interactions.map((it) => (
            <div key={it.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  {new Date(it.timestamp).toLocaleString()}
                  <span className={`px-2 py-0.5 rounded border ${sensitivityColor(it.data_sensitivity_level)}`}>
                    {it.data_sensitivity_level}
                  </span>
                  {it.flagged_for_review && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">Flagged</span>
                  )}
                </div>
                <span className={`text-lg font-bold ${
                  it.interaction_risk_score >= 70 ? 'text-red-400' :
                  it.interaction_risk_score >= 40 ? 'text-orange-400' : 'text-emerald-400'
                }`}>
                  {it.interaction_risk_score}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-300 bg-slate-950/50 rounded p-2 mb-2 line-clamp-2">
                {it.prompt_text.substring(0, 220)}{it.prompt_text.length > 220 && '...'}
              </div>
              <div className="flex items-center flex-wrap gap-2 text-[11px]">
                <span className="text-slate-500">{it.model_name} · {it.prompt_tokens} tok · {it.geo_location}</span>
                {it.contains_pii && <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300">PII</span>}
                {it.contains_credentials && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Credentials</span>}
                {it.contains_proprietary_data && <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">Proprietary</span>}
                {it.is_jailbreak_attempt && <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">Jailbreak</span>}
                {it.is_data_exfiltration && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Exfil</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {incidents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wide">LLM Incidents</h3>
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                        inc.severity === 'critical' ? 'bg-red-500 text-white' :
                        inc.severity === 'high' ? 'bg-orange-500 text-white' :
                        inc.severity === 'medium' ? 'bg-yellow-500 text-slate-900' :
                        'bg-blue-500 text-white'
                      }`}>{inc.severity.toUpperCase()}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 capitalize">{inc.status}</span>
                      <span className="text-[11px] text-slate-500">{new Date(inc.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-sm font-bold text-white">{inc.title}</div>
                    <div className="text-xs text-slate-400 mt-1">{inc.description}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xl font-bold text-red-400">{inc.risk_score}</div>
                    <div className="text-[10px] text-slate-500">Risk</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
