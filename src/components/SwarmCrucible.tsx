import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Swords, Flame, ShieldCheck, Zap, Brain, Download, Play, Pause, RotateCcw,
  Crown, Dna, Sparkles, Activity, Crosshair, Network, FileCode2, BookOpen,
  CircuitBoard, Gauge, Layers, Binary, Radar, Target,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Side = 'red' | 'blue';
const COHORTS_PER_SIDE = 12;
const PARTICLES_PER_SIDE = 5000;
const NOMINAL_POPULATION = 2_000_000;
const GENE_DIM = 8;

const RED_TRAITS = [
  { code: 'T1190', name: 'Exploit Public Facing', trait: 'Edge Exploitation' },
  { code: 'T1566', name: 'Spear Phishing', trait: 'Social Engineering' },
  { code: 'T1078', name: 'Valid Accounts', trait: 'Credential Abuse' },
  { code: 'T1055', name: 'Process Injection', trait: 'Stealth Injection' },
  { code: 'T1059', name: 'Command Scripting', trait: 'LOLBAS Living-Off-Land' },
  { code: 'T1486', name: 'Data Encrypted Impact', trait: 'Ransomware Payload' },
  { code: 'T1021', name: 'Remote Services', trait: 'Lateral Pivot' },
  { code: 'T1027', name: 'Obfuscated Files', trait: 'Polymorphic Loader' },
  { code: 'T1071', name: 'App Layer Protocol', trait: 'C2 Beaconing' },
  { code: 'T1098', name: 'Account Manipulation', trait: 'Persistence Graft' },
  { code: 'T1499', name: 'Endpoint DoS', trait: 'Resource Drain' },
  { code: 'T1195', name: 'Supply Chain', trait: 'Dependency Poison' },
];

const BLUE_TRAITS = [
  { code: 'D3-PA', name: 'Process Analysis', trait: 'Behavioral Heuristic' },
  { code: 'D3-NTA', name: 'Network Traffic Analysis', trait: 'Flow Anomaly' },
  { code: 'D3-UBA', name: 'User Behavior Analytics', trait: 'UEBA Baseline' },
  { code: 'D3-FCA', name: 'File Content Analysis', trait: 'YARA Entropy' },
  { code: 'D3-ISO', name: 'Isolation', trait: 'Micro-Segmentation' },
  { code: 'D3-AM', name: 'Access Mediation', trait: 'Zero-Trust Gate' },
  { code: 'D3-AH', name: 'Active Hunting', trait: 'Honeypot Lure' },
  { code: 'D3-CCA', name: 'Credential Compromise', trait: 'Token Binding' },
  { code: 'D3-EDR', name: 'Endpoint Detection', trait: 'Kernel Telemetry' },
  { code: 'D3-ML', name: 'ML Correlation', trait: 'Graph Embedding' },
  { code: 'D3-DEC', name: 'Deception', trait: 'Canary Asset' },
  { code: 'D3-SOR', name: 'SOAR Automation', trait: 'Auto-Containment' },
];

const rand = () => Math.random();
const randn = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

type Cohort = {
  id: string;
  side: Side;
  name: string;
  code: string;
  trait: string;
  population: number;
  alive: number;
  gene: number[];
  fitness: number;
  variance: number;
  generation: number;
  mutations: number;
  wins: number;
  losses: number;
  color: string;
};

type Particle = {
  cohortIdx: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  energy: number;
};

type Champion = {
  id: string;
  side: Side;
  name: string;
  code: string;
  trait: string;
  fitness: number;
  generation: number;
  gene: number[];
  description: string;
  promoted: boolean;
};

type RuleSeed = { id: string; name: string; technique: string; severity: string };
type MicroPattern = { id: string; name: string; support: number };

function makeCohort(side: Side, idx: number): Cohort {
  const meta = side === 'red' ? RED_TRAITS[idx % RED_TRAITS.length] : BLUE_TRAITS[idx % BLUE_TRAITS.length];
  const gene = Array.from({ length: GENE_DIM }, () => rand());
  const pop = Math.floor(NOMINAL_POPULATION / 2 / COHORTS_PER_SIDE);
  return {
    id: `${side}-${idx}`,
    side,
    name: meta.name,
    code: meta.code,
    trait: meta.trait,
    population: pop,
    alive: pop,
    gene,
    fitness: 0.5 + randn() * 0.05,
    variance: 0.1,
    generation: 0,
    mutations: 0,
    wins: 0,
    losses: 0,
    color: side === 'red'
      ? `hsl(${350 + (idx * 7) % 20}, 85%, ${55 + (idx % 3) * 5}%)`
      : `hsl(${190 + (idx * 11) % 30}, 85%, ${55 + (idx % 3) * 5}%)`,
  };
}

const TARGET_TPS = 8;

