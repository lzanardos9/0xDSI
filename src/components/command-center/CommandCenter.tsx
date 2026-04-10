import { useState, useEffect, useCallback } from 'react';
import ThreatRadar from './ThreatRadar';
import ThreatHeartbeat from './ThreatHeartbeat';
import KillChainWaterfall from './KillChainWaterfall';
import DomainBridge from './DomainBridge';
import CameraFeedModal from './CameraFeedModal';
import EmbeddingConstellation from './EmbeddingConstellation';
import ThreatWeatherMap from './ThreatWeatherMap';
import DefenseShield from './DefenseShield';
import DefconAlert from './DefconAlert';
import LowAndSlowTracker from './LowAndSlowTracker';
import RealtimeCEPGraph from './RealtimeCEPGraph';
import EventDrilldownModal from './EventDrilldownModal';
import IntelligenceMonitoring from './IntelligenceMonitoring';
import PredictiveThreatAnalytics from './PredictiveThreatAnalytics';
import MonteCarloForecasting from './MonteCarloForecasting';
import AgentCommsPanel from './AgentCommsPanel';
import ThreatGlobe from '../ThreatGlobe';
import RiskPostureGauge from './RiskPostureGauge';
import EventProcessingFunnel from './EventProcessingFunnel';
import { Globe, Maximize2, Minimize2, Shield, Activity, Radio, Cpu, Clock, Wifi, Eye, Layers } from 'lucide-react';

interface SelectedCamera {
  id: string;
  name: string;
  location: string;
  status: 'secure' | 'alert' | 'warning';
}

const mockThreats = [
  { source: { lat: 40.7128, lon: -74.0060 }, target: { lat: 37.7749, lon: -122.4194 }, severity: 'critical' as const },
  { source: { lat: 51.5074, lon: -0.1278 }, target: { lat: 35.6762, lon: 139.6503 }, severity: 'high' as const },
  { source: { lat: -33.8688, lon: 151.2093 }, target: { lat: 1.3521, lon: 103.8198 }, severity: 'medium' as const },
  { source: { lat: 55.7558, lon: 37.6173 }, target: { lat: 40.7128, lon: -74.0060 }, severity: 'critical' as const },
  { source: { lat: 39.9042, lon: 116.4074 }, target: { lat: 51.5074, lon: -0.1278 }, severity: 'high' as const },
  { source: { lat: 19.4326, lon: -99.1332 }, target: { lat: 1.3521, lon: 103.8198 }, severity: 'medium' as const },
  { source: { lat: -23.5505, lon: -46.6333 }, target: { lat: 52.5200, lon: 13.4050 }, severity: 'high' as const },
  { source: { lat: 28.6139, lon: 77.2090 }, target: { lat: -33.8688, lon: 151.2093 }, severity: 'medium' as const },
  { source: { lat: 35.6762, lon: 139.6503 }, target: { lat: 37.5665, lon: 126.9780 }, severity: 'critical' as const },
  { source: { lat: 25.2048, lon: 55.2708 }, target: { lat: 22.3193, lon: 114.1694 }, severity: 'high' as const },
];

const SectionDivider = ({ label, icon: Icon }: { label: string; icon: typeof Shield }) => (
  <div className="flex items-center gap-3 py-3">
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="w-6 h-6 rounded bg-slate-800/80 border border-slate-700/40 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-cyan-400/70" />
      </div>
      <span className="text-[10px] font-mono font-bold text-slate-400 tracking-[0.2em] uppercase">{label}</span>
    </div>
    <div className="flex-1 h-px bg-gradient-to-r from-slate-700/50 via-slate-700/20 to-transparent" />
  </div>
);

const LiveClock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-cyan-400 font-mono text-[11px] tabular-nums">{time}</span>;
};

