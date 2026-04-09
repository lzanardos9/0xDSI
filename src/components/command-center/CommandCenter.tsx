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
import { Globe, Maximize2, Minimize2, Shield } from 'lucide-react';

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

const CommandCenter = () => {
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<SelectedCamera | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownEventId, setDrilldownEventId] = useState<string | undefined>();
  const [drilldownCategory, setDrilldownCategory] = useState<string | undefined>();
  const [cepExpanded, setCepExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
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
    <div className={`space-y-4 relative ${isFullscreen ? 'bg-[#060a14] p-6 overflow-y-auto h-screen' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-200 tracking-wide">SECURITY COMMAND CENTER</h1>
            <p className="text-[10px] font-mono text-slate-500">UNIFIED THREAT OPERATIONS</p>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:bg-slate-700/60 hover:border-cyan-500/30 transition-all text-xs font-mono"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>EXIT FULLSCREEN</span>
              <kbd className="px-1 py-0.5 text-[9px] bg-slate-700/50 rounded border border-slate-600/40 text-slate-500">F11</kbd>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span>FULLSCREEN</span>
              <kbd className="px-1 py-0.5 text-[9px] bg-slate-700/50 rounded border border-slate-600/40 text-slate-500">F11</kbd>
            </>
          )}
        </button>
      </div>

      <DefconAlert />

      <PredictiveThreatAnalytics />

      <MonteCarloForecasting />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 h-[420px] cursor-pointer" onClick={() => handleEventDrilldown('radar')}>
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

      <AgentCommsPanel />

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

      <div className="h-[400px]">
        <DomainBridge onCameraClick={handleCameraClick} />
      </div>

      <div className="h-[420px] cursor-pointer" onClick={() => handleEventDrilldown('embedding')}>
        <EmbeddingConstellation />
      </div>

      <IntelligenceMonitoring />

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
    </div>
  );
};

export default CommandCenter;
