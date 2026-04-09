import { useState, useEffect, useRef } from 'react';
import { Camera, Server, Monitor, Wifi, Shield, MapPin, Lock, Eye } from 'lucide-react';

interface PhysicalNode {
  id: string;
  name: string;
  type: 'camera' | 'server' | 'workstation' | 'access_point' | 'door';
  location: string;
  status: 'secure' | 'alert' | 'warning';
  x: number;
  y: number;
  linkedLogicalId: string;
}

interface LogicalNode {
  id: string;
  name: string;
  type: 'endpoint' | 'server' | 'network' | 'cloud' | 'database';
  ip: string;
  status: 'active' | 'compromised' | 'suspicious';
  x: number;
  y: number;
}

const LOGICAL_NODES: LogicalNode[] = [
  { id: 'l1', name: 'DC-CORE-01', type: 'server', ip: '10.0.1.10', status: 'active', x: 0.2, y: 0.2 },
  { id: 'l2', name: 'DC-CORE-02', type: 'server', ip: '10.0.1.11', status: 'active', x: 0.2, y: 0.45 },
  { id: 'l3', name: 'DC-DB-01', type: 'database', ip: '10.0.2.20', status: 'suspicious', x: 0.15, y: 0.7 },
  { id: 'l4', name: 'FW-EDGE-01', type: 'network', ip: '10.0.0.1', status: 'active', x: 0.35, y: 0.15 },
  { id: 'l5', name: 'WS-ADMIN-07', type: 'endpoint', ip: '10.0.5.107', status: 'compromised', x: 0.35, y: 0.55 },
  { id: 'l6', name: 'CLOUD-AWS-01', type: 'cloud', ip: '172.31.0.10', status: 'active', x: 0.3, y: 0.85 },
  { id: 'l7', name: 'SW-CORE-01', type: 'network', ip: '10.0.0.2', status: 'active', x: 0.1, y: 0.35 },
];

const PHYSICAL_NODES: PhysicalNode[] = [
  { id: 'p1', name: 'CAM-DC-07', type: 'camera', location: 'Server Room A', status: 'secure', x: 0.65, y: 0.15, linkedLogicalId: 'l1' },
  { id: 'p2', name: 'CAM-DC-12', type: 'camera', location: 'Server Room B', status: 'alert', x: 0.85, y: 0.3, linkedLogicalId: 'l2' },
  { id: 'p3', name: 'RACK-A3', type: 'server', location: 'Row A, Rack 3', status: 'secure', x: 0.7, y: 0.45, linkedLogicalId: 'l3' },
  { id: 'p4', name: 'DOOR-SR-01', type: 'door', location: 'Server Room Entry', status: 'warning', x: 0.9, y: 0.55, linkedLogicalId: 'l4' },
  { id: 'p5', name: 'WS-FL3-07', type: 'workstation', location: 'Floor 3, Desk 7', status: 'alert', x: 0.75, y: 0.7, linkedLogicalId: 'l5' },
  { id: 'p6', name: 'AP-FL3-02', type: 'access_point', location: 'Floor 3 WiFi', status: 'secure', x: 0.6, y: 0.85, linkedLogicalId: 'l6' },
];

interface DomainBridgeProps {
  onCameraClick: (node: PhysicalNode) => void;
}

