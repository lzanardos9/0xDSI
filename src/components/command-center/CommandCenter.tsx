import { useState } from 'react';
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
import ThreatGlobe from '../ThreatGlobe';
import { Globe, Shield } from 'lucide-react';

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

  const handleCameraClick = (node: { id: string; name: string; location: string; status: 'secure' | 'alert' | 'warning' }) => {
    setSelectedCamera(node);
    setCameraModalOpen(true);
  };

  const handleEventDrilldown = (category: string, eventId?: string) => {
    setDrilldownEventId(eventId);
    setDrilldownCategory(category);
    setDrilldownOpen(true);
  };

  return (
    <div className="space-y-4">
      <DefconAlert />

      <PredictiveThreatAnalytics />

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
