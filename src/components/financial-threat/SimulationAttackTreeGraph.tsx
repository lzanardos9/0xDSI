import { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Shield,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Simulation {
  simulation_id: string;
  scenario_name: string;
  scenario_type: string;
  results: {
    detection_rate?: number;
    prevention_rate?: number;
    false_positive_rate?: number;
    avg_financial_loss?: number;
    max_financial_loss?: number;
  } | null;
  attack_paths: Array<{
    path: string;
    probability: number;
    impact: string;
    stages: string[];
  }> | null;
  iterations: number;
  confidence_interval: number;
}

interface Props {
  simulations: Simulation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hash for consistent colors per label */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Cubic bezier path between two points with horizontal flow */
function flowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

/** Determine outcome category from an attack path */
function classifyOutcome(
  probability: number,
  _impact: string,
  detectionRate: number,
  preventionRate: number,
): 'prevented' | 'detected' | 'successful' {
  const norm = probability * 100;
  if (norm * (1 - preventionRate) < 15) return 'prevented';
  if (norm * (1 - detectionRate) < 30) return 'detected';
  return 'successful';
}

const OUTCOME_COLORS: Record<string, string> = {
  prevented: '#10b981', // emerald
  detected: '#06b6d4', // cyan
  successful: '#ef4444', // red
};

const OUTCOME_GLOW: Record<string, string> = {
  prevented: 'rgba(16,185,129,0.4)',
  detected: 'rgba(6,182,212,0.4)',
  successful: 'rgba(239,68,68,0.4)',
};

const STAGE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single animated dot that travels along a path */
function FlowDot({
  pathD,
  color,
  animOffset,
  duration,
  size,
}: {
  pathD: string;
  color: string;
  animOffset: number;
  duration: number;
  size: number;
}) {
  return (
    <circle r={size} fill={color} opacity={0.9}>
      <animateMotion
        dur={`${duration}s`}
        repeatCount="indefinite"
        begin={`${animOffset}s`}
        path={pathD}
      />
    </circle>
  );
}

/** Pulsing ring behind high-probability nodes */
function PulseRing({
  cx,
  cy,
  r,
  color,
  frame,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  frame: number;
}) {
  const scale = 1 + 0.15 * Math.sin(frame * 0.08);
  const opacity = 0.25 + 0.15 * Math.sin(frame * 0.08);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r * scale}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      opacity={opacity}
    />
  );
}

// ---------------------------------------------------------------------------
// Single Simulation Section
// ---------------------------------------------------------------------------

interface SimSectionProps {
  sim: Simulation;
  index: number;
  frame: number;
}

