import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight, Cpu } from 'lucide-react';

export interface MLModelInfo {
  name: string;
  type: string;
  algorithm: string;
  purpose: string;
  howItWorks: string;
  keyMetrics: string[];
}

interface Props {
  title: string;
  description: string;
  models: MLModelInfo[];
}

const TYPE_COLORS: Record<string, string> = {
  'Unsupervised': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Supervised': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Deep Learning': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Ensemble': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'NLP': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Statistical': 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  'Graph': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  'Reinforcement': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const MLModelExplainer = ({ title, description, models }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedModel, setExpandedModel] = useState<number | null>(null);

  return (
    <div className="enterprise-card border border-slate-700/30 overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <p className="text-xs text-slate-500">{models.length} ML models & algorithms in use</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {models.slice(0, 3).map((m, i) => (
            <span key={i} className={`hidden sm:inline-block px-2 py-0.5 rounded text-[9px] font-semibold border ${TYPE_COLORS[m.type] || TYPE_COLORS['Statistical']}`}>
              {m.type}
            </span>
          ))}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/30 p-4 space-y-3 bg-slate-900/30">
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {models.map((model, i) => (
              <div key={i} className="bg-slate-800/40 rounded-lg border border-slate-700/30 overflow-hidden">
                <button
                  onClick={() => setExpandedModel(expandedModel === i ? null : i)}
                  className="w-full p-3 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">{model.name}</span>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold border ${TYPE_COLORS[model.type] || TYPE_COLORS['Statistical']}`}>
                      {model.type}
                    </span>
                  </div>
                  {expandedModel === i ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
                </button>
                {expandedModel === i && (
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-700/20">
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Algorithm</p>
                      <p className="text-xs text-cyan-300 font-mono">{model.algorithm}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Purpose</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{model.purpose}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">How It Works</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{model.howItWorks}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Key Metrics</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {model.keyMetrics.map((m, j) => (
                          <span key={j} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-400 border border-slate-600/30">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MLModelExplainer;