const DomainBridge = ({ onCameraClick }: DomainBridgeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const particlesRef = useRef<{ x: number; y: number; progress: number; speed: number; linkIdx: number }[]>([]);

  useEffect(() => {
    for (let i = 0; i < 30; i++) {
      particlesRef.current.push({
        x: 0, y: 0,
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.003,
        linkIdx: Math.floor(Math.random() * PHYSICAL_NODES.length),
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const midX = w * 0.48;
      const bridgeGrad = ctx.createLinearGradient(midX - 30, 0, midX + 30, 0);
      bridgeGrad.addColorStop(0, 'rgba(34, 211, 238, 0.03)');
      bridgeGrad.addColorStop(0.5, 'rgba(34, 211, 238, 0.08)');
      bridgeGrad.addColorStop(1, 'rgba(34, 211, 238, 0.03)');
      ctx.fillStyle = bridgeGrad;
      ctx.fillRect(midX - 30, 0, 60, h);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONVERGENCE BRIDGE', midX, 16);

      for (const pNode of PHYSICAL_NODES) {
        const lNode = LOGICAL_NODES.find(l => l.id === pNode.linkedLogicalId);
        if (!lNode) continue;

        const lx = lNode.x * w;
        const ly = lNode.y * h;
        const px = pNode.x * w;
        const py = pNode.y * h;

        const isHighlighted = selectedLink === pNode.id || hoveredNode === pNode.id || hoveredNode === lNode.id;
        const linkColor = pNode.status === 'alert' ? '#ef4444' : pNode.status === 'warning' ? '#eab308' : '#22d3ee';
        const alpha = isHighlighted ? '60' : '15';

        ctx.strokeStyle = linkColor + alpha;
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        const cp1x = midX - 20;
        const cp2x = midX + 20;
        ctx.bezierCurveTo(cp1x, ly, cp2x, py, px, py);
        ctx.stroke();
      }

      particlesRef.current.forEach(p => {
        p.progress += p.speed;
        if (p.progress > 1) {
          p.progress = 0;
          p.linkIdx = Math.floor(Math.random() * PHYSICAL_NODES.length);
        }

        const pNode = PHYSICAL_NODES[p.linkIdx];
        const lNode = LOGICAL_NODES.find(l => l.id === pNode.linkedLogicalId);
        if (!lNode) return;

        const lx = lNode.x * w;
        const ly = lNode.y * h;
        const px = pNode.x * w;
        const py = pNode.y * h;
        const cp1x = midX - 20;
        const cp2x = midX + 20;

        const t = p.progress;
        const mt = 1 - t;
        p.x = mt * mt * mt * lx + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * px;
        p.y = mt * mt * mt * ly + 3 * mt * mt * t * ly + 3 * mt * t * t * py + t * t * t * py;

        const color = pNode.status === 'alert' ? '#ef4444' : pNode.status === 'warning' ? '#eab308' : '#22d3ee';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [hoveredNode, selectedLink]);

  const getLogicalIcon = (type: string) => {
    switch (type) {
      case 'server': return <Server className="w-4 h-4" />;
      case 'endpoint': return <Monitor className="w-4 h-4" />;
      case 'network': return <Wifi className="w-4 h-4" />;
      case 'cloud': return <Shield className="w-4 h-4" />;
      case 'database': return <Server className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  const getPhysicalIcon = (type: string) => {
    switch (type) {
      case 'camera': return <Camera className="w-4 h-4" />;
      case 'server': return <Server className="w-4 h-4" />;
      case 'workstation': return <Monitor className="w-4 h-4" />;
      case 'access_point': return <Wifi className="w-4 h-4" />;
      case 'door': return <Lock className="w-4 h-4" />;
      default: return <MapPin className="w-4 h-4" />;
    }
  };

  const getStatusColors = (status: string) => {
    if (status === 'alert' || status === 'compromised') return 'border-red-500/50 bg-red-500/10 text-red-400 shadow-red-500/20';
    if (status === 'warning' || status === 'suspicious') return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 shadow-yellow-500/20';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-emerald-500/10';
  };

  return (
    <div className="relative w-full h-full bg-[#060810] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-cyan-500/20">
          <Eye className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-400 text-xs font-mono font-bold tracking-wider">DOMAIN BRIDGE</span>
        </div>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-8">
        <span className="text-blue-400 text-[10px] font-mono font-bold tracking-widest">LOGICAL DOMAIN</span>
        <span className="text-orange-400 text-[10px] font-mono font-bold tracking-widest">PHYSICAL DOMAIN</span>
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute inset-0 z-10 pointer-events-none">
        {LOGICAL_NODES.map(node => (
          <div
            key={node.id}
            className={`absolute pointer-events-auto cursor-pointer transition-all duration-200 ${getStatusColors(node.status)} border rounded-lg px-2.5 py-1.5 shadow-lg hover:scale-110`}
            style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <div className="flex items-center gap-1.5">
              {getLogicalIcon(node.type)}
              <div>
                <div className="text-[10px] font-mono font-bold leading-tight">{node.name}</div>
                <div className="text-[8px] font-mono opacity-60">{node.ip}</div>
              </div>
            </div>
          </div>
        ))}

        {PHYSICAL_NODES.map(node => (
          <div
            key={node.id}
            className={`absolute pointer-events-auto cursor-pointer transition-all duration-200 ${getStatusColors(node.status)} border rounded-lg px-2.5 py-1.5 shadow-lg hover:scale-110`}
            style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => {
              setSelectedLink(node.id);
              if (node.type === 'camera' || node.type === 'workstation' || node.type === 'door') {
                onCameraClick(node);
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              {getPhysicalIcon(node.type)}
              <div>
                <div className="text-[10px] font-mono font-bold leading-tight">{node.name}</div>
                <div className="text-[8px] font-mono opacity-60">{node.location}</div>
              </div>
              {(node.type === 'camera' || node.type === 'door') && (
                <div className="ml-1 w-4 h-4 rounded bg-white/10 flex items-center justify-center">
                  <Eye className="w-2.5 h-2.5 opacity-60" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DomainBridge;
