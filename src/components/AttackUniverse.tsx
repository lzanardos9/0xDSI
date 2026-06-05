import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Globe, Server, Cloud, Database, Users,
  Cpu, Lock, AlertTriangle, Eye, Zap, Activity,
  Target, Crosshair, TrendingUp
} from 'lucide-react';

interface OrbitalDomain {
  id: string;
  name: string;
  icon: any;
  angle: number;
  health: number;
  pressure: number;
  active: boolean;
  color: string;
  attacks: number;
}

interface EnergyFlow {
  from: string;
  to: string;
  intensity: number;
  active: boolean;
}

interface NegativeCorrelation {
  domain: string;
  expected: string;
  severity: 'critical' | 'high' | 'medium';
}

interface MemoryTrail {
  id: string;
  label: string;
  age: number;
  type: 'incident' | 'campaign' | 'malware' | 'asset' | 'identity';
}

type SeverityLevel = 'normal' | 'elevated' | 'high' | 'critical';

const DOMAINS: OrbitalDomain[] = [
  { id: 'identity', name: 'Identity', icon: Users, angle: 0, health: 72, pressure: 68, active: true, color: '#06b6d4', attacks: 14 },
  { id: 'endpoint', name: 'Endpoint', icon: Cpu, angle: 51.4, health: 58, pressure: 82, active: true, color: '#f59e0b', attacks: 23 },
  { id: 'network', name: 'Network', icon: Globe, angle: 102.8, health: 85, pressure: 45, active: true, color: '#10b981', attacks: 7 },
  { id: 'application', name: 'Application', icon: Server, angle: 154.3, health: 91, pressure: 22, active: false, color: '#8b5cf6', attacks: 3 },
  { id: 'cloud', name: 'Cloud', icon: Cloud, angle: 205.7, health: 64, pressure: 71, active: true, color: '#3b82f6', attacks: 18 },
  { id: 'data', name: 'Data', icon: Database, angle: 257.1, health: 44, pressure: 89, active: true, color: '#ef4444', attacks: 31 },
  { id: 'physical', name: 'Physical', icon: Lock, angle: 308.6, health: 96, pressure: 12, active: false, color: '#6366f1', attacks: 1 },
];

const FLOWS: EnergyFlow[] = [
  { from: 'identity', to: 'endpoint', intensity: 0.8, active: true },
  { from: 'endpoint', to: 'cloud', intensity: 0.6, active: true },
  { from: 'cloud', to: 'data', intensity: 0.9, active: true },
  { from: 'identity', to: 'cloud', intensity: 0.4, active: true },
  { from: 'network', to: 'endpoint', intensity: 0.3, active: false },
];

const NEGATIVE_CORRELATIONS: NegativeCorrelation[] = [
  { domain: 'identity', expected: 'MFA Challenge', severity: 'critical' },
  { domain: 'endpoint', expected: 'EDR Heartbeat', severity: 'high' },
  { domain: 'data', expected: 'DLP Scan Confirmation', severity: 'critical' },
];

const MEMORY_TRAIL: MemoryTrail[] = [
  { id: '1', label: 'SUNBURST Supply Chain', age: 0, type: 'campaign' },
  { id: '2', label: 'Lateral Movement #7', age: 1, type: 'incident' },
  { id: '3', label: 'Cobalt Strike Beacon', age: 2, type: 'malware' },
  { id: '4', label: 'DC-PROD-01', age: 3, type: 'asset' },
  { id: '5', label: 'svc_backup@corp', age: 4, type: 'identity' },
  { id: '6', label: 'Golden Ticket Forge', age: 5, type: 'incident' },
  { id: '7', label: 'C2 Channel Detected', age: 6, type: 'malware' },
];

