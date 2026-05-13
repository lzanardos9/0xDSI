import { Activity, Brain, Eye, AlertTriangle, Shield } from 'lucide-react';

interface UnifiedRiskHeaderProps {
  fullName: string;
  title?: string;
  department?: string;
  email?: string;
  profilePictureUrl?: string;
  behaviorRisk: number;
  llmRisk: number | null;
  psychRisk: number | null;
  hasLlmData: boolean;
  hasPsychData: boolean;
  activeTab: string;
  onPillClick: (tab: string) => void;
}

const pillStyles = (score: number | null) => {
  if (score === null) return 'bg-slate-800/50 border-slate-700 text-slate-500';
  if (score >= 70) return 'bg-red-500/20 border-red-500 text-red-300';
  if (score >= 40) return 'bg-orange-500/20 border-orange-500 text-orange-300';
  if (score >= 20) return 'bg-yellow-500/20 border-yellow-500 text-yellow-300';
  return 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
};

export function UnifiedRiskHeader({
  fullName,
  title,
  department,
  email,
  profilePictureUrl,
  behaviorRisk,
  llmRisk,
  psychRisk,
  hasLlmData,
  hasPsychData,
  activeTab,
  onPillClick,
}: UnifiedRiskHeaderProps) {
  const composite = Math.max(
    behaviorRisk || 0,
    llmRisk ?? 0,
    psychRisk ?? 0
  );

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start gap-5">
        {profilePictureUrl && (
          <img
            src={profilePictureUrl}
            alt={fullName}
            className="w-20 h-20 rounded-full border-4 border-slate-700"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-white truncate">{fullName}</h2>
            {title && <span className="text-slate-400 text-sm">{title}</span>}
            {department && <span className="text-slate-500 text-sm">• {department}</span>}
          </div>
          {email && <p className="text-xs text-slate-500 mt-1 truncate">{email}</p>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            <button
              onClick={() => onPillClick('timeline')}
              className={`text-left px-3 py-2 rounded-lg border transition ${pillStyles(behaviorRisk)} ${
                activeTab === 'timeline' || activeTab === 'overview' ? 'ring-2 ring-blue-400' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[11px] uppercase tracking-wide font-semibold">Behavior</span>
              </div>
              <div className="text-2xl font-bold leading-none">{behaviorRisk.toFixed(0)}</div>
            </button>

            <button
              onClick={() => onPillClick('llm')}
              className={`text-left px-3 py-2 rounded-lg border transition ${pillStyles(llmRisk)} ${
                activeTab === 'llm' ? 'ring-2 ring-blue-400' : ''
              }`}
              disabled={!hasLlmData}
            >
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-3.5 h-3.5" />
                <span className="text-[11px] uppercase tracking-wide font-semibold">LLM Risk</span>
              </div>
              <div className="text-2xl font-bold leading-none">
                {llmRisk !== null ? llmRisk : <span className="text-sm font-normal">No data</span>}
              </div>
            </button>

            <button
              onClick={() => onPillClick('psychology')}
              className={`text-left px-3 py-2 rounded-lg border transition ${pillStyles(psychRisk)} ${
                activeTab === 'psychology' ? 'ring-2 ring-blue-400' : ''
              }`}
              disabled={!hasPsychData}
            >
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px] uppercase tracking-wide font-semibold">Psychological</span>
              </div>
              <div className="text-2xl font-bold leading-none">
                {psychRisk !== null ? psychRisk : <span className="text-sm font-normal">No data</span>}
              </div>
            </button>

            <div className={`px-3 py-2 rounded-lg border ${pillStyles(composite)}`}>
              <div className="flex items-center gap-2 mb-1">
                {composite >= 70 ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                <span className="text-[11px] uppercase tracking-wide font-semibold">Composite</span>
              </div>
              <div className="text-2xl font-bold leading-none">{composite.toFixed(0)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
