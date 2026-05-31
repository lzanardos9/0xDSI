import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Brain, AlertTriangle, AlertCircle, TrendingDown, TrendingUp, MessageSquare, Mail, Video, Activity } from 'lucide-react';

interface Props {
  userEmail: string;
}

interface PsychProfile {
  user_id: string;
  openness_score: number;
  conscientiousness_score: number;
  extraversion_score: number;
  agreeableness_score: number;
  neuroticism_score: number;
  narcissism_score: number;
  machiavellianism_score: number;
  psychopathy_score: number;
  insider_threat_score: number;
  manipulation_tendency_score: number;
  impulsivity_score: number;
  aggression_score: number;
  deception_likelihood_score: number;
  stress_level: number;
  burnout_risk: number;
  emotional_stability: number;
  frustration_level: number;
  overall_psychological_risk_score: number;
  risk_classification: string;
  is_potential_insider_threat: boolean;
  dominant_emotion: string;
  communication_style: string;
  linguistic_complexity: string;
  writing_urgency_level: string;
  sentiment_trend: string;
  confidence_score: number;
}

interface CommProfile {
  sentiment_score_current: number;
  sentiment_volatility: number;
  toxicity_score_current: number;
  dominant_emotion: string;
  dominant_intent: string;
  communication_risk_score: number;
  exfiltration_language_ratio: number;
  job_search_indicator_ratio: number;
  risk_signals: string;
  top_topics: string;
  messages_analyzed: number;
  channel_breakdown: string;
  sentiment_trend_7d: number | null;
  sentiment_trend_14d: number | null;
  sentiment_trend_30d: number | null;
  toxicity_trend_7d: number | null;
  toxicity_incidents_30d: number | null;
  last_analyzed_at: string;
}

interface RiskFactor {
  id: string;
  factor_type: string;
  severity: string;
  factor_name: string;
  description: string;
  confidence_level: number;
  requires_escalation: boolean;
}

const Trait = ({ label, score, danger = false }: { label: string; score: number; danger?: boolean }) => {
  const bar = danger
    ? score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-orange-500' : 'bg-emerald-500'
    : score >= 70 ? 'bg-blue-500' : score >= 40 ? 'bg-blue-400' : 'bg-blue-300';
  const textColor = danger
    ? score >= 60 ? 'text-red-400' : score >= 30 ? 'text-orange-400' : 'text-emerald-400'
    : 'text-slate-200';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={`text-xs font-bold ${textColor}`}>{score}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
};