const AttackUniverse = () => {
  const [severity, setSeverity] = useState<SeverityLevel>('critical');
  const [domains, setDomains] = useState(DOMAINS);
  const [flows, setFlows] = useState(FLOWS);
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [coreEnergy, setCoreEnergy] = useState(0.85);
  const [rotation, setRotation] = useState(0);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [threatActor, setThreatActor] = useState({ name: 'APT-29 (Cozy Bear)', confidence: 92, objective: 'Data Exfiltration' });
  const [forecastPath, setForecastPath] = useState(['cloud', 'data']);
  const animRef = useRef<number>(0);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame++;
      setRotation(prev => prev + 0.08);
      setPulsePhase(prev => prev + 0.03);

      if (frame % 120 === 0) {
        setDomains(prev => prev.map(d => ({
          ...d,
          pressure: Math.max(5, Math.min(99, d.pressure + (Math.random() - 0.45) * 8)),
          attacks: d.active ? d.attacks + (Math.random() > 0.7 ? 1 : 0) : d.attacks,
        })));
        setCoreEnergy(prev => Math.max(0.6, Math.min(1.0, prev + (Math.random() - 0.4) * 0.05)));
      }

      if (frame % 300 === 0) {
        setFlows(prev => prev.map(f => ({
          ...f,
          intensity: Math.max(0.2, Math.min(1.0, f.intensity + (Math.random() - 0.5) * 0.2)),
        })));
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const getSeverityColor = useCallback((s: SeverityLevel) => {
    switch (s) {
      case 'normal': return { primary: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' };
      case 'elevated': return { primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' };
      case 'high': return { primary: '#f97316', glow: 'rgba(249, 115, 22, 0.4)' };
      case 'critical': return { primary: '#ef4444', glow: 'rgba(239, 68, 68, 0.5)' };
    }
  }, []);

  const colors = getSeverityColor(severity);
  const coreRadius = 70;
  const orbitRadius = 200;
  const cx = 400;
  const cy = 300;

  const getDomainPosition = (domain: OrbitalDomain) => {
    const angle = ((domain.angle + rotation) * Math.PI) / 180;
    return {
      x: cx + Math.cos(angle) * orbitRadius,
      y: cy + Math.sin(angle) * orbitRadius,
    };
  };

  const renderAttackCore = () => {
    const pulse = Math.sin(pulsePhase) * 0.15 + 0.85;
    const pulse2 = Math.sin(pulsePhase * 1.3 + 1) * 0.1 + 0.9;

    return (
      <g>
        {/* Outer energy rings */}
        <circle cx={cx} cy={cy} r={coreRadius * 1.8} fill="none" stroke={colors.primary} strokeWidth="0.5" opacity={0.15 + Math.sin(pulsePhase * 0.5) * 0.1} strokeDasharray="4 8" />
        <circle cx={cx} cy={cy} r={coreRadius * 1.5} fill="none" stroke={colors.primary} strokeWidth="0.8" opacity={0.2 + Math.sin(pulsePhase * 0.7) * 0.1} strokeDasharray="2 6" />

        {/* Core glow layers */}
        <circle cx={cx} cy={cy} r={coreRadius * 1.3 * pulse} fill={`url(#coreGlow)`} opacity={0.3 * coreEnergy} />
        <circle cx={cx} cy={cy} r={coreRadius * pulse2} fill={`url(#coreGradient)`} opacity={0.9} />
        <circle cx={cx} cy={cy} r={coreRadius * 0.7 * pulse} fill={`url(#coreInner)`} opacity={0.8} />

        {/* Core highlight */}
        <circle cx={cx - 15} cy={cy - 20} r={coreRadius * 0.3} fill="white" opacity={0.08} />

        {/* Severity indicator */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="white" fontSize="11" fontWeight="700" opacity={0.9}>
          ATTACK CORE
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={colors.primary} fontSize="18" fontWeight="800" letterSpacing="2">
          {severity.toUpperCase()}
        </text>
        <text x={cx} y={cy + 28} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9" fontWeight="500">
          Energy: {Math.round(coreEnergy * 100)}%
        </text>
      </g>
    );
  };

  const renderOrbitalDomains = () => {
    return domains.map((domain) => {
      const pos = getDomainPosition(domain);
      const isHovered = hoveredDomain === domain.id;
      const isSelected = selectedDomain === domain.id;
      const hasNegCorr = NEGATIVE_CORRELATIONS.some(nc => nc.domain === domain.id);
      const nodeRadius = isHovered ? 32 : 26;
      const pressureColor = domain.pressure > 70 ? '#ef4444' : domain.pressure > 40 ? '#f59e0b' : '#10b981';

      return (
        <g
          key={domain.id}
          onMouseEnter={() => setHoveredDomain(domain.id)}
          onMouseLeave={() => setHoveredDomain(null)}
          onClick={() => setSelectedDomain(selectedDomain === domain.id ? null : domain.id)}
          style={{ cursor: 'pointer' }}
        >
          {/* Pressure ring */}
          <circle
            cx={pos.x} cy={pos.y} r={nodeRadius + 6}
            fill="none"
            stroke={pressureColor}
            strokeWidth="2"
            strokeDasharray={`${(domain.pressure / 100) * (2 * Math.PI * (nodeRadius + 6))} ${2 * Math.PI * (nodeRadius + 6)}`}
            strokeDashoffset={(2 * Math.PI * (nodeRadius + 6)) * 0.25}
            opacity={0.6}
            style={{ transition: 'all 0.5s ease' }}
          />

          {/* Domain node */}
          <circle
            cx={pos.x} cy={pos.y} r={nodeRadius}
            fill={`${domain.color}15`}
            stroke={domain.color}
            strokeWidth={isHovered || isSelected ? 2 : 1}
            opacity={domain.active ? 1 : 0.5}
            style={{ transition: 'all 0.3s ease' }}
          />

          {/* Negative correlation fracture */}
          {hasNegCorr && (
            <>
              <line
                x1={pos.x - 12} y1={pos.y - 8}
                x2={pos.x + 8} y2={pos.y + 12}
                stroke="#ef4444" strokeWidth="2" opacity={0.7 + Math.sin(pulsePhase * 2) * 0.3}
              />
              <line
                x1={pos.x - 6} y1={pos.y + 10}
                x2={pos.x + 14} y2={pos.y - 6}
                stroke="#ef4444" strokeWidth="1.5" opacity={0.5 + Math.sin(pulsePhase * 2.5) * 0.3}
              />
            </>
          )}

          {/* Domain label */}
          <text
            x={pos.x} y={pos.y + nodeRadius + 16}
            textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontWeight="600"
          >
            {domain.name}
          </text>

          {/* Attack count badge */}
          {domain.active && domain.attacks > 0 && (
            <>
              <circle cx={pos.x + nodeRadius - 4} cy={pos.y - nodeRadius + 4} r="8" fill="#ef4444" opacity="0.9" />
              <text x={pos.x + nodeRadius - 4} y={pos.y - nodeRadius + 7.5} textAnchor="middle" fill="white" fontSize="7" fontWeight="700">
                {domain.attacks}
              </text>
            </>
          )}

          {/* Hover tooltip */}
          {isHovered && (
            <g>
              <rect x={pos.x - 60} y={pos.y - nodeRadius - 50} width="120" height="40" rx="6" fill="rgba(15,23,42,0.95)" stroke="rgba(100,116,139,0.3)" strokeWidth="1" />
              <text x={pos.x} y={pos.y - nodeRadius - 35} textAnchor="middle" fill="white" fontSize="9" fontWeight="600">
                Health: {domain.health}% | Pressure: {domain.pressure}%
              </text>
              <text x={pos.x} y={pos.y - nodeRadius - 22} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8">
                {domain.attacks} active attacks
              </text>
            </g>
          )}
        </g>
      );
    });
  };

  const renderEnergyFlows = () => {
    return flows.filter(f => f.active).map((flow, i) => {
      const fromDomain = domains.find(d => d.id === flow.from);
      const toDomain = domains.find(d => d.id === flow.to);
      if (!fromDomain || !toDomain) return null;

      const fromPos = getDomainPosition(fromDomain);
      const toPos = getDomainPosition(toDomain);

      const midX = (fromPos.x + toPos.x) / 2 + (Math.sin(pulsePhase + i) * 15);
      const midY = (fromPos.y + toPos.y) / 2 + (Math.cos(pulsePhase + i) * 15);

      return (
        <g key={`${flow.from}-${flow.to}`}>
          <path
            d={`M ${fromPos.x} ${fromPos.y} Q ${midX} ${midY} ${toPos.x} ${toPos.y}`}
            fill="none"
            stroke={`url(#flowGradient-${i})`}
            strokeWidth={flow.intensity * 3}
            opacity={0.4 + flow.intensity * 0.4}
            strokeLinecap="round"
          />
          {/* Animated energy particle */}
          <circle r={2 + flow.intensity * 2} fill={colors.primary} opacity={0.8}>
            <animateMotion
              dur={`${2 + (1 - flow.intensity) * 2}s`}
              repeatCount="indefinite"
              path={`M ${fromPos.x} ${fromPos.y} Q ${midX} ${midY} ${toPos.x} ${toPos.y}`}
            />
          </circle>
          <defs>
            <linearGradient id={`flowGradient-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fromDomain.color} stopOpacity={flow.intensity} />
              <stop offset="100%" stopColor={toDomain.color} stopOpacity={flow.intensity * 0.6} />
            </linearGradient>
          </defs>
        </g>
      );
    });
  };

  const renderForecast = () => {
    const forecastDomains = forecastPath.map(id => domains.find(d => d.id === id)).filter(Boolean) as OrbitalDomain[];
    if (forecastDomains.length < 2) return null;

    const points = forecastDomains.map(d => getDomainPosition(d));

    return (
      <g opacity={0.4 + Math.sin(pulsePhase * 0.8) * 0.15}>
        {points.slice(0, -1).map((p, i) => {
          const next = points[i + 1];
          return (
            <line
              key={i}
              x1={p.x} y1={p.y}
              x2={next.x} y2={next.y}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity={0.6}
            />
          );
        })}
        <text x={points[points.length - 1].x} y={points[points.length - 1].y - 35} textAnchor="middle" fill="#ef4444" fontSize="8" fontWeight="600" opacity="0.8">
          PREDICTED PATH
        </text>
      </g>
    );
  };

  const renderMemoryTrail = () => {
    return (
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider">Confluence Memory Trail</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {MEMORY_TRAIL.map((item) => {
            const opacity = Math.max(0.3, 1 - item.age * 0.12);
            const typeColors: Record<string, string> = {
              incident: 'border-red-500/40 text-red-400',
              campaign: 'border-amber-500/40 text-amber-400',
              malware: 'border-orange-500/40 text-orange-400',
              asset: 'border-blue-500/40 text-blue-400',
              identity: 'border-cyan-500/40 text-cyan-400',
            };
            return (
              <div
                key={item.id}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-md border bg-slate-900/60 backdrop-blur-sm ${typeColors[item.type]}`}
                style={{ opacity }}
              >
                <div className="text-[9px] font-medium whitespace-nowrap">{item.label}</div>
                <div className="text-[8px] text-slate-500 capitalize">{item.type}</div>
              </div>
            );
          })}
          <div className="flex-shrink-0 w-16 h-8 bg-gradient-to-r from-transparent to-slate-900/0 rounded" />
        </div>
      </div>
    );
  };

  const renderThreatActor = () => (
    <div className="absolute top-4 right-4 w-48">
      <div
        className="relative rounded-xl border border-red-500/20 bg-slate-900/80 backdrop-blur-md p-3 overflow-hidden"
        style={{ opacity: threatActor.confidence / 100 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-2">
            <Crosshair className="w-3 h-3 text-red-400" />
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Threat Actor</span>
          </div>
          <div className="text-sm font-bold text-white mb-0.5">{threatActor.name}</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: `${threatActor.confidence}%` }} />
            </div>
            <span className="text-[10px] font-bold text-red-400">{threatActor.confidence}%</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Objective: <span className="text-amber-400 font-medium">{threatActor.objective}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNegativeCorrelations = () => (
    <div className="absolute top-4 left-4 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertTriangle className="w-3 h-3 text-red-400" />
        <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Missing Events</span>
      </div>
      {NEGATIVE_CORRELATIONS.map((nc, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-red-500/20 bg-red-500/5 backdrop-blur-sm"
          style={{ animation: `pulse 2s ease-in-out ${i * 0.3}s infinite` }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <div>
            <div className="text-[9px] font-medium text-red-300">{nc.expected}</div>
            <div className="text-[8px] text-slate-500 capitalize">{nc.domain} domain</div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderSeveritySelector = () => (
    <div className="absolute bottom-4 right-4 flex items-center gap-1">
      {(['normal', 'elevated', 'high', 'critical'] as SeverityLevel[]).map((s) => {
        const c = getSeverityColor(s);
        return (
          <button
            key={s}
            onClick={() => setSeverity(s)}
            className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider border transition-all ${
              severity === s
                ? 'border-white/20 bg-white/5'
                : 'border-transparent hover:border-white/10'
            }`}
            style={{ color: c.primary }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative w-full rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900/95 via-[#0a0f1e] to-slate-900/95 backdrop-blur-xl overflow-hidden" style={{ height: '580px' }}>
      {/* Title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center">
        <div className="flex items-center gap-2 justify-center">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.primary }} />
          <span className="text-[10px] font-bold uppercase tracking-[3px] text-slate-400">Attack Universe</span>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.primary }} />
        </div>
      </div>

      {/* Main SVG Visualization */}
      <svg viewBox="0 0 800 600" className="w-full h-full" style={{ filter: `drop-shadow(0 0 40px ${colors.glow})` }}>
        <defs>
          <radialGradient id="coreGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.primary} stopOpacity="0.8" />
            <stop offset="60%" stopColor={colors.primary} stopOpacity="0.3" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.primary} stopOpacity="0.4" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreInner" cx="40%" cy="40%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.15" />
            <stop offset="50%" stopColor={colors.primary} stopOpacity="0.6" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* Orbital path */}
        <circle cx={cx} cy={cy} r={orbitRadius} fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="1" strokeDasharray="3 6" />

        {/* Energy flows */}
        {renderEnergyFlows()}

        {/* Forecast path */}
        {renderForecast()}

        {/* Attack Core */}
        {renderAttackCore()}

        {/* Orbital domains */}
        {renderOrbitalDomains()}
      </svg>

      {/* Overlays */}
      {renderThreatActor()}
      {renderNegativeCorrelations()}
      {renderMemoryTrail()}
      {renderSeveritySelector()}

      {/* Ambient particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              backgroundColor: colors.primary,
              opacity: 0.3 + Math.random() * 0.3,
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              animation: `float ${4 + Math.random() * 4}s ease-in-out ${Math.random() * 3}s infinite alternate`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes float {
          from { transform: translate(0, 0) scale(1); opacity: 0.2; }
          to { transform: translate(${Math.random() * 20 - 10}px, ${Math.random() * 20 - 10}px) scale(1.5); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default AttackUniverse;
