import { useEffect, useRef } from 'react';
import { MapPin, Monitor, Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface BehaviorEvent {
  id: string;
  user_profile_id: string;
  event_type: string;
  event_category: string;
  timestamp: string;
  location: string;
  device: string;
  ip_address: string;
  action: string;
  resource_accessed: string;
  outcome: string;
  anomaly_score: number;
  details: any;
}

interface UserEventNetworkProps {
  events: BehaviorEvent[];
}

interface Node {
  id: string;
  x: number;
  y: number;
  event: BehaviorEvent;
  vx: number;
  vy: number;
}

const UserEventNetwork: React.FC<UserEventNetworkProps> = ({ events }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const hoveredNodeRef = useRef<Node | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!events.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    const sortedEvents = [...events].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const timelineHeight = height - 120;
    const startY = 60;
    const nodeRadius = 12;

    nodesRef.current = sortedEvents.map((event, idx) => ({
      id: event.id,
      x: 60 + (idx / (sortedEvents.length - 1 || 1)) * (width - 120),
      y: startY + (timelineHeight / 2) + (Math.random() - 0.5) * 100,
      event,
      vx: 0,
      vy: 0,
    }));

    const getEventColor = (event: BehaviorEvent) => {
      if (event.anomaly_score > 70) return { fill: 'rgba(239, 68, 68, 0.8)', stroke: 'rgba(239, 68, 68, 1)' };
      if (event.anomaly_score > 40) return { fill: 'rgba(251, 146, 60, 0.8)', stroke: 'rgba(251, 146, 60, 1)' };
      if (event.event_category === 'physical') return { fill: 'rgba(168, 85, 247, 0.6)', stroke: 'rgba(168, 85, 247, 1)' };
      if (event.event_category === 'logical') return { fill: 'rgba(59, 130, 246, 0.6)', stroke: 'rgba(59, 130, 246, 1)' };
      return { fill: 'rgba(34, 197, 94, 0.6)', stroke: 'rgba(34, 197, 94, 1)' };
    };

    const getCategoryShape = (category: string) => {
      if (category === 'physical') return 'square';
      if (category === 'logical') return 'circle';
      return 'diamond';
    };

    const drawNode = (node: Node, isHovered: boolean = false) => {
      const colors = getEventColor(node.event);
      const shape = getCategoryShape(node.event.event_category);
      const radius = isHovered ? nodeRadius * 1.5 : nodeRadius;

      ctx.save();
      ctx.translate(node.x, node.y);

      if (isHovered) {
        ctx.shadowColor = colors.stroke;
        ctx.shadowBlur = 20;
      }

      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = isHovered ? 3 : 2;

      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'square') {
        ctx.beginPath();
        ctx.rect(-radius, -radius, radius * 2, radius * 2);
        ctx.fill();
        ctx.stroke();
      } else if (shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(radius, 0);
        ctx.lineTo(0, radius);
        ctx.lineTo(-radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      if (node.event.outcome === 'denied') {
        ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.5, -radius * 0.5);
        ctx.lineTo(radius * 0.5, radius * 0.5);
        ctx.moveTo(radius * 0.5, -radius * 0.5);
        ctx.lineTo(-radius * 0.5, radius * 0.5);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawConnection = (from: Node, to: Node) => {
      const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      const fromColor = getEventColor(from.event);
      const toColor = getEventColor(to.event);

      gradient.addColorStop(0, fromColor.stroke.replace('1)', '0.3)'));
      gradient.addColorStop(1, toColor.stroke.replace('1)', '0.3)'));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);

      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const offset = 20;

      ctx.quadraticCurveTo(midX, midY - offset, to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const angle = Math.atan2(to.y - midY + offset, to.x - midX);
      const arrowSize = 6;
      ctx.fillStyle = toColor.stroke.replace('1)', '0.5)');
      ctx.beginPath();
      ctx.moveTo(to.x - arrowSize * Math.cos(angle - Math.PI / 6), to.y - arrowSize * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.x, to.y);
      ctx.lineTo(to.x - arrowSize * Math.cos(angle + Math.PI / 6), to.y - arrowSize * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    };

    const drawTimeline = () => {
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, startY + timelineHeight / 2);
      ctx.lineTo(width - 40, startY + timelineHeight / 2);
      ctx.stroke();

      if (sortedEvents.length > 0) {
        const firstTime = new Date(sortedEvents[0].timestamp);
        const lastTime = new Date(sortedEvents[sortedEvents.length - 1].timestamp);

        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(firstTime.toLocaleTimeString(), 40, startY + timelineHeight / 2 + 25);

        ctx.textAlign = 'right';
        ctx.fillText(lastTime.toLocaleTimeString(), width - 40, startY + timelineHeight / 2 + 25);
      }
    };

    const drawLegend = () => {
      const legendX = 20;
      const legendY = height - 80;

      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(226, 232, 240, 1)';
      ctx.textAlign = 'left';
      ctx.fillText('Event Types:', legendX, legendY);

      const items = [
        { label: 'Physical', color: 'rgba(168, 85, 247, 0.8)', shape: 'square' },
        { label: 'Logical', color: 'rgba(59, 130, 246, 0.8)', shape: 'circle' },
        { label: 'Hybrid', color: 'rgba(34, 197, 94, 0.8)', shape: 'diamond' },
        { label: 'High Risk', color: 'rgba(239, 68, 68, 0.8)', shape: 'circle' },
      ];

      items.forEach((item, idx) => {
        const x = legendX + 110 + idx * 110;
        const y = legendY - 5;

        ctx.fillStyle = item.color;
        ctx.strokeStyle = item.color.replace('0.8', '1');
        ctx.lineWidth = 2;

        if (item.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (item.shape === 'square') {
          ctx.fillRect(x - 6, y - 6, 12, 12);
          ctx.strokeRect(x - 6, y - 6, 12, 12);
        } else if (item.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x + 6, y);
          ctx.lineTo(x, y + 6);
          ctx.lineTo(x - 6, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(203, 213, 225, 1)';
        ctx.font = '11px sans-serif';
        ctx.fillText(item.label, x + 12, y + 4);
      });
    };

    const drawTooltip = (node: Node) => {
      const padding = 12;
      const lineHeight = 18;
      const lines = [
        `Type: ${node.event.event_type.replace(/_/g, ' ')}`,
        `Category: ${node.event.event_category}`,
        `Outcome: ${node.event.outcome}`,
        `Risk: ${node.event.anomaly_score.toFixed(0)}`,
        node.event.location ? `Location: ${node.event.location}` : null,
        node.event.device ? `Device: ${node.event.device}` : null,
      ].filter(Boolean) as string[];

      ctx.font = '12px sans-serif';
      const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      const boxWidth = maxWidth + padding * 2;
      const boxHeight = lines.length * lineHeight + padding * 2;

      let tooltipX = node.x + 20;
      let tooltipY = node.y - boxHeight / 2;

      if (tooltipX + boxWidth > width - 10) tooltipX = node.x - boxWidth - 20;
      if (tooltipY < 10) tooltipY = 10;
      if (tooltipY + boxHeight > height - 10) tooltipY = height - boxHeight - 10;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = 'rgba(71, 85, 105, 1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(226, 232, 240, 1)';
      ctx.textAlign = 'left';
      lines.forEach((line, idx) => {
        ctx.fillText(line, tooltipX + padding, tooltipY + padding + (idx + 1) * lineHeight - 4);
      });
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      drawTimeline();

      for (let i = 0; i < nodesRef.current.length - 1; i++) {
        drawConnection(nodesRef.current[i], nodesRef.current[i + 1]);
      }

      nodesRef.current.forEach(node => {
        const isHovered = hoveredNodeRef.current?.id === node.id;
        drawNode(node, isHovered);
      });

      if (hoveredNodeRef.current) {
        drawTooltip(hoveredNodeRef.current);
      }

      drawLegend();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let foundNode: Node | null = null;

      for (const node of nodesRef.current) {
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < nodeRadius * 1.5) {
          foundNode = node;
          break;
        }
      }

      hoveredNodeRef.current = foundNode;
      canvas.style.cursor = foundNode ? 'pointer' : 'default';
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    render();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [events]);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          No events to display
        </div>
      )}
    </div>
  );
};

export default UserEventNetwork;
