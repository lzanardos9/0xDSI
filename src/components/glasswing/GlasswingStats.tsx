import { useEffect, useRef, useState } from 'react';
import { Shield, AlertTriangle, Bug, Eye, Crosshair, Clock, TrendingUp } from 'lucide-react';

interface GlasswingStatsProps {
  stats: {
    totalVulns: number;
    criticalCount: number;
    highCount: number;
    unpatchedCount: number;
    avgConfidence: number;
    totalScans: number;
    activeScans: number;
    exploitChains: number;
    oldestVulnDays: number;
  };
}

export default function GlasswingStats({ stats }: GlasswingStatsProps) {
  const [animatedValues, setAnimatedValues] = useState({
    totalVulns: 0,
    criticalCount: 0,
    highCount: 0,
    unpatchedCount: 0,
    avgConfidence: 0,
    exploitChains: 0,
  });

  useEffect(() => {
    const duration = 1200;
    const start = Date.now();
    const initial = { ...animatedValues };

    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      setAnimatedValues({
        totalVulns: Math.round(initial.totalVulns + (stats.totalVulns - initial.totalVulns) * ease),
        criticalCount: Math.round(initial.criticalCount + (stats.criticalCount - initial.criticalCount) * ease),
        highCount: Math.round(initial.highCount + (stats.highCount - initial.highCount) * ease),
        unpatchedCount: Math.round(initial.unpatchedCount + (stats.unpatchedCount - initial.unpatchedCount) * ease),
        avgConfidence: Math.round((initial.avgConfidence + (stats.avgConfidence - initial.avgConfidence) * ease) * 10) / 10,
        exploitChains: Math.round(initial.exploitChains + (stats.exploitChains - initial.exploitChains) * ease),
      });

      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [stats]);

  const cards = [
    {
      label: 'Vulnerabilities Found',
      value: animatedValues.totalVulns,
      icon: Bug,
      color: 'text-cyan-400',
      bg: 'bg-cyan-950/30',
      border: 'border-cyan-500/20',
      sub: `${stats.totalScans} scans completed`,
    },
    {
      label: 'Critical Findings',
      value: animatedValues.criticalCount,
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-950/30',
      border: 'border-red-500/20',
      sub: `${animatedValues.highCount} high severity`,
    },
    {
      label: 'Unpatched',
      value: animatedValues.unpatchedCount,
      icon: Shield,
      color: 'text-amber-400',
      bg: 'bg-amber-950/30',
      border: 'border-amber-500/20',
      sub: 'Require immediate attention',
    },
    {
      label: 'Exploit Chains',
      value: animatedValues.exploitChains,
      icon: Crosshair,
      color: 'text-orange-400',
      bg: 'bg-orange-950/30',
      border: 'border-orange-500/20',
      sub: 'Validated attack paths',
    },
    {
      label: 'Model Confidence',
      value: `${animatedValues.avgConfidence}%`,
      icon: Eye,
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-500/20',
      sub: 'Avg across all findings',
    },
    {
      label: 'Oldest Vulnerability',
      value: `${Math.round(stats.oldestVulnDays / 365)}y`,
      icon: Clock,
      color: 'text-rose-400',
      bg: 'bg-rose-950/30',
      border: 'border-rose-500/20',
      sub: `${stats.oldestVulnDays.toLocaleString()} days undetected`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`${card.bg} border ${card.border} rounded-xl p-3 transition-all hover:scale-[1.02] hover:shadow-lg`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center justify-between mb-2">
            <card.icon className={`w-4 h-4 ${card.color}`} />
            {stats.activeScans > 0 && card.label === 'Vulnerabilities Found' && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[9px] text-cyan-400">LIVE</span>
              </div>
            )}
          </div>
          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{card.label}</p>
          <p className="text-[9px] text-slate-600 mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
