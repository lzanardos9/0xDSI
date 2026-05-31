import { useState, useEffect, useRef } from 'react';
import { Globe, Crosshair } from 'lucide-react';

interface MapProps {
  interactions: any[];
}

const GEO_COORDS: Record<string, { x: number; y: number }> = {
  'Moscow, Russia': { x: 62, y: 28 },
  'Beijing, China': { x: 78, y: 35 },
  'Tehran, Iran': { x: 64, y: 36 },
  'Pyongyang, North Korea': { x: 82, y: 33 },
  'Lagos, Nigeria': { x: 50, y: 50 },
  'Sao Paulo, Brazil': { x: 35, y: 62 },
  'Unknown': { x: 50, y: 50 },
};

const NETWORK_TARGET = { x: 48, y: 30 };

const HoneypotMap = ({ interactions }: MapProps) => {
  const [activeBeams, setActiveBeams] = useState<{ id: number; from: { x: number; y: number }; to: { x: number; y: number }; color: string }[]>([]);
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number }[]>([]);
  const beamIdRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * interactions.length);
      const interaction = interactions[idx];
      if (!interaction) return;

      const loc = interaction.geo_location || 'Unknown';
      const from = GEO_COORDS[loc] || GEO_COORDS['Unknown'];
      const color = interaction.severity === 'critical' ? '#ef4444' : interaction.severity === 'high' ? '#f97316' : '#22d3ee';

      const id = beamIdRef.current++;
      setActiveBeams(prev => [...prev.slice(-8), { id, from, to: NETWORK_TARGET, color }]);
      setPulses(prev => [...prev.slice(-6), { id, x: from.x, y: from.y }]);

      setTimeout(() => {
        setActiveBeams(prev => prev.filter(b => b.id !== id));
        setPulses(prev => prev.filter(p => p.id !== id));
      }, 2000);
    }, 800);

    return () => clearInterval(interval);
  }, [interactions]);

  const geoGroups: Record<string, number> = {};
  for (const i of interactions) {
    const loc = i.geo_location || 'Unknown';
    geoGroups[loc] = (geoGroups[loc] || 0) + 1;
  }

  return (
    <div className="relative rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <Globe className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-slate-300">Live Attack Origins</span>
      </div>

      <div className="relative w-full h-[280px]">
        <svg viewBox="0 0 100 70" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </radialGradient>
            {activeBeams.map(beam => (
              <linearGradient key={`grad-${beam.id}`} id={`beam-${beam.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={beam.color} stopOpacity="0">
                  <animate attributeName="stopOpacity" values="0;0.8;0" dur="1.5s" fill="freeze" />
                </stop>
                <stop offset="50%" stopColor={beam.color} stopOpacity="0">
                  <animate attributeName="stopOpacity" values="0;1;0.2" dur="1.5s" fill="freeze" />
                </stop>
                <stop offset="100%" stopColor={beam.color} stopOpacity="0.2" />
              </linearGradient>
            ))}
          </defs>

          <rect width="100" height="70" fill="#0f172a" />
          <g opacity="0.08">
            {Array.from({ length: 20 }, (_, i) => (
              <line key={`h-${i}`} x1="0" y1={i * 3.5} x2="100" y2={i * 3.5} stroke="#64748b" strokeWidth="0.1" />
            ))}
            {Array.from({ length: 28 }, (_, i) => (
              <line key={`v-${i}`} x1={i * 3.5} y1="0" x2={i * 3.5} y2="70" stroke="#64748b" strokeWidth="0.1" />
            ))}
          </g>

          {Object.entries(geoGroups).map(([loc, count]) => {
            const pos = GEO_COORDS[loc] || GEO_COORDS['Unknown'];
            const size = Math.min(1.5, 0.4 + count * 0.05);
            return (
              <g key={loc}>
                <circle cx={pos.x} cy={pos.y} r={size + 1} fill="none" stroke="#ef4444" strokeWidth="0.15" opacity="0.3">
                  <animate attributeName="r" values={`${size};${size + 2};${size}`} dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx={pos.x} cy={pos.y} r={size} fill="#ef4444" opacity="0.6" />
                <circle cx={pos.x} cy={pos.y} r={size * 0.4} fill="#fbbf24" opacity="0.9" />
              </g>
            );
          })}

          <circle cx={NETWORK_TARGET.x} cy={NETWORK_TARGET.y} r="4" fill="url(#targetGlow)" />
          <circle cx={NETWORK_TARGET.x} cy={NETWORK_TARGET.y} r="1.5" fill="none" stroke="#22d3ee" strokeWidth="0.2" opacity="0.6">
            <animate attributeName="r" values="1.5;3;1.5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={NETWORK_TARGET.x} cy={NETWORK_TARGET.y} r="0.8" fill="#22d3ee" opacity="0.9" />

          {activeBeams.map(beam => {
            const midX = (beam.from.x + beam.to.x) / 2;
            const midY = Math.min(beam.from.y, beam.to.y) - 8;
            return (
              <g key={beam.id}>
                <path
                  d={`M ${beam.from.x} ${beam.from.y} Q ${midX} ${midY} ${beam.to.x} ${beam.to.y}`}
                  fill="none"
                  stroke={beam.color}
                  strokeWidth="0.3"
                  opacity="0"
                >
                  <animate attributeName="opacity" values="0;0.8;0.2" dur="1.5s" fill="freeze" />
                  <animate attributeName="stroke-dashoffset" from="40" to="0" dur="1s" fill="freeze" />
                </path>
                <circle r="0.5" fill={beam.color}>
                  <animateMotion
                    path={`M ${beam.from.x} ${beam.from.y} Q ${midX} ${midY} ${beam.to.x} ${beam.to.y}`}
                    dur="1.2s"
                    fill="freeze"
                  />
                  <animate attributeName="opacity" values="1;0" dur="1.2s" fill="freeze" />
                </circle>
              </g>
            );
          })}

          {pulses.map(pulse => (
            <circle key={pulse.id} cx={pulse.x} cy={pulse.y} r="0.5" fill="none" stroke="#ef4444" strokeWidth="0.2">
              <animate attributeName="r" values="0.5;3" dur="1s" fill="freeze" />
              <animate attributeName="opacity" values="1;0" dur="1s" fill="freeze" />
            </circle>
          ))}
        </svg>

        <div className="absolute bottom-2 right-3 flex items-center gap-3">
          {[
            { color: 'bg-red-500', label: 'Critical' },
            { color: 'bg-orange-500', label: 'High' },
            { color: 'bg-cyan-400', label: 'Medium' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${l.color}`} />
              <span className="text-[9px] text-slate-500">{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] text-cyan-400">Your Network</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HoneypotMap;