function SimulationSection({ sim, index, frame }: SimSectionProps) {
  const paths = sim.attack_paths ?? [];
  if (paths.length === 0) return null;

  const detectionRate = sim.results?.detection_rate ?? 0;
  const preventionRate = sim.results?.prevention_rate ?? 0;

  // --- Layout constants ---
  const PADDING_X = 40;
  const PADDING_Y = 30;
  const NODE_W = 110;
  const NODE_H = 32;
  const COL_GAP = 160;

  // Build columns: entry -> stages -> outcome
  // Extract unique entry points, intermediate stages, and outcomes
  const entries: string[] = [];
  const stagesSet = new Set<string>();
  const outcomes: string[] = ['prevented', 'detected', 'successful'];

  interface FlowEdge {
    from: string;
    fromCol: number;
    to: string;
    toCol: number;
    probability: number;
    outcome: 'prevented' | 'detected' | 'successful';
    pathIndex: number;
  }

  const edges: FlowEdge[] = [];

  paths.forEach((ap, pi) => {
    const entry = ap.path.split(/[\s\->\/]+/)[0] || ap.path;
    if (!entries.includes(entry)) entries.push(entry);

    const stages = ap.stages ?? [];
    stages.forEach((s) => stagesSet.add(s));

    const outcome = classifyOutcome(
      ap.probability,
      ap.impact,
      detectionRate,
      preventionRate,
    );

    // entry -> first stage
    if (stages.length > 0) {
      edges.push({
        from: entry,
        fromCol: 0,
        to: stages[0],
        toCol: 1,
        probability: ap.probability,
        outcome,
        pathIndex: pi,
      });
      // stage -> stage
      for (let i = 0; i < stages.length - 1; i++) {
        edges.push({
          from: stages[i],
          fromCol: i + 1,
          to: stages[i + 1],
          toCol: i + 2,
          probability: ap.probability,
          outcome,
          pathIndex: pi,
        });
      }
      // last stage -> outcome
      edges.push({
        from: stages[stages.length - 1],
        fromCol: stages.length,
        to: outcome,
        toCol: stages.length + 1,
        probability: ap.probability,
        outcome,
        pathIndex: pi,
      });
    } else {
      // entry -> outcome directly
      edges.push({
        from: entry,
        fromCol: 0,
        to: outcome,
        toCol: 1,
        probability: ap.probability,
        outcome,
        pathIndex: pi,
      });
    }
  });

  const maxStageCol = Math.max(...edges.map((e) => e.toCol), 1);
  const numCols = maxStageCol + 1;

  // Build node positions per column
  type NodeInfo = { label: string; col: number; x: number; y: number };
  const nodeMap = new Map<string, NodeInfo>();

  // Collect nodes by column
  const colNodes: Map<number, string[]> = new Map();
  const addToCol = (label: string, col: number) => {
    if (!colNodes.has(col)) colNodes.set(col, []);
    const arr = colNodes.get(col)!;
    if (!arr.includes(label)) arr.push(label);
  };

  entries.forEach((e) => addToCol(e, 0));
  edges.forEach((e) => {
    addToCol(e.from, e.fromCol);
    addToCol(e.to, e.toCol);
  });

  const svgW = PADDING_X * 2 + (numCols - 1) * COL_GAP + NODE_W;
  let maxNodesInCol = 1;
  colNodes.forEach((arr) => {
    if (arr.length > maxNodesInCol) maxNodesInCol = arr.length;
  });
  const ROW_GAP = 52;
  const svgH = PADDING_Y * 2 + maxNodesInCol * ROW_GAP + 30;

  colNodes.forEach((arr, col) => {
    const totalH = arr.length * ROW_GAP;
    const startY = (svgH - totalH) / 2 + ROW_GAP / 2;
    arr.forEach((label, i) => {
      const x = PADDING_X + col * COL_GAP;
      const y = startY + i * ROW_GAP;
      const key = `${col}:${label}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { label, col, x, y });
      }
    });
  });

  // Resolve node position helper
  const getNode = (label: string, col: number): NodeInfo => {
    return (
      nodeMap.get(`${col}:${label}`) ?? {
        label,
        col,
        x: PADDING_X + col * COL_GAP,
        y: svgH / 2,
      }
    );
  };

  // Shimmer offset for glow
  const shimmer = Math.sin(frame * 0.05 + index) * 0.3 + 0.7;

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3 px-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: STAGE_COLORS[index % STAGE_COLORS.length] }}
        />
        <span className="text-sm font-semibold text-slate-200">
          {sim.scenario_name}
        </span>
        <span className="text-xs text-slate-500">
          {sim.scenario_type} &middot; {sim.iterations.toLocaleString()} iterations &middot;{' '}
          {(sim.confidence_interval * 100).toFixed(0)}% CI
        </span>
      </div>

      <div
        className="rounded-lg border border-slate-800/60 overflow-hidden"
        style={{ backgroundColor: 'rgba(8,12,22,0.6)' }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ minHeight: 180 }}
        >
          <defs>
            {/* Gradient for each outcome type */}
            {outcomes.map((oc) => (
              <linearGradient
                key={`grad-${index}-${oc}`}
                id={`grad-${index}-${oc}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop
                  offset="0%"
                  stopColor={OUTCOME_COLORS[oc]}
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor={OUTCOME_COLORS[oc]}
                  stopOpacity={0.45}
                />
              </linearGradient>
            ))}
            {/* Glow filter */}
            <filter id={`glow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Draw flow edges */}
          {edges.map((edge, ei) => {
            const fromNode = getNode(edge.from, edge.fromCol);
            const toNode = getNode(edge.to, edge.toCol);
            const x1 = fromNode.x + NODE_W;
            const y1 = fromNode.y;
            const x2 = toNode.x;
            const y2 = toNode.y;
            const d = flowPath(x1, y1, x2, y2);
            const strokeW = Math.max(1.5, edge.probability * 12);
            const color = OUTCOME_COLORS[edge.outcome];
            const isHigh = edge.probability > 0.5;

            return (
              <g key={`edge-${index}-${ei}`}>
                {/* Shadow / glow for high-prob */}
                {isHigh && (
                  <path
                    d={d}
                    fill="none"
                    stroke={OUTCOME_GLOW[edge.outcome]}
                    strokeWidth={strokeW + 4}
                    opacity={0.3 * shimmer}
                  />
                )}
                {/* Main flow path */}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeW}
                  opacity={0.5 + edge.probability * 0.4}
                  strokeLinecap="round"
                />
                {/* Probability label */}
                {edge.fromCol === 0 && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    fill={color}
                    fontSize={9}
                    fontFamily="monospace"
                    opacity={0.8}
                  >
                    {(edge.probability * 100).toFixed(0)}%
                  </text>
                )}
                {/* Animated dots */}
                {[0, 0.33, 0.66].map((offset, di) => (
                  <FlowDot
                    key={`dot-${index}-${ei}-${di}`}
                    pathD={d}
                    color={color}
                    animOffset={offset * 3 + ei * 0.4}
                    duration={2.5 + edge.probability * 1.5}
                    size={Math.max(1.5, strokeW * 0.45)}
                  />
                ))}
              </g>
            );
          })}

          {/* Draw nodes */}
          {Array.from(nodeMap.values()).map((node) => {
            const isOutcome = outcomes.includes(node.label);
            const isEntry = node.col === 0;
            const color = isOutcome
              ? OUTCOME_COLORS[node.label] ?? '#94a3b8'
              : isEntry
                ? '#6366f1'
                : STAGE_COLORS[
                    (hashStr(node.label) % (STAGE_COLORS.length - 1)) + 1
                  ];

            // Pulsing ring for entry nodes with high total probability
            const totalProb = edges
              .filter(
                (e) =>
                  (e.from === node.label && e.fromCol === node.col) ||
                  (e.to === node.label && e.toCol === node.col),
              )
              .reduce((sum, e) => sum + e.probability, 0);
            const shouldPulse = totalProb > 0.8;

            return (
              <g key={`node-${index}-${node.col}-${node.label}`}>
                {shouldPulse && (
                  <PulseRing
                    cx={node.x + NODE_W / 2}
                    cy={node.y}
                    r={NODE_H * 0.7}
                    color={color}
                    frame={frame}
                  />
                )}
                {/* Node background */}
                <rect
                  x={node.x}
                  y={node.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={isOutcome ? `url(#grad-${index}-${node.label})` : 'rgba(15,23,42,0.8)'}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.9}
                />
                {/* Node label */}
                <text
                  x={node.x + NODE_W / 2}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill={isOutcome ? '#f1f5f9' : '#cbd5e1'}
                  fontSize={10}
                  fontWeight={isOutcome || isEntry ? 600 : 400}
                  fontFamily="system-ui, sans-serif"
                >
                  {node.label.length > 14
                    ? node.label.slice(0, 13) + '\u2026'
                    : node.label}
                </text>
                {/* Small indicator dot */}
                <circle
                  cx={node.x + (isEntry ? 0 : NODE_W)}
                  cy={node.y}
                  r={3}
                  fill={color}
                  opacity={0.7 + 0.3 * Math.sin(frame * 0.06 + node.col)}
                />
              </g>
            );
          })}

          {/* Column labels */}
          <text
            x={PADDING_X + NODE_W / 2}
            y={14}
            textAnchor="middle"
            fill="#475569"
            fontSize={9}
            fontFamily="system-ui, sans-serif"
            fontWeight={500}
          >
            ENTRY POINTS
          </text>
          {numCols > 2 && (
            <text
              x={PADDING_X + Math.floor(numCols / 2) * COL_GAP + NODE_W / 2}
              y={14}
              textAnchor="middle"
              fill="#475569"
              fontSize={9}
              fontFamily="system-ui, sans-serif"
              fontWeight={500}
            >
              STAGES
            </text>
          )}
          <text
            x={PADDING_X + (numCols - 1) * COL_GAP + NODE_W / 2}
            y={14}
            textAnchor="middle"
            fill="#475569"
            fontSize={9}
            fontFamily="system-ui, sans-serif"
            fontWeight={500}
          >
            OUTCOMES
          </text>
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SimulationAttackTreeGraph({ simulations }: Props) {
  const [frame, setFrame] = useState(0);

  // Animation tick ~30fps
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % 3600);
    }, 33);
    return () => clearInterval(id);
  }, []);

  // --- Aggregate stats ---
  const stats = useMemo(() => {
    const total = simulations.length;
    if (total === 0)
      return {
        totalIterations: 0,
        avgDetection: 0,
        avgPrevention: 0,
        totalPaths: 0,
      };

    let sumIter = 0;
    let sumDet = 0;
    let detCount = 0;
    let sumPrev = 0;
    let prevCount = 0;
    let totalPaths = 0;

    simulations.forEach((s) => {
      sumIter += s.iterations;
      if (s.results?.detection_rate != null) {
        sumDet += s.results.detection_rate;
        detCount++;
      }
      if (s.results?.prevention_rate != null) {
        sumPrev += s.results.prevention_rate;
        prevCount++;
      }
      totalPaths += s.attack_paths?.length ?? 0;
    });

    return {
      totalIterations: sumIter,
      avgDetection: detCount > 0 ? sumDet / detCount : 0,
      avgPrevention: prevCount > 0 ? sumPrev / prevCount : 0,
      totalPaths,
    };
  }, [simulations]);

  if (simulations.length === 0) {
    return (
      <div
        className="rounded-xl border border-slate-800/50 p-8 text-center"
        style={{ backgroundColor: '#080c16', minHeight: 300 }}
      >
        <Target className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">
          No simulation data available. Run a Monte Carlo simulation to visualize
          attack probability flows.
        </p>
      </div>
    );
  }

  // Background subtle grid animation offset
  const bgShift = frame * 0.2;

  return (
    <div
      className="rounded-xl border border-slate-800/50"
      style={{ backgroundColor: '#080c16', minHeight: 300 }}
    >
      {/* Header with aggregate stats */}
      <div className="border-b border-slate-800/60 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Attack Tree Probability Flow
            </h3>
          </div>
          <span className="text-xs text-slate-600 font-mono">
            {simulations.length} simulation{simulations.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {/* Total Iterations */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}
            >
              <BarChart3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Iterations</p>
              <p className="text-sm font-semibold text-slate-200 font-mono">
                {stats.totalIterations.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Avg Detection Rate */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(6,182,212,0.12)' }}
            >
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Avg Detection</p>
              <p className="text-sm font-semibold text-cyan-300 font-mono">
                {(stats.avgDetection * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Avg Prevention Rate */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Avg Prevention</p>
              <p className="text-sm font-semibold text-emerald-300 font-mono">
                {(stats.avgPrevention * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Total Attack Paths */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
            >
              <TrendingUp className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Attack Paths</p>
              <p className="text-sm font-semibold text-slate-200 font-mono">
                {stats.totalPaths}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-5 py-2.5 border-b border-slate-800/40">
        <span className="text-xs text-slate-600">Flow Legend:</span>
        {[
          { label: 'Prevented', color: OUTCOME_COLORS.prevented },
          { label: 'Detected', color: OUTCOME_COLORS.detected },
          { label: 'Successful', color: OUTCOME_COLORS.successful },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-3 h-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-400">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: '#6366f1' }}
          />
          <span className="text-xs text-slate-600">High probability pulse</span>
        </div>
      </div>

      {/* Simulation sections */}
      <div className="p-4">
        {/* Animated background grid (subtle) */}
        <svg
          width="100%"
          height="0"
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <defs>
            <pattern
              id="attack-tree-grid"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${bgShift}, 0)`}
            >
              <circle cx="15" cy="15" r="0.5" fill="#1e293b" opacity="0.3" />
            </pattern>
          </defs>
        </svg>

        {simulations.map((sim, i) => (
          <SimulationSection
            key={sim.simulation_id}
            sim={sim}
            index={i}
            frame={frame}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800/40 px-5 py-2.5 flex items-center justify-between">
        <span className="text-xs text-slate-600">
          Monte Carlo threat simulation &middot; Sankey probability flow
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: '#10b981',
              opacity: 0.6 + 0.4 * Math.sin(frame * 0.1),
            }}
          />
          <span className="text-xs text-slate-600">Live animation</span>
        </div>
      </div>
    </div>
  );
}
