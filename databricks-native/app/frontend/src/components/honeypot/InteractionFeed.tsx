import { useState, useEffect, useRef } from 'react';
import { Terminal, AlertTriangle, MapPin, Clock, Shield } from 'lucide-react';

interface Props {
  interactions: any[];
  honeypots: any[];
}

const InteractionFeed = ({ interactions, honeypots }: Props) => {
  const [visibleCount, setVisibleCount] = useState(20);
  const [liveFlash, setLiveFlash] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hpMap = new Map(honeypots.map(h => [h.id, h]));

  const sorted = [...interactions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, visibleCount);

  useEffect(() => {
    const interval = setInterval(() => {
      if (sorted.length > 0) {
        const idx = Math.floor(Math.random() * Math.min(sorted.length, 5));
        setLiveFlash(sorted[idx]?.id || null);
        setTimeout(() => setLiveFlash(null), 800);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [sorted]);

  const timeAgo = (dt: string) => {
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const sevColor: Record<string, string> = {
    critical: 'border-l-red-500 bg-red-500/5',
    high: 'border-l-orange-500 bg-orange-500/5',
    medium: 'border-l-amber-500',
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Live Interaction Feed</h3>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>
        <span className="text-xs text-slate-500">{interactions.length} total</span>
      </div>

      <div ref={containerRef} className="max-h-[400px] overflow-y-auto divide-y divide-slate-700/20">
        {sorted.map(interaction => {
          const hp = hpMap.get(interaction.honeypot_id);
          const isFlashing = liveFlash === interaction.id;

          return (
            <div
              key={interaction.id}
              className={`px-4 py-2.5 border-l-2 transition-all duration-300 ${
                sevColor[interaction.severity] || 'border-l-slate-600'
              } ${isFlashing ? 'bg-cyan-500/10 scale-[1.01]' : 'hover:bg-slate-700/20'}`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-red-400">{interaction.attacker_ip}</span>
                  {interaction.attacker_port && (
                    <span className="text-[10px] text-slate-500">:{interaction.attacker_port}</span>
                  )}
                  <span className="text-[10px] text-slate-600">|</span>
                  <span className="text-[10px] text-slate-400">{interaction.protocol}</span>
                  {interaction.threat_intel_match && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                      <Shield className="w-2.5 h-2.5 text-red-400" />
                      <span className="text-[9px] text-red-400 font-semibold">TI Match</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>{timeAgo(interaction.created_at)}</span>
                  {interaction.session_duration_seconds > 0 && (
                    <span className="text-slate-600">({interaction.session_duration_seconds}s)</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 mb-1">
                {hp && (
                  <span className="text-[10px] text-cyan-400">
                    {hp.name} ({hp.decoy_ip})
                  </span>
                )}
                {interaction.geo_location && (
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                    <MapPin className="w-2.5 h-2.5" />
                    {interaction.geo_location}
                  </span>
                )}
              </div>

              {interaction.commands_executed && interaction.commands_executed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {interaction.commands_executed.slice(0, 4).map((cmd: string, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900/60 text-emerald-400/80 border border-slate-700/40">
                      $ {cmd}
                    </span>
                  ))}
                  {interaction.commands_executed.length > 4 && (
                    <span className="px-1.5 py-0.5 text-[10px] text-slate-500">+{interaction.commands_executed.length - 4}</span>
                  )}
                </div>
              )}

              {interaction.payload_preview && (
                <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">{interaction.payload_preview}</p>
              )}
            </div>
          );
        })}
      </div>

      {visibleCount < interactions.length && (
        <div className="px-4 py-2 border-t border-slate-700/30">
          <button
            onClick={() => setVisibleCount(prev => prev + 20)}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Load more ({interactions.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractionFeed;
