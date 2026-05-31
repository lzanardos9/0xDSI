import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  Zap,
  BarChart3,
  Gauge,
  Network,
  Clock,
} from 'lucide-react';

// Mock data for EPS trend (24 hours)
const mockEpsTrendData = [
  12500, 13200, 14100, 15300, 16200, 17100, 18900, 20100,
  21500, 22300, 23100, 24200, 25100, 26300, 27200, 28100,
  29300, 30200, 31100, 32200, 33100, 34300, 35200, 36100,
];

// Mock site data
const sites = [
  { name: 'NYC-DC1', eps: 8500, latency: 3, errors: 0.2, collectors: 12 },
  { name: 'LON-DC2', eps: 7200, latency: 5, errors: 0.5, collectors: 10 },
  { name: 'SFO-DC3', eps: 6800, latency: 2, errors: 0.1, collectors: 9 },
  { name: 'FRA-DC4', eps: 5900, latency: 8, errors: 0.8, collectors: 7 },
  { name: 'TOK-DC5', eps: 4200, latency: 12, errors: 1.2, collectors: 5 },
  { name: 'AWS-US-EAST', eps: 9100, latency: 4, errors: 0.3, collectors: 14 },
  { name: 'AZURE-EASTUS2', eps: 7600, latency: 6, errors: 0.6, collectors: 11 },
  { name: 'GCP-US-CENTRAL', eps: 6400, latency: 3, errors: 0.2, collectors: 8 },
  { name: 'PLANT-SP', eps: 2100, latency: 18, errors: 2.1, collectors: 3 },
  { name: 'CLOUD-ZIA', eps: 3500, latency: 15, errors: 1.5, collectors: 4 },
];

// Mock DNA breakdown data
const dnaMockData = [
  { type: 'Windows Event Log', collectors: 28, eps: 31200, avgLatency: 4.2, errorRate: 0.3, volume: [2, 3, 5, 8, 10, 12, 11, 9, 7, 5, 4, 2] },
  { type: 'Syslog', collectors: 22, eps: 24100, avgLatency: 5.8, errorRate: 0.6, volume: [1, 2, 4, 6, 8, 10, 12, 11, 9, 7, 5, 3] },
  { type: 'API Feeds', collectors: 18, eps: 18900, avgLatency: 3.1, errorRate: 0.2, volume: [3, 4, 6, 8, 10, 11, 10, 8, 6, 4, 3, 2] },
  { type: 'File Monitoring', collectors: 15, eps: 14200, avgLatency: 6.5, errorRate: 0.9, volume: [1, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5] },
];

// Mock top talkers
const topTalkers = [
  { name: 'Collector-NYC-001', eps: 5200, site: 'NYC-DC1' },
  { name: 'Collector-AWS-015', eps: 4800, site: 'AWS-US-EAST' },
  { name: 'Collector-LON-008', eps: 4100, site: 'LON-DC2' },
  { name: 'Collector-SFO-006', eps: 3900, site: 'SFO-DC3' },
  { name: 'Collector-FRA-004', eps: 3200, site: 'FRA-DC4' },
];

// Pipeline stages mock data
const pipelineStages = [
  { name: 'Edge Collectors', eventsPerSec: 94400, queueDepth: 1200, lastProcessed: '0ms ago' },
  { name: 'Kafka/HTTPS', eventsPerSec: 94200, queueDepth: 3400, lastProcessed: '0ms ago' },
  { name: 'Bronze (Raw)', eventsPerSec: 93800, queueDepth: 2100, lastProcessed: '5ms ago' },
  { name: 'Silver (Normalized)', eventsPerSec: 92500, queueDepth: 1500, lastProcessed: '12ms ago' },
  { name: 'Gold (Analytics)', eventsPerSec: 91200, queueDepth: 400, lastProcessed: '18ms ago' },
];

interface AnimatedDot {
  id: string;
  position: number;
  stage: number;
}

