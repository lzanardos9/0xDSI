import { useState } from 'react';
import ThreatRadar from './ThreatRadar';
import ThreatHeartbeat from './ThreatHeartbeat';
import KillChainWaterfall from './KillChainWaterfall';
import DomainBridge from './DomainBridge';
import CameraFeedModal from './CameraFeedModal';
import EmbeddingConstellation from './EmbeddingConstellation';
import ThreatWeatherMap from './ThreatWeatherMap';
import DefenseShield from './DefenseShield';

interface SelectedCamera {
  id: string;
  name: string;
  location: string;
  status: 'secure' | 'alert' | 'warning';
}

const CommandCenter = () => {
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<SelectedCamera | null>(null);

  const handleCameraClick = (node: { id: string; name: string; location: string; status: 'secure' | 'alert' | 'warning' }) => {
    setSelectedCamera(node);
    setCameraModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 h-[420px]">
          <ThreatRadar />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="h-[200px]">
            <ThreatHeartbeat />
          </div>
          <div className="h-[200px]">
            <DefenseShield />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[380px]">
          <KillChainWaterfall />
        </div>
        <div className="h-[380px]">
          <ThreatWeatherMap />
        </div>
      </div>

      <div className="h-[400px]">
        <DomainBridge onCameraClick={handleCameraClick} />
      </div>

      <div className="h-[420px]">
        <EmbeddingConstellation />
      </div>

      <CameraFeedModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        node={selectedCamera}
      />
    </div>
  );
};

export default CommandCenter;