const CommandCenter = () => {
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<SelectedCamera | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownEventId, setDrilldownEventId] = useState<string | undefined>();
  const [drilldownCategory, setDrilldownCategory] = useState<string | undefined>();
  const [cepExpanded, setCepExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setUptime(u => u + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleCameraClick = (node: { id: string; name: string; location: string; status: 'secure' | 'alert' | 'warning' }) => {
    setSelectedCamera(node);
    setCameraModalOpen(true);
  };

  const handleEventDrilldown = (category: string, eventId?: string) => {
    setDrilldownEventId(eventId);
    setDrilldownCategory(category);
    setDrilldownOpen(true);
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleFullscreen]);

  return (
    <div className={`relative ${isFullscreen ? 'bg-[#040810] overflow-y-auto h-screen' : ''}`}>
      <div className={`${isFullscreen ? 'max-w-[1920px] mx-auto px-6 py-4' : ''}`}>

        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0a0f1a] animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100 tracking-wide flex items-center gap-2">
                SECURITY COMMAND CENTER
                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-mono border border-emerald-500/20">OPERATIONAL</span>
              </h1>
              <p className="text-[10px] font-mono text-slate-500 tracking-widest">UNIFIED THREAT OPERATIONS PLATFORM</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-4 px-4 py-2 bg-slate-900/60 rounded-lg border border-slate-700/30">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-500" />
                <LiveClock />
              </div>
              <div className="w-px h-4 bg-slate-700/50" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-emerald-400/70" />
                <span className="text-[10px] font-mono text-slate-400">UPTIME <span className="text-emerald-400 tabular-nums">{formatUptime(uptime)}</span></span>
              </div>
              <div className="w-px h-4 bg-slate-700/50" />
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-cyan-400/70" />
                <span className="text-[10px] font-mono text-cyan-400">12 FEEDS</span>
              </div>
            </div>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:bg-slate-700/60 hover:border-cyan-500/30 transition-all text-xs font-mono group"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
              ) : (
                <Maximize2 className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
              )}
              <span className="hidden sm:inline">{isFullscreen ? 'EXIT' : 'FULLSCREEN'}</span>
              <kbd className="px-1 py-0.5 text-[9px] bg-slate-700/50 rounded border border-slate-600/40 text-slate-500">F11</kbd>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4 px-1 py-2 bg-slate-900/40 rounded-lg border border-slate-800/40">
          <div className="flex items-center gap-1.5 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-mono font-bold text-red-400">LIVE</span>
          </div>
          <div className="w-px h-4 bg-slate-700/30" />
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-6 text-[10px] font-mono text-slate-500 animate-marquee">
              <span>CRITICAL ALERTS: <span className="text-red-400">3</span></span>
              <span className="text-slate-700">|</span>
              <span>HIGH ALERTS: <span className="text-orange-400">7</span></span>
              <span className="text-slate-700">|</span>
              <span>ACTIVE INCIDENTS: <span className="text-yellow-400">2</span></span>
              <span className="text-slate-700">|</span>
              <span>AGENTS ACTIVE: <span className="text-emerald-400">6/6</span></span>
              <span className="text-slate-700">|</span>
              <span>CORRELATION ENGINE: <span className="text-cyan-400">ONLINE</span></span>
              <span className="text-slate-700">|</span>
              <span>THREAT FEEDS: <span className="text-cyan-400">12 SYNCED</span></span>
              <span className="text-slate-700">|</span>
              <span>ENDPOINTS MONITORED: <span className="text-blue-400">2,847</span></span>
              <span className="text-slate-700">|</span>
              <span>EVENTS/SEC: <span className="text-teal-400">14,203</span></span>
            </div>
          </div>
          <div className="w-px h-4 bg-slate-700/30" />
          <div className="flex items-center gap-1.5 px-2">
            <Cpu className="w-3 h-3 text-cyan-400/50" />
            <span className="text-[9px] font-mono text-slate-500">v4.2.1</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <DefconAlert />
            </div>
            <div>
              <RiskPostureGauge />
            </div>
          </div>

          <SectionDivider label="Predictive Intelligence" icon={Eye} />

          <PredictiveThreatAnalytics />

          <SectionDivider label="Attack Forecasting" icon={Activity} />

          <MonteCarloForecasting />

          <SectionDivider label="Real-Time Threat Detection" icon={Radio} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 h-[420px] cursor-pointer group" onClick={() => handleEventDrilldown('radar')}>
              <ThreatRadar />
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="h-[200px] cursor-pointer" onClick={() => handleEventDrilldown('heartbeat')}>
                <ThreatHeartbeat />
              </div>
              <div className="h-[200px]">
                <DefenseShield />
              </div>
            </div>
          </div>

          <SectionDivider label="Agent Operations" icon={Cpu} />

          <AgentCommsPanel />

          <SectionDivider label="Event Processing & Global Intel" icon={Globe} />

          {cepExpanded ? (
            <div className="h-[600px]">
              <RealtimeCEPGraph expanded={true} onToggleExpand={() => setCepExpanded(false)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-[450px]">
                <RealtimeCEPGraph expanded={false} onToggleExpand={() => setCepExpanded(true)} />
              </div>
              <div className="enterprise-card overflow-hidden h-[450px]">
                <div className="bg-slate-800/30 px-6 py-3 border-b border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Globe className="w-5 h-5 text-blue-400" />
                      <h3 className="text-base font-semibold text-slate-100">Global Threat Intelligence</h3>
                    </div>
                    <div className="flex space-x-2">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium border border-red-500/20">Critical</span>
                      <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px] font-medium border border-orange-500/20">High</span>
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px] font-medium border border-amber-500/20">Medium</span>
                    </div>
                  </div>
                </div>
                <div className="h-[calc(100%-48px)]">
                  <ThreatGlobe threats={mockThreats} />
                </div>
              </div>
            </div>
          )}

          <SectionDivider label="Advanced Threat Analytics" icon={Shield} />

          <div className="h-[380px] cursor-pointer" onClick={() => handleEventDrilldown('lowslow')}>
            <LowAndSlowTracker />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-[380px] cursor-pointer" onClick={() => handleEventDrilldown('killchain')}>
              <KillChainWaterfall />
            </div>
            <div className="h-[380px] cursor-pointer" onClick={() => handleEventDrilldown('weather')}>
              <ThreatWeatherMap />
            </div>
          </div>

          <SectionDivider label="Cyber-Physical Convergence" icon={Wifi} />

          <div className="h-[400px]">
            <DomainBridge onCameraClick={handleCameraClick} />
          </div>

          <SectionDivider label="Embedding Analysis" icon={Activity} />

          <div className="h-[420px] cursor-pointer" onClick={() => handleEventDrilldown('embedding')}>
            <EmbeddingConstellation />
          </div>

          <SectionDivider label="Intelligence Monitoring" icon={Eye} />

          <IntelligenceMonitoring />

          <SectionDivider label="Event Processing Pipeline" icon={Layers} />

          <EventProcessingFunnel />

          <div className="flex items-center justify-center py-6 mt-4 border-t border-slate-800/40">
            <div className="flex items-center gap-4 text-[10px] font-mono text-slate-600">
              <span>SECURITY COMMAND CENTER v4.2.1</span>
              <span className="text-slate-700">|</span>
              <span>CLASSIFICATION: INTERNAL</span>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>ALL SYSTEMS NOMINAL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CameraFeedModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        node={selectedCamera}
      />

      <EventDrilldownModal
        isOpen={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        eventId={drilldownEventId}
        category={drilldownCategory}
      />

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
          white-space: nowrap;
          display: inline-flex;
        }
      `}</style>
    </div>
  );
};

export default CommandCenter;