function MiniSparkline({ values, color = 'text-blue-400' }: { values: number[]; color?: string }) {
  if (!values.length) return <span className="text-xs text-slate-600">No data</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const height = 24;
  const width = 80;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className={`inline-block ${color}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null || value === undefined) {
    return (
      <div className="text-center">
        <div className="text-[10px] text-slate-500 uppercase">{label}</div>
        <div className="text-xs text-slate-600">--</div>
      </div>
    );
  }
  const isNeg = value < -0.1;
  const isPos = value > 0.1;
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className={`text-sm font-bold flex items-center justify-center gap-0.5 ${
        isNeg ? 'text-red-400' : isPos ? 'text-emerald-400' : 'text-slate-300'
      }`}>
        {isNeg ? <TrendingDown className="w-3 h-3" /> : isPos ? <TrendingUp className="w-3 h-3" /> : null}
        {value.toFixed(2)}
      </div>
    </div>
  );
}

export function PsychologicalUserDetail({ userEmail }: Props) {
  const [profile, setProfile] = useState<PsychProfile | null>(null);
  const [commProfile, setCommProfile] = useState<CommProfile | null>(null);
  const [factors, setFactors] = useState<RiskFactor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: llmRow } = await supabase
        .from('llm_risk_profiles')
        .select('user_id')
        .ilike('user_email', userEmail)
        .maybeSingle();

      if (cancelled) return;

      if (!llmRow) {
        setProfile(null);
        setCommProfile(null);
        setFactors([]);
        setLoading(false);
        return;
      }

      const [psychRes, factorsRes, commRes] = await Promise.all([
        supabase.from('user_psychological_profiles').select('*').eq('user_id', llmRow.user_id).maybeSingle(),
        supabase.from('psychological_risk_factors').select('*').eq('user_id', llmRow.user_id).order('severity', { ascending: false }),
        supabase.from('psychological_profiles').select('*').eq('user_id', llmRow.user_id).maybeSingle(),
      ]);

      if (cancelled) return;
      setProfile(psychRes.data as PsychProfile | null);
      setCommProfile(commRes.data as CommProfile | null);
      setFactors((factorsRes.data as RiskFactor[]) || []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userEmail]);

  if (loading) {
    return <div className="text-slate-400 text-center py-12">Loading psychological profile...</div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Brain className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <div className="font-medium text-slate-300">No psychological profile available</div>
        <div className="text-sm mt-1">Insufficient communication data to build a profile.</div>
      </div>
    );
  }

  const channelBreakdown = commProfile?.channel_breakdown ? JSON.parse(commProfile.channel_breakdown) : null;
  const riskSignals = commProfile?.risk_signals ? JSON.parse(commProfile.risk_signals) : [];
  const topTopics = commProfile?.top_topics ? JSON.parse(commProfile.top_topics) : [];

  return (
    <div className="space-y-4">
      {/* Communication Trends Section */}
      {commProfile && (
        <div className="bg-slate-800/60 border border-cyan-500/20 rounded-lg p-4">
          <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Communication Analysis (Rolling)
          </h4>

          {/* Sentiment Trends */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            <TrendBadge value={commProfile.sentiment_score_current} label="Current" />
            <TrendBadge value={commProfile.sentiment_trend_7d} label="7 Day" />
            <TrendBadge value={commProfile.sentiment_trend_14d} label="14 Day" />
            <TrendBadge value={commProfile.sentiment_trend_30d} label="30 Day" />
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Volatility</div>
              <div className={`text-sm font-bold ${
                commProfile.sentiment_volatility > 0.4 ? 'text-red-400' :
                commProfile.sentiment_volatility > 0.2 ? 'text-orange-400' : 'text-slate-300'
              }`}>{commProfile.sentiment_volatility.toFixed(2)}</div>
            </div>
          </div>

          {/* Risk Metrics Row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Comm Risk</div>
              <div className={`text-xl font-bold ${
                commProfile.communication_risk_score > 0.6 ? 'text-red-400' :
                commProfile.communication_risk_score > 0.3 ? 'text-orange-400' : 'text-emerald-400'
              }`}>{(commProfile.communication_risk_score * 100).toFixed(0)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Toxicity</div>
              <div className={`text-xl font-bold ${
                commProfile.toxicity_score_current > 0.4 ? 'text-red-400' :
                commProfile.toxicity_score_current > 0.2 ? 'text-orange-400' : 'text-emerald-400'
              }`}>{(commProfile.toxicity_score_current * 100).toFixed(0)}</div>
              {commProfile.toxicity_incidents_30d !== null && (
                <div className="text-[9px] text-slate-500">{commProfile.toxicity_incidents_30d} incidents/30d</div>
              )}
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Exfil Lang</div>
              <div className={`text-xl font-bold ${
                commProfile.exfiltration_language_ratio > 0.2 ? 'text-red-400' :
                commProfile.exfiltration_language_ratio > 0.05 ? 'text-orange-400' : 'text-emerald-400'
              }`}>{(commProfile.exfiltration_language_ratio * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500 uppercase">Job Search</div>
              <div className={`text-xl font-bold ${
                commProfile.job_search_indicator_ratio > 0.2 ? 'text-orange-400' :
                commProfile.job_search_indicator_ratio > 0.05 ? 'text-yellow-400' : 'text-emerald-400'
              }`}>{(commProfile.job_search_indicator_ratio * 100).toFixed(0)}%</div>
            </div>
          </div>

          {/* Channel Breakdown + Intent */}
          <div className="flex items-center gap-4 mb-3">
            {channelBreakdown && (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {channelBreakdown.email && (
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{channelBreakdown.email}</span>
                )}
                {channelBreakdown.slack && (
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{channelBreakdown.slack}</span>
                )}
                {channelBreakdown.teams && (
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-blue-400" />{channelBreakdown.teams}</span>
                )}
                {channelBreakdown.meeting && (
                  <span className="flex items-center gap-1"><Video className="w-3 h-3" />{channelBreakdown.meeting}</span>
                )}
              </div>
            )}
            <div className="ml-auto text-xs text-slate-500">
              {commProfile.messages_analyzed} msgs analyzed
            </div>
          </div>

          {/* Dominant Intent + Emotion */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
              commProfile.dominant_intent === 'neutral' ? 'bg-slate-700 text-slate-300' :
              commProfile.dominant_intent === 'venting' ? 'bg-orange-500/20 text-orange-300' :
              commProfile.dominant_intent === 'exfiltration_related' ? 'bg-red-500/20 text-red-300' :
              commProfile.dominant_intent === 'job_search' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-blue-500/20 text-blue-300'
            }`}>
              Intent: {commProfile.dominant_intent.replace(/_/g, ' ')}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 capitalize">
              Emotion: {commProfile.dominant_emotion}
            </span>
          </div>

          {/* Risk Signals */}
          {riskSignals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {riskSignals.slice(0, 6).map((signal: string) => (
                <span key={signal} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20">
                  {signal.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Topics */}
          {topTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topTopics.slice(0, 8).map((topic: string) => (
                <span key={topic} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                  {topic}
                </span>
              ))}
            </div>
          )}

          {commProfile.last_analyzed_at && (
            <div className="text-[10px] text-slate-600 mt-2 text-right">
              Last analyzed: {new Date(commProfile.last_analyzed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Overall Risk Header */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Overall Risk</div>
          <div className={`text-3xl font-bold mt-1 ${
            profile.overall_psychological_risk_score >= 70 ? 'text-red-400' :
            profile.overall_psychological_risk_score >= 40 ? 'text-orange-400' : 'text-emerald-400'
          }`}>
            {profile.overall_psychological_risk_score}
          </div>
          <div className="text-xs text-slate-300 capitalize mt-1">{profile.risk_classification}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Insider Threat</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{profile.insider_threat_score}</div>
          {profile.is_potential_insider_threat && (
            <div className="text-xs text-red-300 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Potential threat
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Confidence</div>
          <div className="text-3xl font-bold text-blue-400 mt-1">{profile.confidence_score}%</div>
          <div className="text-xs text-slate-500 mt-1">Profile reliability</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-3">Big Five (OCEAN)</h4>
          <div className="space-y-3">
            <Trait label="Openness" score={profile.openness_score} />
            <Trait label="Conscientiousness" score={profile.conscientiousness_score} />
            <Trait label="Extraversion" score={profile.extraversion_score} />
            <Trait label="Agreeableness" score={profile.agreeableness_score} />
            <Trait label="Neuroticism" score={profile.neuroticism_score} />
          </div>
        </div>
        <div className="bg-slate-800/50 border border-red-500/20 rounded-lg p-4">
          <h4 className="text-xs font-bold text-red-300 uppercase tracking-wide mb-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Dark Triad
          </h4>
          <div className="space-y-3">
            <Trait label="Narcissism" score={profile.narcissism_score} danger />
            <Trait label="Machiavellianism" score={profile.machiavellianism_score} danger />
            <Trait label="Psychopathy" score={profile.psychopathy_score} danger />
          </div>
          <h4 className="text-xs font-bold text-red-300 uppercase tracking-wide mt-4 mb-3">Behavioral</h4>
          <div className="space-y-3">
            <Trait label="Manipulation" score={profile.manipulation_tendency_score} danger />
            <Trait label="Deception" score={profile.deception_likelihood_score} danger />
            <Trait label="Impulsivity" score={profile.impulsivity_score} danger />
            <Trait label="Aggression" score={profile.aggression_score} danger />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Stress', val: profile.stress_level },
          { label: 'Burnout', val: profile.burnout_risk },
          { label: 'Frustration', val: profile.frustration_level },
          { label: 'Stability', val: profile.emotional_stability },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wide">{m.label}</div>
            <div className={`text-2xl font-bold mt-1 ${
              m.val >= 70 ? 'text-red-400' : m.val >= 40 ? 'text-orange-400' : 'text-emerald-400'
            }`}>{m.val}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Dominant Emotion</div>
          <div className="text-slate-200 capitalize mt-1">{profile.dominant_emotion?.replace('_', ' ')}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Communication</div>
          <div className="text-slate-200 capitalize mt-1">{profile.communication_style?.replace('_', ' ')}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Urgency</div>
          <div className="text-slate-200 capitalize mt-1">{profile.writing_urgency_level?.replace('_', ' ')}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Sentiment</div>
          <div className="text-slate-200 capitalize mt-1">{profile.sentiment_trend?.replace('_', ' ')}</div>
        </div>
      </div>

      {factors.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" /> Identified Risk Factors
          </h4>
          <div className="space-y-2">
            {factors.map((f) => (
              <div key={f.id} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                        f.severity === 'critical' ? 'bg-red-500 text-white' :
                        f.severity === 'high' ? 'bg-orange-500 text-white' :
                        f.severity === 'medium' ? 'bg-yellow-500 text-slate-900' : 'bg-blue-500 text-white'
                      }`}>{f.severity.toUpperCase()}</span>
                      <span className="text-[11px] text-slate-400 capitalize">{f.factor_type.replace(/_/g, ' ')}</span>
                      {f.requires_escalation && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/20 text-red-300">Escalation required</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">{f.factor_name}</div>
                    <div className="text-xs text-slate-400 mt-1">{f.description}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-blue-400">{f.confidence_level}%</div>
                    <div className="text-[10px] text-slate-500">Confidence</div>
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
