import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/llmGateway';
import {
  FlaskConical,
  Loader2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Mail,
  MessageSquare,
  Phone,
  Users,
  FileText,
  ShieldAlert,
  Gauge,
} from 'lucide-react';

interface Assessment {
  id?: string;
  subject_label: string;
  source_channel: string;
  input_text: string;
  input_char_count: number;
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  narcissism: number;
  machiavellianism: number;
  psychopathy: number;
  manipulation: number;
  deception: number;
  impulsivity: number;
  aggression: number;
  overall_risk_score: number;
  risk_classification: string;
  dominant_emotion: string;
  communication_style: string;
  summary: string;
  key_indicators: string[];
  confidence_score: number;
  model_version: string;
  created_at?: string;
}

const CHANNELS: Array<{ id: string; label: string; icon: any }> = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'slack', label: 'Slack', icon: MessageSquare },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'sms', label: 'SMS / Text', icon: MessageSquare },
  { id: 'call_transcript', label: 'Call Transcript', icon: Phone },
  { id: 'other', label: 'Other', icon: FileText },
];

function riskColor(score: number): string {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-emerald-400';
}

function riskBadge(score: number): string {
  if (score >= 70) return 'bg-red-500/10 border-red-500/30 text-red-400';
  if (score >= 40) return 'bg-orange-500/10 border-orange-500/30 text-orange-400';
  return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
}

function Trait({ label, score, danger }: { label: string; score: number; danger?: boolean }) {
  const barColor = danger
    ? score >= 70
      ? 'bg-red-500'
      : score >= 40
        ? 'bg-orange-500'
        : 'bg-emerald-500'
    : score >= 70
      ? 'bg-blue-400'
      : score >= 40
        ? 'bg-blue-500'
        : 'bg-slate-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-200">{score}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
    </div>
  );
}

interface Props {
  defaultSubject?: string;
}

export function CommunicationAssessment({ defaultSubject }: Props) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState(defaultSubject || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<Assessment[]>([]);

  useEffect(() => {
    setSubject(defaultSubject || '');
  }, [defaultSubject]);

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    const { data } = await supabase
      .from('psychometric_text_assessments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);
    if (data) setHistory(data as Assessment[]);
  }

  async function runAssessment() {
    if (text.trim().length < 20) {
      setError('Please paste at least a short passage (20+ characters) to assess.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const { data, error: callError } = await callFunction(
      'analyze-communication-psychology',
      { text: text.trim(), channel, subjectLabel: subject.trim() },
      { timeout: 90000 },
    );

    if (callError) {
      setError(callError);
      setLoading(false);
      return;
    }

    const payload = data as { assessment?: Assessment; error?: string };
    if (!payload?.assessment) {
      setError(payload?.error || 'The model did not return a valid assessment. Please try again.');
      setLoading(false);
      return;
    }

    setResult(payload.assessment);
    setLoading(false);
    fetchHistory();
  }

  async function deleteAssessment(id?: string) {
    if (!id) return;
    await supabase.from('psychometric_text_assessments').delete().eq('id', id);
    if (result?.id === id) setResult(null);
    fetchHistory();
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-5 flex flex-col gap-4">
        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Assessment Lab</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Paste text from a call transcript, email, Slack/Teams message or SMS. The psycholinguistic model
            rates it against the Big Five and Dark Triad and estimates an overall behavioral risk score.
          </p>

          <label className="block text-xs text-slate-400 mb-1.5">Subject (optional)</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Who is this text about?"
            className="w-full mb-4 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />

          <label className="block text-xs text-slate-400 mb-1.5">Source channel</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs transition ${
                  channel === c.id
                    ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                    : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <c.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>

          <label className="block text-xs text-slate-400 mb-1.5">Text to assess</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Paste the message, transcript or conversation here..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none font-mono"
          />
          <div className="flex items-center justify-between mt-1.5 mb-3">
            <span className="text-[11px] text-slate-500">{text.length} characters</span>
            {text.length > 0 && (
              <button onClick={() => setText('')} className="text-[11px] text-slate-500 hover:text-slate-300">
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={runAssessment}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run Assessment
              </>
            )}
          </button>
        </div>

        {history.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Recent Assessments</h4>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => setResult(h)}
                  className="group flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 cursor-pointer transition"
                >
                  <span className={`text-xs font-bold w-9 text-center py-1 rounded border ${riskBadge(h.overall_risk_score)}`}>
                    {h.overall_risk_score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-200 truncate">{h.subject_label || 'Unlabeled subject'}</p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {h.source_channel.replace('_', ' ')} • {h.risk_classification} risk
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAssessment(h.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="col-span-7">
        {!result ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center bg-slate-900/30 border border-dashed border-slate-700 rounded-lg p-8">
            <FlaskConical className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 max-w-xs">
              Run an assessment to see the Big Five, Dark Triad and behavioral risk breakdown for the text.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Overall Behavioral Risk</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-bold ${riskColor(result.overall_risk_score)}`}>
                      {result.overall_risk_score}
                    </span>
                    <span className="text-slate-500 text-lg">/100</span>
                  </div>
                  <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded border capitalize ${riskBadge(result.overall_risk_score)}`}>
                    {result.risk_classification} risk
                  </span>
                </div>
                <div className="text-right space-y-2">
                  <div className="flex items-center gap-1.5 justify-end text-xs text-slate-400">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Confidence {result.confidence_score}%</span>
                  </div>
                  {result.dominant_emotion && (
                    <p className="text-xs text-slate-400">
                      Tone: <span className="text-slate-200 capitalize">{result.dominant_emotion}</span>
                    </p>
                  )}
                  {result.communication_style && (
                    <p className="text-xs text-slate-400 max-w-[180px]">
                      Style: <span className="text-slate-200">{result.communication_style}</span>
                    </p>
                  )}
                </div>
              </div>

              {result.summary && (
                <p className="text-sm text-slate-300 leading-relaxed border-t border-slate-800 pt-3">{result.summary}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-3">Big Five (OCEAN)</h4>
                <div className="space-y-2.5">
                  <Trait label="Openness" score={result.openness} />
                  <Trait label="Conscientiousness" score={result.conscientiousness} />
                  <Trait label="Extraversion" score={result.extraversion} />
                  <Trait label="Agreeableness" score={result.agreeableness} />
                  <Trait label="Neuroticism" score={result.neuroticism} />
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-semibold text-red-300 uppercase tracking-wide">Dark Triad</h4>
                </div>
                <div className="space-y-2.5">
                  <Trait label="Narcissism" score={result.narcissism} danger />
                  <Trait label="Machiavellianism" score={result.machiavellianism} danger />
                  <Trait label="Psychopathy" score={result.psychopathy} danger />
                </div>
                <h4 className="text-xs font-semibold text-orange-300 uppercase tracking-wide mt-4 mb-3">Behavioral Signals</h4>
                <div className="space-y-2.5">
                  <Trait label="Manipulation" score={result.manipulation} danger />
                  <Trait label="Deception" score={result.deception} danger />
                  <Trait label="Impulsivity" score={result.impulsivity} danger />
                  <Trait label="Aggression" score={result.aggression} danger />
                </div>
              </div>
            </div>

            {result.key_indicators && result.key_indicators.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Key Indicators</h4>
                <div className="flex flex-wrap gap-2">
                  {result.key_indicators.map((ind, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-600 text-center">
              Indicative model output for testing only — not a clinical diagnosis. Model {result.model_version}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