function FleetTelemetryDashboard() {
  const [animatedDots, setAnimatedDots] = useState<AnimatedDot[]>([]);
  const [liveEps, setLiveEps] = useState(36100);
  const [recentEpsValues, setRecentEpsValues] = useState([34200, 35100, 35800, 36100]);

  // Animate dots flowing through pipeline
  useEffect(() => {
    const newDots: AnimatedDot[] = [];
    for (let i = 0; i < 8; i++) {
      newDots.push({
        id: `dot-${i}`,
        position: Math.random() * 100,
        stage: Math.floor(Math.random() * 5),
      });
    }
    setAnimatedDots(newDots);

    const interval = setInterval(() => {
      setAnimatedDots((prev) =>
        prev.map((dot) => ({
          ...dot,
          position: dot.position >= 100 ? 0 : dot.position + 2,
          stage: dot.position >= 100 ? (Math.random() * 5) | 0 : dot.stage,
        }))
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Simulate live EPS updates
  useEffect(() => {
    const interval = setInterval(() => {
      const newEps = 35800 + Math.random() * 2500;
      setLiveEps(newEps);
      setRecentEpsValues((prev) => [...prev.slice(1), newEps]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate health score
  const healthScore = 87;

  // Calculate total events (24h)
  const totalEvents = mockEpsTrendData.reduce((a, b) => a + b, 0) * 60 * 60;

  // Get latency color
  const getLatencyColor = (latency: number) => {
    if (latency < 5) return 'text-emerald-400';
    if (latency < 20) return 'text-amber-400';
    return 'text-red-400';
  };

  // Get site health color
  const getSiteHealthColor = (eps: number, latency: number, errors: number) => {
    const health = (eps / 10000) * 0.5 + (1 - Math.min(latency / 50, 1)) * 0.3 + (1 - Math.min(errors / 5, 1)) * 0.2;
    if (health > 0.7) return 'bg-emerald-600';
    if (health > 0.4) return 'bg-amber-600';
    return 'bg-red-600';
  };

  // Trend sparkline component
  const TrendSparkline = ({ data }: { data: number[] }) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 80 - 10;
      return `${x},${y}`;
    });

    return (
      <svg viewBox="0 0 100 24" className="w-full h-6" preserveAspectRatio="none">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  // Circular gauge component
  const CircularGauge = ({ value }: { value: number }) => {
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
      <div className="flex flex-col items-center justify-center">
        <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            stroke="rgb(30, 41, 59)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r="45"
            fill="none"
            stroke="rgb(6, 182, 212)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-xl font-bold text-cyan-400 font-mono">{value}%</div>
          <div className="text-xs text-slate-400">Health</div>
        </div>
      </div>
    );
  };

  // EPS micro bar chart
  const MicroBarChart = ({ data }: { data: number[] }) => {
    const max = Math.max(...data);
    return (
      <div className="flex items-end gap-0.5 h-12">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t"
            style={{ height: `${(v / max) * 100}%`, minHeight: '2px' }}
          />
        ))}
      </div>
    );
  };

  // Mini sparkline for table
  const MiniSparkline = ({ data }: { data: number[] }) => {
    const max = Math.max(...data);
    return (
      <div className="flex items-end gap-px h-5">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 bg-cyan-500"
            style={{ height: `${(v / max) * 100}%`, minHeight: '1px' }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Fleet Telemetry Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">SOC Edge Collectors Observability</p>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <Activity className="w-4 h-4 animate-pulse" />
            <span>Live</span>
          </div>
        </div>

        {/* Fleet Summary Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Events Ingested */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm">Total Events (24h)</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-400 font-mono mb-2">
              {(totalEvents / 1e9).toFixed(2)}B
            </div>
            <TrendSparkline data={mockEpsTrendData} />
          </div>

          {/* Fleet EPS Live */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm">Fleet EPS (live)</span>
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-cyan-400 font-mono mb-2">
              {liveEps.toFixed(0)}
            </div>
            <MicroBarChart data={recentEpsValues} />
          </div>

          {/* Avg Latency */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-sm">Avg Latency</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className={`text-2xl font-bold font-mono mb-2 ${getLatencyColor(6.2)}`}>
              6.2ms
            </div>
            <div className="text-xs text-slate-400">↑ 0.8ms from 24h ago</div>
          </div>

          {/* Pipeline Health */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex flex-col items-center">
            <span className="text-slate-400 text-sm mb-2">Pipeline Health</span>
            <CircularGauge value={healthScore} />
          </div>
        </div>

        {/* EPS Trend Chart */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-cyan-400">EPS Trend (24h)</h2>
            <BarChart3 className="w-5 h-5 text-slate-400" />
          </div>

          <svg viewBox="0 0 1000 300" className="w-full h-64" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {[0, 10000, 20000, 30000, 40000].map((value) => {
              const y = 250 - (value / 40000) * 200;
              return (
                <g key={`grid-${value}`}>
                  <line x1="50" y1={y} x2="950" y2={y} stroke="rgb(71, 85, 105)" strokeWidth="0.5" strokeDasharray="2,2" />
                  <text x="30" y={y + 4} fontSize="10" fill="rgb(148, 163, 184)" textAnchor="end">
                    {(value / 1000).toFixed(0)}k
                  </text>
                </g>
              );
            })}

            {/* Capacity threshold */}
            <line
              x1="50"
              y1={250 - (35000 / 40000) * 200}
              x2="950"
              y2={250 - (35000 / 40000) * 200}
              stroke="rgb(239, 68, 68)"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
            <text x="960" y={250 - (35000 / 40000) * 200 - 2} fontSize="10" fill="rgb(239, 68, 68)" opacity="0.7">
              Capacity
            </text>

            {/* Area chart with gradient */}
            <defs>
              <linearGradient id="epsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(6, 182, 212)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="rgb(6, 182, 212)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Plot points and area */}
            <polyline
              points={mockEpsTrendData
                .map(
                  (value, i) =>
                    `${50 + (i / (mockEpsTrendData.length - 1)) * 900},${250 - (value / 40000) * 200}`
                )
                .join(' ')}
              fill="url(#epsGradient)"
              stroke="rgb(6, 182, 212)"
              strokeWidth="2"
            />

            {/* X-axis */}
            <line x1="50" y1="250" x2="950" y2="250" stroke="rgb(71, 85, 105)" strokeWidth="1" />
            {[0, 6, 12, 18, 24].map((hour) => {
              const x = 50 + (hour / 24) * 900;
              return (
                <g key={`x-${hour}`}>
                  <line x1={x} y1="250" x2={x} y2="256" stroke="rgb(71, 85, 105)" strokeWidth="1" />
                  <text x={x} y="270" fontSize="10" fill="rgb(148, 163, 184)" textAnchor="middle">
                    {hour}h
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Site Heatmap */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-cyan-400">Site Health Heatmap</h2>
            <Network className="w-5 h-5 text-slate-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-2 text-slate-400 font-semibold">Site</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">EPS</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Latency</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Errors</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Collectors</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.name} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-mono text-cyan-300">{site.name}</td>
                    <td className="text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded text-xs font-mono ${getSiteHealthColor(
                          site.eps,
                          site.latency,
                          site.errors
                        )} text-slate-900 font-semibold`}
                      >
                        {site.eps.toLocaleString()}
                      </span>
                    </td>
                    <td className={`text-center font-mono ${getLatencyColor(site.latency)}`}>
                      {site.latency.toFixed(1)}ms
                    </td>
                    <td className="text-center">
                      <span className="text-slate-300 font-mono">{site.errors.toFixed(1)}%</span>
                    </td>
                    <td className="text-center">
                      <span className="text-slate-300 font-mono">{site.collectors}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-DNA Breakdown Table */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-cyan-400">DNA Breakdown</h2>
            <BarChart3 className="w-5 h-5 text-slate-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-2 text-slate-400 font-semibold">DNA Type</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Collectors</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">EPS</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Avg Latency</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Error Rate</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-semibold">Volume</th>
                </tr>
              </thead>
              <tbody>
                {dnaMockData.map((dna) => (
                  <tr key={dna.type} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-semibold text-emerald-300">{dna.type}</td>
                    <td className="text-center font-mono text-slate-300">{dna.collectors}</td>
                    <td className="text-center font-mono text-cyan-400">{dna.eps.toLocaleString()}</td>
                    <td className="text-center font-mono text-slate-300">{dna.avgLatency.toFixed(1)}ms</td>
                    <td className={`text-center font-mono ${dna.errorRate < 0.5 ? 'text-emerald-400' : dna.errorRate < 1 ? 'text-amber-400' : 'text-red-400'}`}>
                      {dna.errorRate.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3">
                      <MiniSparkline data={dna.volume} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ingestion Pipeline Status */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-cyan-400">Ingestion Pipeline</h2>
            <Zap className="w-5 h-5 text-slate-400" />
          </div>

          <div className="relative">
            {/* Pipeline visualization */}
            <div className="space-y-4">
              {pipelineStages.map((stage, stageIndex) => (
                <div key={stage.name} className="flex items-center gap-4">
                  {/* Stage box */}
                  <div className="flex-1 bg-slate-700 rounded px-4 py-3 border border-slate-600 min-w-0">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold text-cyan-300">{stage.name}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {stage.eventsPerSec.toLocaleString()} eps
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-slate-300">Q: {stage.queueDepth}</div>
                        <div className="text-slate-500">{stage.lastProcessed}</div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow between stages */}
                  {stageIndex < pipelineStages.length - 1 && (
                    <div className="flex items-center justify-center w-12 h-12 relative">
                      <svg viewBox="0 0 40 40" className="w-full h-full">
                        <defs>
                          <linearGradient id={`arrowGradient${stageIndex}`} x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stopColor="rgb(6, 182, 212)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="rgb(6, 182, 212)" stopOpacity="0.8" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="20" x2="35" y2="20" stroke={`url(#arrowGradient${stageIndex})`} strokeWidth="2" />
                        <polygon points="35,20 30,17 30,23" fill="rgb(6, 182, 212)" opacity="0.8" />

                        {/* Animated flowing dots */}
                        {animatedDots
                          .filter((d) => d.stage === stageIndex)
                          .map((dot) => (
                            <circle
                              key={dot.id}
                              cx={dot.position * 0.35}
                              cy="20"
                              r="2"
                              fill="rgb(6, 182, 212)"
                              opacity="0.6"
                            />
                          ))}
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Talkers */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-cyan-400">Top 5 Collectors by EPS</h2>
            <TrendingUp className="w-5 h-5 text-slate-400" />
          </div>

          <div className="space-y-3">
            {topTalkers.map((collector, index) => {
              const maxEps = Math.max(...topTalkers.map((c) => c.eps));
              const percentage = (collector.eps / maxEps) * 100;

              return (
                <div key={collector.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-500 font-bold">{index + 1}.</span>
                      <span className="font-mono text-slate-300">{collector.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({collector.site})</span>
                    </div>
                    <span className="font-mono text-cyan-400 text-sm font-semibold">
                      {collector.eps.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      style={{
                        width: `${percentage}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-500 text-center pt-4 border-t border-slate-700">
          Last updated: {new Date().toLocaleTimeString()} | Fleet Status: Healthy | 83 active collectors across 10 sites
        </div>
      </div>
    </div>
  );
}

export default FleetTelemetryDashboard;
