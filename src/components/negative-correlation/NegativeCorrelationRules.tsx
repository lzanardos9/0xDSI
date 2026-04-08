import { useState } from 'react';
import { Search, ChevronDown, ChevronRight, AlertTriangle, Eye, EyeOff, Code, Clock, Shield, Crosshair, Zap, MapPin, GitBranch } from 'lucide-react';

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

interface NegativeCorrelationRulesProps {
  rules: Rule[];
  loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle; color: string; bgColor: string; description: string }> = {
  missing_prerequisite: {
    label: 'Missing Prerequisite',
    icon: GitBranch,
    color: 'text-red-400',
    bgColor: 'bg-red-950/30 border-red-500/20',
    description: 'Something happened, but the thing that MUST happen first didn\'t',
  },
  impossible_coexistence: {
    label: 'Impossible Coexistence',
    icon: Zap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-950/30 border-amber-500/20',
    description: 'Two events that physically/logically CANNOT both be true',
  },
  missing_consequence: {
    label: 'Missing Consequence',
    icon: Eye,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-950/30 border-cyan-500/20',
    description: 'Something completed, but expected side effects never appeared',
  },
  temporal_impossibility: {
    label: 'Temporal Impossibility',
    icon: Clock,
    color: 'text-orange-400',
    bgColor: 'bg-orange-950/30 border-orange-500/20',
    description: 'Events in a time sequence that violates physical constraints',
  },
  physics_violation: {
    label: 'Physics Violation',
    icon: MapPin,
    color: 'text-rose-400',
    bgColor: 'bg-rose-950/30 border-rose-500/20',
    description: 'Real-world physical constraints make this impossible',
  },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
};

function formatTimeWindow(seconds: number): string {
  if (seconds === 0) return 'Instant';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export default function NegativeCorrelationRules({ rules, loading }: NegativeCorrelationRulesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showQuery, setShowQuery] = useState<string | null>(null);

  const filtered = rules.filter(r => {
    const matchesSearch = !searchQuery ||
      r.rule_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.rule_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || r.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Object.entries(CATEGORY_CONFIG);
  const categoryCounts = rules.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
            !selectedCategory
              ? 'bg-slate-700 border-slate-600 text-white'
              : 'bg-slate-800/50 border-slate-700/30 text-slate-500 hover:text-slate-300'
          }`}
        >
          All ({rules.length})
        </button>
        {categories.map(([key, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                selectedCategory === key
                  ? `${config.bgColor} ${config.color}`
                  : 'bg-slate-800/50 border-slate-700/30 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3 h-3" />
              {config.label} ({categoryCounts[key] || 0})
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search rules by name, code, or description..."
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/30 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      <div className="space-y-2">
        {filtered.map(rule => {
          const catConfig = CATEGORY_CONFIG[rule.category] || CATEGORY_CONFIG.missing_prerequisite;
          const CatIcon = catConfig.icon;
          const isExpanded = expandedRule === rule.id;
          const showingQuery = showQuery === rule.id;

          return (
            <div
              key={rule.id}
              className={`border rounded-xl overflow-hidden transition-all ${
                isExpanded ? `${catConfig.bgColor}` : 'bg-slate-900/30 border-slate-700/20 hover:border-slate-600/40'
              }`}
            >
              <button
                onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isExpanded ? catConfig.bgColor : 'bg-slate-800/80'}`}>
                  <CatIcon className={`w-4 h-4 ${catConfig.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500">{rule.rule_code}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${SEVERITY_STYLES[rule.severity]}`}>
                      {rule.severity}
                    </span>
                    {!rule.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-white mt-0.5 truncate">{rule.rule_name}</p>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-medium text-white">{rule.detection_count.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">detections</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-300">{rule.confidence_base}%</p>
                    <p className="text-[10px] text-slate-500">confidence</p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-700/20 pt-4">
                  <p className="text-xs text-slate-400 leading-relaxed">{rule.description}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-700/20">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Eye className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Observed Event</span>
                      </div>
                      <p className="text-xs text-slate-300">{rule.observed_event}</p>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-red-500/10">
                      <div className="flex items-center gap-1.5 mb-2">
                        <EyeOff className="w-3 h-3 text-red-400" />
                        <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Expected (Missing)</span>
                      </div>
                      <p className="text-xs text-slate-300">{rule.expected_event}</p>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-700/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Crosshair className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Constraint Logic</span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono bg-slate-900/50 p-2 rounded">{rule.constraint_logic}</p>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); setShowQuery(showingQuery ? null : rule.id); }}
                    className="flex items-center gap-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <Code className="w-3 h-3" />
                    {showingQuery ? 'Hide SQL' : 'Show Detection Query'}
                  </button>

                  {showingQuery && (
                    <div className="bg-slate-950 rounded-lg p-3 border border-cyan-500/10 overflow-x-auto">
                      <pre className="text-[11px] text-cyan-300/80 font-mono whitespace-pre-wrap">{rule.constraint_query}</pre>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/20">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] text-slate-500">
                        Window: {formatTimeWindow(rule.time_window_seconds)}
                      </span>
                      {rule.last_fired_at && (
                        <>
                          <span className="text-slate-700">|</span>
                          <span className="text-[10px] text-slate-500">
                            Last fired: {new Date(rule.last_fired_at).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                    {rule.mitre_techniques.length > 0 && (
                      <div className="flex items-center gap-1">
                        {rule.mitre_techniques.map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {rule.false_positive_notes && (
                    <div className="bg-amber-950/20 rounded-lg p-3 border border-amber-500/10">
                      <p className="text-[10px] font-semibold text-amber-400 mb-1">False Positive Notes</p>
                      <p className="text-[11px] text-amber-300/70">{rule.false_positive_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
