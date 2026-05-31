import { useEffect, useState } from 'react';
import { Shield, Zap, AlertTriangle, Eye, Activity } from 'lucide-react';

interface StatsProps {
  honeypots: any[];
  honeytokens: any[];
  interactions: any[];
}

const HoneypotStats = ({ honeypots, honeytokens, interactions }: StatsProps) => {
  const [animatedValues, setAnimatedValues] = useState<number[]>([0, 0, 0, 0, 0]);

  const targetValues = [
    honeypots.length,
    honeytokens.length,
    honeypots.filter(h => h.status === 'triggered' || h.status === 'compromised').length + honeytokens.filter(t => t.status === 'triggered').length,
    interactions.length,
    new Set(interactions.map(i => i.attacker_ip)).size,
  ];

  useEffect(() => {
    const duration = 1200;
    const steps = 40;
    const stepDuration = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValues(targetValues.map(t => Math.round(t * eased)));
      if (step >= steps) clearInterval(interval);
    }, stepDuration);
    return () => clearInterval(interval);
  }, [honeypots.length, honeytokens.length, interactions.length]);

  const cards = [
    { label: 'Active Honeypots', value: animatedValues[0], icon: Shield, color: 'cyan', ring: 'ring-cyan-500/20' },
    { label: 'Deployed Tokens', value: animatedValues[1], icon: Eye, color: 'amber', ring: 'ring-amber-500/20' },
    { label: 'Triggered Traps', value: animatedValues[2], icon: AlertTriangle, color: 'red', ring: 'ring-red-500/20' },
    { label: 'Interactions', value: animatedValues[3], icon: Zap, color: 'emerald', ring: 'ring-emerald-500/20' },
    { label: 'Unique Attackers', value: animatedValues[4], icon: Activity, color: 'rose', ring: 'ring-rose-500/20' },
  ];

  const colorMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', glow: 'shadow-cyan-500/10' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', glow: 'shadow-amber-500/10' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', glow: 'shadow-red-500/10' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', glow: 'shadow-rose-500/10' },
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((card, i) => {
        const c = colorMap[card.color];
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-xl border ${c.border} ${c.bg} p-4 shadow-lg ${c.glow} group hover:scale-[1.02] transition-transform duration-300`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="absolute top-0 right-0 w-20 h-20 opacity-5 group-hover:opacity-10 transition-opacity">
              <Icon className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${c.bg}`}>
                <Icon className={`w-4 h-4 ${c.text}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${c.text} tabular-nums`}>{card.value}</p>
            <p className="text-xs text-slate-400 mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
};

export default HoneypotStats;