export default function SwarmCrucible() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<{ red: Particle[]; blue: Particle[] }>({ red: [], blue: [] });
  const lastTickRef = useRef<number>(0);

  const [running, setRunning] = useState(true);
  const [tick, setTick] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [cohorts, setCohorts] = useState<{ red: Cohort[]; blue: Cohort[] }>({
    red: Array.from({ length: COHORTS_PER_SIDE }, (_, i) => makeCohort('red', i)),
    blue: Array.from({ length: COHORTS_PER_SIDE }, (_, i) => makeCohort('blue', i)),
  });
  const [redElo, setRedElo] = useState(1500);
  const [blueElo, setBlueElo] = useState(1500);
  const [history, setHistory] = useState<{ red: number; blue: number }[]>([]);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [rulesSeed, setRulesSeed] = useState<RuleSeed[]>([]);
  const [microPatterns, setMicroPatterns] = useState<MicroPattern[]>([]);
  const [pipelineStep, setPipelineStep] = useState(0);

  useEffect(() => {
    const parts = { red: [] as Particle[], blue: [] as Particle[] };
    for (const side of ['red', 'blue'] as const) {
      for (let i = 0; i < PARTICLES_PER_SIDE; i++) {
        parts[side].push({
          cohortIdx: i % COHORTS_PER_SIDE,
          x: rand(),
          y: rand(),
          vx: (rand() - 0.5) * 0.002,
          vy: (rand() - 0.5) * 0.002,
          life: 1,
          energy: 0.5 + rand() * 0.5,
        });
      }
    }
    particlesRef.current = parts;
  }, []);

  useEffect(() => {
    (async () => {
      const { data: run } = await supabase
        .from('swarm_runs')
        .insert({
          run_name: `Crucible ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          status: 'running',
          nominal_population: NOMINAL_POPULATION,
          rendered_particles: PARTICLES_PER_SIDE * 2,
          mutation_rate: 0.03,
          tick_interval_ms: 125,
        })
        .select()
        .maybeSingle();
      if (run) setRunId(run.id);

      const { data: rules } = await supabase
        .from('correlation_rules')
        .select('id,rule_name,mitre_technique,severity')
        .limit(60);
      if (rules) {
        setRulesSeed(rules.map((r: any) => ({
          id: r.id,
          name: r.rule_name,
          technique: r.mitre_technique || 'T0000',
          severity: r.severity || 'medium',
        })));
      }

      const { data: micros } = await supabase
        .from('micro_patterns')
        .select('id,pattern_name,support_count')
        .limit(20);
      if (micros?.length) {
        setMicroPatterns(micros.map((m: any) => ({
          id: m.id,
          name: m.pattern_name,
          support: m.support_count || 0,
        })));
      } else {
        setMicroPatterns([
          { id: 'mp-1', name: 'Login-Burst -> Lateral-SMB', support: 312 },
          { id: 'mp-2', name: 'Phish-Click -> Token-Theft -> M365', support: 187 },
          { id: 'mp-3', name: 'CVE-Scan -> Reverse-Shell -> Persistence', support: 241 },
          { id: 'mp-4', name: 'OAuth-Consent -> Data-Exfil', support: 98 },
          { id: 'mp-5', name: 'DNS-Tunnel -> Staged-Archive', support: 145 },
          { id: 'mp-6', name: 'Kerberoast -> Golden-Ticket', support: 76 },
        ]);
      }
    })();
  }, []);

  useEffect(() => {
    const i = setInterval(() => setPipelineStep((s) => (s + 1) % 5), 1400);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (ts: number) => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = 'rgba(5, 10, 20, 0.22)';
      ctx.fillRect(0, 0, w, h);

      const midX = w / 2;
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, 'rgba(239,68,68,0.04)');
      gradient.addColorStop(0.5, 'rgba(148,163,184,0.02)');
      gradient.addColorStop(1, 'rgba(59,130,246,0.04)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      const currentCohorts = cohorts;
      const draw = (side: Side, offsetX: number) => {
        const list = particlesRef.current[side];
        const cohortList = currentCohorts[side];
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const c = cohortList[p.cohortIdx];
          const pull = side === 'red' ? 0.55 : 0.45;
          const dx = (pull - p.x) * 0.0008 * c.fitness;
          const dy = (0.5 - p.y) * 0.0004;
          p.vx += dx + (rand() - 0.5) * 0.0006;
          p.vy += dy + (rand() - 0.5) * 0.0006;
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = 0.01;
          if (p.x > 1) p.x = 0.99;
          if (p.y < 0) p.y = 0.01;
          if (p.y > 1) p.y = 0.99;

          const px = offsetX + p.x * (w / 2);
          const py = p.y * h;
          const alpha = 0.25 + c.fitness * 0.55;
          ctx.fillStyle = c.color.replace('hsl(', 'hsla(').replace(')', `,${alpha.toFixed(2)})`);
          ctx.fillRect(px, py, 1.3, 1.3);
        }
      };
      draw('red', 0);
      draw('blue', w / 2);

      const topRed = [...currentCohorts.red].sort((a, b) => b.fitness - a.fitness)[0];
      const topBlue = [...currentCohorts.blue].sort((a, b) => b.fitness - a.fitness)[0];
      if (topRed && topBlue) {
        const pulse = 0.5 + Math.sin(ts / 300) * 0.2;
        ctx.strokeStyle = `rgba(239,68,68,${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(midX - 80, h / 2, 10 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(59,130,246,${pulse})`;
        ctx.beginPath();
        ctx.arc(midX + 80, h / 2, 10 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(250,204,21,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midX - 70, h / 2);
        ctx.lineTo(midX + 70, h / 2);
        ctx.stroke();
      }

      if (ts - lastTickRef.current > 1000 / TARGET_TPS) {
        lastTickRef.current = ts;
        simulateTick();
      }
      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, cohorts]);

  const simulateTick = () => {
    setTick((t) => t + 1);
    setCohorts((prev) => {
      const next: { red: Cohort[]; blue: Cohort[] } = {
        red: prev.red.map((c) => ({ ...c })),
        blue: prev.blue.map((c) => ({ ...c })),
      };

      let redWins = 0;
      let blueWins = 0;
      const matchups = 36;

      for (let m = 0; m < matchups; m++) {
        const r = next.red[Math.floor(rand() * COHORTS_PER_SIDE)];
        const b = next.blue[Math.floor(rand() * COHORTS_PER_SIDE)];
        const rScore = r.gene.reduce((s, g, i) => s + g * (b.gene[i] - 0.5), 0) / GENE_DIM;
        const bScore = b.gene.reduce((s, g, i) => s + g * (r.gene[i] - 0.5), 0) / GENE_DIM;
        const noise = (rand() - 0.5) * 0.25;
        const outcome = rScore - bScore + noise;
        if (outcome > 0) {
          r.fitness = Math.min(1, r.fitness + 0.01);
          b.fitness = Math.max(0.05, b.fitness - 0.008);
          r.wins++;
          b.losses++;
          redWins++;
        } else {
          b.fitness = Math.min(1, b.fitness + 0.01);
          r.fitness = Math.max(0.05, r.fitness - 0.008);
          b.wins++;
          r.losses++;
          blueWins++;
        }
      }

      if (rand() < 0.12) {
        for (const side of ['red', 'blue'] as const) {
          const list = next[side];
          for (const c of list) {
            if (rand() < 0.3) {
              const g = Math.floor(rand() * GENE_DIM);
              c.gene[g] = Math.max(0, Math.min(1, c.gene[g] + randn() * 0.08));
              c.mutations++;
            }
          }
        }
      }

      if (tick > 0 && tick % 60 === 0) {
        for (const side of ['red', 'blue'] as const) {
          const list = next[side].sort((a, b) => b.fitness - a.fitness);
          const worst = list[list.length - 1];
          const best = list[0];
          worst.gene = best.gene.map((g) => Math.max(0, Math.min(1, g + randn() * 0.05)));
          worst.fitness = best.fitness * 0.6;
          worst.generation++;
          worst.mutations += 3;
        }
        setGeneration((g) => g + 1);
      }

      const redMean = next.red.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE;
      const blueMean = next.blue.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE;
      const expectedR = 1 / (1 + Math.pow(10, (blueElo - redElo) / 400));
      const actualR = redWins / Math.max(1, redWins + blueWins);
      const K = 8;
      setRedElo((e) => e + K * (actualR - expectedR));
      setBlueElo((e) => e + K * ((1 - actualR) - (1 - expectedR)));

      setHistory((h) => {
        const nh = [...h, { red: redMean, blue: blueMean }];
        return nh.slice(-120);
      });
      return next;
    });
  };

  useEffect(() => {
    if (!runId) return;
    if (tick === 0 || tick % 40 !== 0) return;
    const redMean = cohorts.red.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE;
    const blueMean = cohorts.blue.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE;
    void supabase.from('swarm_runs').update({
      current_tick: tick,
      current_generation: generation,
      red_mean_fitness: redMean,
      blue_mean_fitness: blueMean,
    }).eq('id', runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => {
    if (tick === 0 || tick % 90 !== 0) return;
    const topRed = [...cohorts.red].sort((a, b) => b.fitness - a.fitness)[0];
    const topBlue = [...cohorts.blue].sort((a, b) => b.fitness - a.fitness)[0];
    if (!topRed || !topBlue) return;
    const newChamps: Champion[] = [
      {
        id: `r-${tick}`,
        side: 'red',
        name: topRed.name,
        code: topRed.code,
        trait: topRed.trait,
        fitness: topRed.fitness,
        generation,
        gene: [...topRed.gene],
        description: `Evolved ${topRed.trait.toLowerCase()} variant with ${topRed.mutations} mutations across ${generation} generations.`,
        promoted: topRed.fitness > 0.78,
      },
      {
        id: `b-${tick}`,
        side: 'blue',
        name: topBlue.name,
        code: topBlue.code,
        trait: topBlue.trait,
        fitness: topBlue.fitness,
        generation,
        gene: [...topBlue.gene],
        description: `Evolved ${topBlue.trait.toLowerCase()} detector with ${topBlue.mutations} mutations across ${generation} generations.`,
        promoted: topBlue.fitness > 0.78,
      },
    ];
    setChampions((prev) => [...newChamps, ...prev].slice(0, 10));

    if (runId) {
      void supabase.from('swarm_champions').insert(newChamps.map((c) => ({
        run_id: runId,
        side: c.side,
        rank: 1,
        champion_name: c.name,
        gene: c.gene,
        fitness: c.fitness,
        generation: c.generation,
        mitre_technique: c.code,
        description: c.description,
        promoted: c.promoted,
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const redMean = useMemo(
    () => cohorts.red.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE,
    [cohorts.red]
  );
  const blueMean = useMemo(
    () => cohorts.blue.reduce((s, c) => s + c.fitness, 0) / COHORTS_PER_SIDE,
    [cohorts.blue]
  );
  const winner = redMean > blueMean ? 'RED ASCENDANT' : 'BLUE DOMINANT';

  const reset = () => {
    setCohorts({
      red: Array.from({ length: COHORTS_PER_SIDE }, (_, i) => makeCohort('red', i)),
      blue: Array.from({ length: COHORTS_PER_SIDE }, (_, i) => makeCohort('blue', i)),
    });
    setTick(0);
    setGeneration(0);
    setHistory([]);
    setChampions([]);
    setRedElo(1500);
    setBlueElo(1500);
  };

  const downloadArtifact = (filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadNotebook = () => {
    const nb = buildNotebook({ tick, generation, redMean, blueMean, champions });
    downloadArtifact('swarm_crucible.ipynb', nb, 'application/json');
  };
  const downloadLangGraph = () => {
    downloadArtifact('tiny_agents_langgraph.py', buildLangGraphPy(), 'text/x-python');
  };
  const downloadGenomes = () => {
    const payload = {
      run: { tick, generation, redMean, blueMean, redElo, blueElo },
      cohorts,
      champions,
    };
    downloadArtifact('swarm_genomes.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  return (
    <div className="h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100">
      <div className="px-6 py-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/30 rounded-xl blur-lg animate-pulse" />
                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-rose-600 via-amber-500 to-sky-500 flex items-center justify-center">
                  <Swords className="w-6 h-6 text-slate-950" strokeWidth={2.5} />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Swarm Crucible</h1>
                <p className="text-xs text-slate-400 font-mono">
                  Adversarial evolutionary simulation / 1,000,000 vs 1,000,000 / rendered at {PARTICLES_PER_SIDE.toLocaleString()} particles per side
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
                <Flame className="w-3 h-3" /> RED TEAM {redElo.toFixed(0)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30">
                <ShieldCheck className="w-3 h-3" /> BLUE TEAM {blueElo.toFixed(0)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                TICK {tick.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                GEN {generation}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                redMean > blueMean
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
              }`}>
                <Crown className="w-3 h-3" /> {winner}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunning((r) => !r)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700"
            >
              {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {running ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <button
              onClick={downloadNotebook}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
            >
              <BookOpen className="w-4 h-4" /> Notebook
            </button>
            <button
              onClick={downloadLangGraph}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
            >
              <FileCode2 className="w-4 h-4" /> LangGraph
            </button>
            <button
              onClick={downloadGenomes}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold border border-slate-700"
            >
              <Download className="w-4 h-4" /> Genomes
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8 space-y-4">
          <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-[10px] font-mono text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded">
              <Flame className="w-3 h-3" /> RED SWARM / {(NOMINAL_POPULATION / 2).toLocaleString()} nominal
            </div>
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2 text-[10px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-1 rounded">
              BLUE SWARM / {(NOMINAL_POPULATION / 2).toLocaleString()} nominal <ShieldCheck className="w-3 h-3" />
            </div>
            <canvas ref={canvasRef} width={1100} height={460} className="w-full block" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {TARGET_TPS} ticks/sec</span>
              <span>Monte-Carlo matchups / Bradley-Terry fitness / elitist reseeding</span>
              <span className="flex items-center gap-1"><Dna className="w-3 h-3" /> {GENE_DIM}-dim gene vectors</span>
            </div>
          </div>

          <SLMPipeline
            step={pipelineStep}
            rulesCount={rulesSeed.length}
            microCount={microPatterns.length}
            champions={champions}
          />

          <div className="grid grid-cols-2 gap-4">
            <FitnessChart history={history} />
            <CohortBars cohorts={cohorts} />
          </div>
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-4">
          <ScorePanel redMean={redMean} blueMean={blueMean} redElo={redElo} blueElo={blueElo} tick={tick} />
          <ChampionsPanel champions={champions} />
          <SeedsPanel rules={rulesSeed} micros={microPatterns} />
        </div>
      </div>
    </div>
  );
}

function ScorePanel({
  redMean, blueMean, redElo, blueElo, tick,
}: { redMean: number; blueMean: number; redElo: number; blueElo: number; tick: number }) {
  const margin = Math.abs(redMean - blueMean);
  const leader = redMean > blueMean ? 'Red' : 'Blue';
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Gauge className="w-4 h-4 text-amber-400" /> Live Scoreboard
        </div>
        <div className="text-[10px] text-slate-500 font-mono">T+{tick.toLocaleString()}</div>
      </div>
      <div className="space-y-3">
        <TeamGauge side="red" label="Red Team" mean={redMean} elo={redElo} />
        <TeamGauge side="blue" label="Blue Team" mean={blueMean} elo={blueElo} />
      </div>
      <div className="mt-4 p-3 rounded-lg bg-slate-950/70 border border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Leader</span>
          <span className={`text-xs font-bold ${leader === 'Red' ? 'text-rose-400' : 'text-sky-400'}`}>
            {leader} +{(margin * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function TeamGauge({ side, label, mean, elo }: { side: Side; label: string; mean: number; elo: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className={`font-semibold ${side === 'red' ? 'text-rose-300' : 'text-sky-300'}`}>{label}</span>
        <span className="font-mono text-slate-400">
          {(mean * 100).toFixed(1)}% / {elo.toFixed(0)} ELO
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${
            side === 'red' ? 'from-rose-600 to-amber-500' : 'from-sky-600 to-cyan-400'
          }`}
          style={{ width: `${(mean * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

function FitnessChart({ history }: { history: { red: number; blue: number }[] }) {
  const max = Math.max(1, ...history.flatMap((h) => [h.red, h.blue]));
  const pts = (key: 'red' | 'blue') =>
    history.map((h, i) => `${(i / Math.max(1, history.length - 1)) * 100},${100 - (h[key] / max) * 100}`).join(' ');
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-3">
        <Activity className="w-4 h-4 text-emerald-400" /> Fitness Trajectory
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-32">
        <polyline points={pts('red')} fill="none" stroke="#f43f5e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <polyline points={pts('blue')} fill="none" stroke="#0ea5e9" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-slate-400">
        <span>T-{history.length}</span>
        <span>LIVE</span>
      </div>
    </div>
  );
}

function CohortBars({ cohorts }: { cohorts: { red: Cohort[]; blue: Cohort[] } }) {
  const all = [...cohorts.red, ...cohorts.blue]
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, 12);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-3">
        <Target className="w-4 h-4 text-amber-400" /> Top Cohorts
      </div>
      <div className="space-y-1.5">
        {all.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-[10px] font-mono">
            <div className="w-16 truncate text-slate-400">{c.code}</div>
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full"
                style={{ width: `${(c.fitness * 100).toFixed(0)}%`, background: c.color }}
              />
            </div>
            <div className="w-10 text-right text-slate-300">{(c.fitness * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChampionsPanel({ champions }: { champions: Champion[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Crown className="w-4 h-4 text-amber-400" /> Evolved Champions
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{champions.length} saved</span>
      </div>
      {champions.length === 0 ? (
        <div className="text-[11px] text-slate-500 py-6 text-center">
          Champions emerge every 90 ticks...
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
          {champions.map((c) => (
            <div key={c.id} className={`p-2.5 rounded-lg border ${
              c.side === 'red'
                ? 'border-rose-500/30 bg-rose-500/5'
                : 'border-sky-500/30 bg-sky-500/5'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {c.side === 'red'
                    ? <Flame className="w-3.5 h-3.5 text-rose-400" />
                    : <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />}
                  <span className="text-[11px] font-semibold text-slate-200">{c.name}</span>
                  <span className="text-[9px] font-mono text-slate-500">{c.code}</span>
                </div>
                <span className="text-[10px] font-mono text-amber-300">{(c.fitness * 100).toFixed(0)}%</span>
              </div>
              <div className="text-[10px] text-slate-400 leading-snug">{c.description}</div>
              <div className="flex items-center gap-1 mt-1.5">
                {c.gene.map((g, i) => (
                  <div
                    key={i}
                    className="flex-1 h-1 rounded"
                    style={{
                      background: c.side === 'red'
                        ? `rgba(244,63,94,${0.2 + g * 0.8})`
                        : `rgba(14,165,233,${0.2 + g * 0.8})`,
                    }}
                  />
                ))}
              </div>
              {c.promoted && (
                <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Sparkles className="w-2.5 h-2.5" /> PROMOTED TO {c.side === 'red' ? 'RED PLAYBOOK' : 'CORRELATION RULE'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeedsPanel({ rules, micros }: { rules: RuleSeed[]; micros: MicroPattern[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-3">
        <Network className="w-4 h-4 text-emerald-400" /> Live Genome Seeds
      </div>
      <div className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
        Correlation Rules ({rules.length})
      </div>
      <div className="space-y-1 mb-3 max-h-32 overflow-y-auto custom-scrollbar">
        {rules.slice(0, 8).map((r) => (
          <div key={r.id} className="flex items-center justify-between text-[10px] font-mono">
            <span className="truncate text-slate-300">{r.name}</span>
            <span className="text-slate-500">{r.technique}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
        Micro Patterns ({micros.length})
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
        {micros.slice(0, 6).map((m) => (
          <div key={m.id} className="flex items-center justify-between text-[10px] font-mono">
            <span className="truncate text-slate-300">{m.name}</span>
            <span className="text-amber-300">{m.support}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SLMPipeline({
  step, rulesCount, microCount, champions,
}: { step: number; rulesCount: number; microCount: number; champions: Champion[] }) {
  const stages = [
    { icon: Binary, label: 'Genomes', sub: `${(COHORTS_PER_SIDE * 2)} cohorts`,
      border: 'border-rose-500/50', bg: 'bg-rose-500/10', chip: 'bg-rose-500/30', ico: 'text-rose-300', bar: 'from-rose-500 to-rose-400' },
    { icon: Network, label: 'Rules + Patterns', sub: `${rulesCount}+${microCount}`,
      border: 'border-amber-500/50', bg: 'bg-amber-500/10', chip: 'bg-amber-500/30', ico: 'text-amber-300', bar: 'from-amber-500 to-amber-400' },
    { icon: Dna, label: 'Embeddings', sub: '384-d vectors',
      border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', chip: 'bg-emerald-500/30', ico: 'text-emerald-300', bar: 'from-emerald-500 to-emerald-400' },
    { icon: CircuitBoard, label: 'Transformer', sub: '6L / 8H / MHA',
      border: 'border-sky-500/50', bg: 'bg-sky-500/10', chip: 'bg-sky-500/30', ico: 'text-sky-300', bar: 'from-sky-500 to-sky-400' },
    { icon: Brain, label: 'SLM Output', sub: `${champions.filter((c) => c.promoted).length} promoted`,
      border: 'border-slate-500/50', bg: 'bg-slate-500/10', chip: 'bg-slate-500/30', ico: 'text-slate-200', bar: 'from-slate-400 to-slate-300' },
  ];
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Layers className="w-4 h-4 text-amber-400" />
            Correlation Rules + Micro-Patterns → Embeddings → Transformer → SLM
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Detection-as-Code pipeline / evolved genomes feed model fine-tuning / champions auto-promote to SOC rules
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> TRAINING LIVE
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 items-stretch">
        {stages.map((s, i) => {
          const active = step === i;
          const Icon = s.icon;
          return (
            <div key={i} className="relative">
              <div className={`p-3 rounded-xl border transition-all ${
                active ? `${s.border} ${s.bg} scale-105 shadow-lg` : 'border-slate-800 bg-slate-900/40'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    active ? s.chip : 'bg-slate-800'
                  }`}>
                    <Icon className={`w-4 h-4 ${active ? s.ico : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-200">{s.label}</div>
                    <div className="text-[9px] font-mono text-slate-500">{s.sub}</div>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${s.bar} transition-all`}
                    style={{ width: active ? '100%' : step > i ? '100%' : '15%' }}
                  />
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="absolute top-1/2 -right-1 w-2 h-0.5 bg-slate-700 z-10" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            <Crosshair className="w-3 h-3" /> Token Stream
          </div>
          <div className="font-mono text-[10px] text-emerald-300 leading-relaxed">
            &lt;RULE&gt;&nbsp;technique=T1078&nbsp;conf=0.92<br />
            &lt;PATTERN&gt;&nbsp;login-burst→smb-lateral<br />
            &lt;GENE&gt;&nbsp;[0.81,0.63,0.44,...]<br />
            &lt;DETECT&gt;&nbsp;impossible-travel+MFA-fatigue
          </div>
        </div>
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            <Radar className="w-3 h-3" /> Attention Heads
          </div>
          <div className="grid grid-cols-8 gap-0.5">
            {Array.from({ length: 48 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-sm"
                style={{
                  background: `hsl(${(i * 7 + step * 30) % 360}, 70%, ${30 + (Math.sin(i + step) + 1) * 20}%)`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            <Zap className="w-3 h-3" /> Output Logits
          </div>
          <div className="space-y-1">
            {['promote_rule', 'harden_mfa', 'isolate_host', 'block_ioc'].map((l, i) => {
              const w = 40 + Math.abs(Math.sin(step + i)) * 55;
              return (
                <div key={l} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="w-20 truncate text-slate-300">{l}</span>
                  <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${w}%` }} />
                  </div>
                  <span className="text-slate-500">{(w / 100).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildNotebook(args: {
  tick: number; generation: number; redMean: number; blueMean: number; champions: Champion[];
}): string {
  const cells = [
    {
      cell_type: 'markdown', metadata: {},
      source: [
        '# Swarm Crucible — Adversarial 1M vs 1M Simulation\n\n',
        `Snapshot tick=${args.tick}, generation=${args.generation}, red_mean=${args.redMean.toFixed(3)}, blue_mean=${args.blueMean.toFixed(3)}\n\n`,
        'Evolutionary co-optimization between Red (offensive) and Blue (defensive) tiny-agent swarms.\n',
        'Champion genomes auto-promote into correlation_rules and red-team playbooks.\n',
      ],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        'import numpy as np\n',
        'import pandas as pd\n',
        'from dataclasses import dataclass, field\n',
        'from typing import List\n\n',
        'GENE_DIM = 8\n',
        'COHORTS = 12\n',
        'POP_PER_COHORT = 83_333  # ~1M per side\n',
      ],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        '@dataclass\n',
        'class Cohort:\n',
        '    side: str\n',
        '    gene: np.ndarray\n',
        '    fitness: float = 0.5\n',
        '    wins: int = 0\n',
        '    losses: int = 0\n',
        '\n',
        'def seed(side):\n',
        '    return [Cohort(side, np.random.rand(GENE_DIM)) for _ in range(COHORTS)]\n',
      ],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        'def matchup(r, b):\n',
        '    r_score = np.dot(r.gene, b.gene - 0.5) / GENE_DIM\n',
        '    b_score = np.dot(b.gene, r.gene - 0.5) / GENE_DIM\n',
        '    return r_score + np.random.normal(0, 0.1) > b_score\n',
        '\n',
        'def tick(red, blue, K=0.01):\n',
        '    for _ in range(36):\n',
        '        r, b = np.random.choice(red), np.random.choice(blue)\n',
        '        if matchup(r, b):\n',
        '            r.fitness = min(1, r.fitness + K); b.fitness = max(0, b.fitness - K*0.8)\n',
        '            r.wins += 1; b.losses += 1\n',
        '        else:\n',
        '            b.fitness = min(1, b.fitness + K); r.fitness = max(0, r.fitness - K*0.8)\n',
        '            b.wins += 1; r.losses += 1\n',
      ],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        'def mutate(cohorts, rate=0.03):\n',
        '    for c in cohorts:\n',
        '        mask = np.random.rand(GENE_DIM) < rate\n',
        '        c.gene = np.clip(c.gene + mask * np.random.normal(0, 0.08, GENE_DIM), 0, 1)\n',
        '\n',
        'def elitism(cohorts):\n',
        '    s = sorted(cohorts, key=lambda c: c.fitness, reverse=True)\n',
        '    s[-1].gene = s[0].gene + np.random.normal(0, 0.05, GENE_DIM)\n',
        '    s[-1].fitness = s[0].fitness * 0.6\n',
      ],
    },
    {
      cell_type: 'markdown', metadata: {},
      source: ['## Embedding + SLM pipeline\n\n',
        'Each champion genome is concatenated with its correlation-rule provenance + micro-graph pattern,\n',
        'embedded to 384 dims, fed through a 6-layer transformer, then emitted as Detection-as-Code.'],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        'from sentence_transformers import SentenceTransformer\n',
        'model = SentenceTransformer("all-MiniLM-L6-v2")\n',
        '\n',
        'def champion_to_embedding(champ, rule_text, pattern_text):\n',
        '    prompt = f"GENE:{champ.gene.round(3).tolist()} RULE:{rule_text} PATTERN:{pattern_text}"\n',
        '    return model.encode(prompt)\n',
      ],
    },
    {
      cell_type: 'code', metadata: {}, execution_count: null, outputs: [],
      source: [
        'red, blue = seed("red"), seed("blue")\n',
        'for gen in range(50):\n',
        '    for _ in range(60):\n',
        '        tick(red, blue)\n',
        '    mutate(red); mutate(blue); elitism(red); elitism(blue)\n',
        '    print(f"Gen {gen}: red={np.mean([c.fitness for c in red]):.3f} blue={np.mean([c.fitness for c in blue]):.3f}")\n',
      ],
    },
  ];
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python', version: '3.11' },
    },
    cells,
  };
  return JSON.stringify(nb, null, 2);
}

function buildLangGraphPy(): string {
  return `"""
Swarm Crucible — Tiny-Agent LangGraph Orchestration
====================================================
Two adversarial agent graphs (Red offensive / Blue defensive) scaled to 1M nominal
agents via statistical cohort aggregation. Produced by the Swarm Crucible UI.
"""
from __future__ import annotations
from typing import TypedDict, List, Literal
from dataclasses import dataclass, field
import numpy as np
from langgraph.graph import StateGraph, END

GENE_DIM = 8
COHORTS = 12


@dataclass
class Cohort:
    side: Literal["red", "blue"]
    code: str
    gene: np.ndarray
    fitness: float = 0.5
    wins: int = 0
    losses: int = 0
    mutations: int = 0


class SwarmState(TypedDict):
    tick: int
    generation: int
    red: List[Cohort]
    blue: List[Cohort]
    champions: List[dict]
    promoted_rules: List[dict]


# ---------- Red Team tiny agents ---------- #

def red_recon(state: SwarmState) -> SwarmState:
    for c in state["red"]:
        c.gene[0] = np.clip(c.gene[0] + np.random.normal(0, 0.01), 0, 1)
    return state


def red_exploit(state: SwarmState) -> SwarmState:
    for r, b in zip(state["red"], state["blue"]):
        score = float(np.dot(r.gene, b.gene - 0.5) / GENE_DIM)
        if score + np.random.normal(0, 0.08) > 0:
            r.fitness = min(1.0, r.fitness + 0.01)
            r.wins += 1
        else:
            r.fitness = max(0.05, r.fitness - 0.008)
    return state


def red_mutate(state: SwarmState) -> SwarmState:
    for c in state["red"]:
        mask = np.random.rand(GENE_DIM) < 0.03
        c.gene = np.clip(c.gene + mask * np.random.normal(0, 0.08, GENE_DIM), 0, 1)
        c.mutations += int(mask.sum())
    return state


# ---------- Blue Team tiny agents ---------- #

def blue_detect(state: SwarmState) -> SwarmState:
    for b, r in zip(state["blue"], state["red"]):
        score = float(np.dot(b.gene, r.gene - 0.5) / GENE_DIM)
        if score + np.random.normal(0, 0.08) > 0:
            b.fitness = min(1.0, b.fitness + 0.01)
            b.wins += 1
        else:
            b.fitness = max(0.05, b.fitness - 0.008)
    return state


def blue_harden(state: SwarmState) -> SwarmState:
    for c in state["blue"]:
        mask = np.random.rand(GENE_DIM) < 0.03
        c.gene = np.clip(c.gene + mask * np.random.normal(0, 0.08, GENE_DIM), 0, 1)
        c.mutations += int(mask.sum())
    return state


# ---------- Arbiter ---------- #

def arbiter(state: SwarmState) -> SwarmState:
    state["tick"] += 1
    if state["tick"] % 60 == 0:
        state["generation"] += 1
        # Elitism: worst copies from best with jitter
        for side_key in ("red", "blue"):
            sorted_c = sorted(state[side_key], key=lambda c: c.fitness, reverse=True)
            sorted_c[-1].gene = np.clip(
                sorted_c[0].gene + np.random.normal(0, 0.05, GENE_DIM), 0, 1
            )
            sorted_c[-1].fitness = sorted_c[0].fitness * 0.6
    if state["tick"] % 90 == 0:
        top_red = max(state["red"], key=lambda c: c.fitness)
        top_blue = max(state["blue"], key=lambda c: c.fitness)
        for champ in (top_red, top_blue):
            rec = {
                "side": champ.side,
                "code": champ.code,
                "gene": champ.gene.tolist(),
                "fitness": champ.fitness,
                "generation": state["generation"],
            }
            state["champions"].append(rec)
            if champ.fitness > 0.78:
                state["promoted_rules"].append(rec)
    return state


def should_continue(state: SwarmState):
    return END if state["tick"] >= 500 else "red_recon"


# ---------- Graph wiring ---------- #

def build_graph():
    g = StateGraph(SwarmState)
    g.add_node("red_recon", red_recon)
    g.add_node("red_exploit", red_exploit)
    g.add_node("red_mutate", red_mutate)
    g.add_node("blue_detect", blue_detect)
    g.add_node("blue_harden", blue_harden)
    g.add_node("arbiter", arbiter)
    g.set_entry_point("red_recon")
    g.add_edge("red_recon", "red_exploit")
    g.add_edge("red_exploit", "blue_detect")
    g.add_edge("blue_detect", "blue_harden")
    g.add_edge("blue_harden", "red_mutate")
    g.add_edge("red_mutate", "arbiter")
    g.add_conditional_edges("arbiter", should_continue, {END: END, "red_recon": "red_recon"})
    return g.compile()


def seed_cohorts() -> SwarmState:
    return {
        "tick": 0,
        "generation": 0,
        "red": [Cohort("red", f"T{1000+i}", np.random.rand(GENE_DIM)) for i in range(COHORTS)],
        "blue": [Cohort("blue", f"D3-{i:02d}", np.random.rand(GENE_DIM)) for i in range(COHORTS)],
        "champions": [],
        "promoted_rules": [],
    }


if __name__ == "__main__":
    graph = build_graph()
    final = graph.invoke(seed_cohorts())
    print(f"Tick={final['tick']} Gen={final['generation']}")
    print(f"Champions={len(final['champions'])} Promoted={len(final['promoted_rules'])}")
`;
}
