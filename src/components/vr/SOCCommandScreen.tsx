import { useEffect, useRef, useState } from 'react';
import { Radio, AlertTriangle, TrendingUp, Zap } from 'lucide-react';

interface FeedItem {
  msg: string;
  color: string;
  time: string;
  severity: string;
}

interface Props {
  feed: FeedItem[];
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  critical: { bg: 'bg-red-500/8', border: 'border-red-500/20', dot: 'bg-red-400', label: 'CRIT' },
  high: { bg: 'bg-amber-500/8', border: 'border-amber-500/20', dot: 'bg-amber-400', label: 'HIGH' },
  medium: { bg: 'bg-blue-500/8', border: 'border-blue-500/20', dot: 'bg-blue-400', label: 'MED' },
  low: { bg: 'bg-slate-500/8', border: 'border-slate-500/20', dot: 'bg-slate-500', label: 'LOW' },
};

export default function SOCCommandScreen({ feed }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [eps, setEps] = useState(2847);
  const [rulesEval, setRulesEval] = useState(1243);
  const [latency, setLatency] = useState(12);

  useEffect(() => {
    const iv = setInterval(() => {
      setEps(prev => prev + Math.floor(Math.random() * 40) - 15);
      setRulesEval(prev => prev + Math.floor(Math.random() * 20) - 5);
      setLatency(prev => Math.max(4, Math.min(28, prev + Math.floor(Math.random() * 6) - 3)));
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feed.length]);

  const critCount = feed.filter(f => f.severity === 'critical').length;
  const highCount = feed.filter(f => f.severity === 'high').length;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
      <div
        className="w-[70%] h-[80%] flex flex-col overflow-hidden rounded-2xl border border-cyan-500/15"
        style={{
          background: 'linear-gradient(180deg, rgba(2,6,23,0.75) 0%, rgba(2,6,23,0.85) 100%)',
          boxShadow: '0 0 60px rgba(6,182,212,0.04), 0 0 120px rgba(0,0,0,0.3), inset 0 1px 0 rgba(6,182,212,0.06), inset 0 0 80px rgba(6,182,212,0.02)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Radio className="w-4 h-4 text-cyan-400" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            <span className="text-[11px] font-black text-slate-300 tracking-[0.2em]">AGENT COMMUNICATION FEED</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30">
              <TrendingUp className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-cyan-300 font-bold tabular-nums">{eps.toLocaleString()} EPS</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] text-emerald-300 font-bold tabular-nums">{rulesEval} rules</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/30">
              <span className="text-[9px] text-amber-300 font-bold tabular-nums">{latency}ms</span>
            </div>
            {critCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-[9px] text-red-400 font-bold">{critCount} CRIT</span>
              </div>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
          {feed.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Radio className="w-8 h-8 text-slate-700 mx-auto mb-3 animate-pulse" />
                <p className="text-xs text-slate-600">Initializing agent mesh network...</p>
                <p className="text-[10px] text-slate-700 mt-1">Waiting for inter-agent communications</p>
              </div>
            </div>
          )}
          {feed.map((item, i) => {
            const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.low;
            return (
              <div
                key={`${item.time}-${i}`}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-all duration-500 ${sev.bg} ${sev.border} ${
                  i === 0 ? 'ring-1 ring-opacity-30' : i < 3 ? 'opacity-90' : i < 6 ? 'opacity-70' : 'opacity-50'
                }`}
                style={i === 0 ? { ringColor: item.color + '40' } : undefined}
              >
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot} ${
                    item.severity === 'critical' ? 'animate-pulse shadow-sm shadow-red-400/50' : ''
                  }`} />
                  <span className={`text-[8px] font-black tracking-wider w-6 ${
                    item.severity === 'critical' ? 'text-red-400' :
                    item.severity === 'high' ? 'text-amber-400' :
                    item.severity === 'medium' ? 'text-blue-400' : 'text-slate-500'
                  }`}>{sev.label}</span>
                </div>
                <span className="text-[10px] text-slate-500 flex-shrink-0 tabular-nums font-mono">{item.time}</span>
                <span className="text-[11px] leading-relaxed" style={{ color: item.color }}>{item.msg}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-t border-cyan-500/10 bg-slate-900/30">
          <div className="flex items-center gap-3">
            {['Atlas', 'Sage', 'Commander', 'Nova', 'Vanguard'].map((name, i) => {
              const colors = ['#f59e0b', '#14b8a6', '#06b6d4', '#3b82f6', '#ef4444'];
              return (
                <div key={name} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: colors[i], animationDelay: `${i * 200}ms` }} />
                  <span className="text-[8px] font-bold" style={{ color: colors[i] }}>{name}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-600">{feed.length} messages</span>
            <span className="text-[9px] text-slate-700">|</span>
            <span className="text-[9px] text-slate-600">{highCount + critCount} priority</span>
          </div>
        </div>
      </div>
    </div>
  );
}
