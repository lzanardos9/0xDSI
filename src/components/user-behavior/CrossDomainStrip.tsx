import { ArrowRight, Activity, Brain, Eye } from 'lucide-react';

interface Props {
  currentTab: string;
  behaviorAnomalies: number;
  llmHighRiskCount: number;
  psychFactorCount: number;
  hasLlm: boolean;
  hasPsych: boolean;
  onPivot: (tab: string) => void;
}

export function CrossDomainStrip({
  currentTab,
  behaviorAnomalies,
  llmHighRiskCount,
  psychFactorCount,
  hasLlm,
  hasPsych,
  onPivot,
}: Props) {
  const items: Array<{ tab: string; icon: any; label: string; count: number; show: boolean }> = [
    {
      tab: 'timeline',
      icon: Activity,
      label: 'behavioral anomaly',
      count: behaviorAnomalies,
      show: currentTab !== 'timeline' && currentTab !== 'overview' && behaviorAnomalies > 0,
    },
    {
      tab: 'llm',
      icon: Brain,
      label: 'high-risk LLM interaction',
      count: llmHighRiskCount,
      show: currentTab !== 'llm' && hasLlm && llmHighRiskCount > 0,
    },
    {
      tab: 'psychology',
      icon: Eye,
      label: 'psychological risk factor',
      count: psychFactorCount,
      show: currentTab !== 'psychology' && hasPsych && psychFactorCount > 0,
    },
  ];

  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
      <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wide mb-2">Cross-Domain Signals</div>
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <button
            key={item.tab}
            onClick={() => onPivot(item.tab)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 hover:bg-slate-900 border border-amber-500/30 hover:border-amber-400 rounded-md text-xs text-slate-200 transition group"
          >
            <item.icon className="w-3.5 h-3.5 text-amber-400" />
            <span>
              <span className="font-bold text-amber-300">{item.count}</span>{' '}
              {item.label}{item.count > 1 ? 's' : ''} on this user
            </span>
            <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-amber-400 transition" />
          </button>
        ))}
      </div>
    </div>
  );
}
