import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Brain, AlertTriangle, AlertCircle } from 'lucide-react';

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

export function PsychologicalUserDetail({ userEmail }: Props) {
  const [profile, setProfile] = useState<PsychProfile | null>(null);
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
        setFactors([]);
        setLoading(false);
        return;
      }

      const [psychRes, factorsRes] = await Promise.all([
        supabase.from('user_psychological_profiles').select('*').eq('user_id', llmRow.user_id).maybeSingle(),
        supabase.from('psychological_risk_factors').select('*').eq('user_id', llmRow.user_id).order('severity', { ascending: false }),
      ]);

      if (cancelled) return;
      setProfile(psychRes.data as PsychProfile | null);
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

  return (
    <div className="space-y-4">
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
