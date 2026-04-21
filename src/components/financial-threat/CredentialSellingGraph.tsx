import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Globe, AlertTriangle, Eye, EyeOff } from 'lucide-react';

export type { SelectedNode };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CredentialCase {
  case_id: string;
  entity_name: string;
  account_type: string;
  seller_confidence: number;
  risk_tier: string;
  status: string;
  dark_web_intel: { marketplace?: string; seller_handle?: string; price_usd?: number } | null;
  network_connections: Array<{ entity: string; type: string; relationship: string; confidence: number }> | null;
}

interface DarkWebHit {
  hit_id: string;
  marketplace: string;
  seller_handle: string;
  entity_id: string;
  listing_price: number;
}

interface SelectedNode {
  id: string;
  type: NodeType;
  label: string;
  caseIds: string[];
  hitIds: string[];
}

interface Props {
  cases: CredentialCase[];
  darkWebHits: DarkWebHit[];
  onNodeSelect?: (selected: SelectedNode | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonField<T>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return val as T;
}

function ensureArray<T>(val: unknown): T[] {
  const parsed = parseJsonField<T[]>(val);
  return Array.isArray(parsed) ? parsed : [];
}

// ---------------------------------------------------------------------------
// Graph Data Structures
// ---------------------------------------------------------------------------

type NodeType = 'seller' | 'marketplace' | 'buyer' | 'credential' | 'victim_account';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  risk: number;
  pinned: boolean;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
  confidence: number;
  label: string;
}

interface Particle {
  edge: GraphEdge;
  t: number;
  speed: number;
}

// ---------------------------------------------------------------------------
// Node visual config
// ---------------------------------------------------------------------------

const NODE_STYLES: Record<NodeType, { fill: string; glow: string; labelColor: string }> = {
  seller: { fill: '#ef4444', glow: '#ef444480', labelColor: '#fca5a5' },
  marketplace: { fill: '#f59e0b', glow: '#f59e0b80', labelColor: '#fcd34d' },
  buyer: { fill: '#f97316', glow: '#f9731680', labelColor: '#fdba74' },
  credential: { fill: '#22d3ee', glow: '#22d3ee80', labelColor: '#67e8f9' },
  victim_account: { fill: '#3b82f6', glow: '#3b82f680', labelColor: '#93c5fd' },
};

const LEGEND_ITEMS: { type: NodeType; label: string }[] = [
  { type: 'seller', label: 'Seller' },
  { type: 'marketplace', label: 'Marketplace' },
  { type: 'buyer', label: 'Buyer' },
  { type: 'credential', label: 'Credential' },
  { type: 'victim_account', label: 'Victim Account' },
];

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

const REPULSION = 4000;
const ATTRACTION = 0.005;
const DAMPING = 0.88;
const CENTER_PULL = 0.01;
const MIN_DISTANCE = 40;
const VELOCITY_CAP = 6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CredentialSellingGraph({ cases, darkWebHits, onNodeSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const dragMovedRef = useRef(false);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const timeRef = useRef(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 800, h: 380 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Build graph data from cases and hits
  // -----------------------------------------------------------------------

  const { nodes: initialNodes, edges: initialEdges, stats, caseMapping, hitMapping } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];
    const seenEdges = new Set<string>();

    const addNode = (id: string, type: NodeType, label: string, risk: number) => {
      if (!nodeMap.has(id)) {
        const radius = type === 'marketplace' ? 18 : type === 'seller' ? 16 : 12;
        nodeMap.set(id, {
          id,
          type,
          label,
          x: 200 + Math.random() * 400,
          y: 80 + Math.random() * 220,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          risk,
          pinned: false,
          radius,
        });
      }
    };

    const addEdge = (source: string, target: string, confidence: number, label: string) => {
      const key = `${source}--${target}`;
      const reverseKey = `${target}--${source}`;
      if (!seenEdges.has(key) && !seenEdges.has(reverseKey)) {
        seenEdges.add(key);
        edgeList.push({ source, target, confidence, label });
      }
    };

    let sellerCount = 0;
    let marketplaceCount = 0;
    let connectionCount = 0;

    const marketplaceSet = new Set<string>();
    const nodeToCases = new Map<string, Set<string>>();
    const nodeToHits = new Map<string, Set<string>>();

    const linkCase = (nodeId: string, caseId: string) => {
      if (!nodeToCases.has(nodeId)) nodeToCases.set(nodeId, new Set());
      nodeToCases.get(nodeId)!.add(caseId);
    };
    const linkHit = (nodeId: string, hitId: string) => {
      if (!nodeToHits.has(nodeId)) nodeToHits.set(nodeId, new Set());
      nodeToHits.get(nodeId)!.add(hitId);
    };

    // Build from cases
    for (const c of cases) {
      const sellerId = `seller_${c.case_id}`;
      const riskNum =
        c.risk_tier === 'critical' ? 95 :
        c.risk_tier === 'high' ? 80 :
        c.risk_tier === 'medium' ? 50 : 25;
      addNode(sellerId, 'seller', c.entity_name, Math.max(riskNum, c.seller_confidence));
      linkCase(sellerId, c.case_id);
      sellerCount++;

      // Dark web intel marketplace
      const intel = parseJsonField<{ marketplace?: string; seller_handle?: string; price_usd?: number }>(c.dark_web_intel);
      if (intel?.marketplace) {
        const mpId = `mp_${intel.marketplace.replace(/\s+/g, '_')}`;
        addNode(mpId, 'marketplace', intel.marketplace, 70);
        linkCase(mpId, c.case_id);
        addEdge(sellerId, mpId, c.seller_confidence / 100, 'listed_on');
        marketplaceSet.add(mpId);
        connectionCount++;
      }

      // Network connections
      const conns = ensureArray<{ entity: string; type: string; relationship: string; confidence: number }>(c.network_connections);
      for (const nc of conns) {
        const connType: NodeType =
          nc.type === 'buyer' ? 'buyer' :
          nc.type === 'marketplace' ? 'marketplace' :
          nc.type === 'credential' ? 'credential' :
          nc.type === 'victim_account' ? 'victim_account' :
          nc.relationship?.includes('buyer') ? 'buyer' :
          nc.relationship?.includes('credential') || nc.relationship?.includes('account') ? 'credential' :
          'victim_account';

        const connId = `conn_${nc.entity.replace(/\s+/g, '_')}_${nc.type}`;
        const connRisk = nc.confidence * 100;
        addNode(connId, connType, nc.entity, connRisk);
        linkCase(connId, c.case_id);
        addEdge(sellerId, connId, nc.confidence, nc.relationship);
        connectionCount++;

        if (connType === 'marketplace') {
          marketplaceSet.add(connId);
        }
      }
    }

    // Build from dark web hits
    for (const hit of darkWebHits) {
      const mpId = `mp_${hit.marketplace.replace(/\s+/g, '_')}`;
      if (!nodeMap.has(mpId)) {
        addNode(mpId, 'marketplace', hit.marketplace, 70);
        marketplaceSet.add(mpId);
      }

      const sellerFromHit = `seller_hit_${hit.seller_handle.replace(/\s+/g, '_')}`;
      if (!nodeMap.has(sellerFromHit)) {
        addNode(sellerFromHit, 'seller', hit.seller_handle, 65);
        sellerCount++;
      }
      linkHit(sellerFromHit, hit.hit_id);
      linkHit(mpId, hit.hit_id);
      addEdge(sellerFromHit, mpId, 0.8, 'sells_on');
      connectionCount++;

      if (hit.entity_id) {
        const victimId = `victim_${hit.entity_id}`;
        if (!nodeMap.has(victimId)) {
          addNode(victimId, 'victim_account', hit.entity_id, 60);
        }
        linkHit(victimId, hit.hit_id);
        addEdge(sellerFromHit, victimId, 0.7, 'compromised');
        connectionCount++;
      }
    }

    marketplaceCount = marketplaceSet.size;

    const caseMapping = Object.fromEntries(
      Array.from(nodeToCases.entries()).map(([k, v]) => [k, Array.from(v)])
    );
    const hitMapping = Object.fromEntries(
      Array.from(nodeToHits.entries()).map(([k, v]) => [k, Array.from(v)])
    );

    return {
      nodes: Array.from(nodeMap.values()),
      edges: edgeList,
      stats: { sellers: sellerCount, marketplaces: marketplaceCount, connections: connectionCount },
      caseMapping,
      hitMapping,
    };
  }, [cases, darkWebHits]);

  // Initialize refs once
  useEffect(() => {
    nodesRef.current = initialNodes.map(n => ({ ...n }));
    edgesRef.current = initialEdges.map(e => ({ ...e }));

    // Create particles for each edge
    const particles: Particle[] = [];
    for (const edge of initialEdges) {
      const count = Math.max(1, Math.round(edge.confidence * 3));
      for (let i = 0; i < count; i++) {
        particles.push({
          edge,
          t: Math.random(),
          speed: 0.003 + Math.random() * 0.004,
        });
      }
    }
    particlesRef.current = particles;
  }, [initialNodes, initialEdges]);

  // -----------------------------------------------------------------------
  // Canvas sizing
  // -----------------------------------------------------------------------

  const updateSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = 380;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h };
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [updateSize]);

  // -----------------------------------------------------------------------
  // Node lookup helper
  // -----------------------------------------------------------------------

  const findNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
        return n;
      }
    }
    return null;
  }, []);

  // -----------------------------------------------------------------------
  // Mouse handlers
  // -----------------------------------------------------------------------

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    mouseRef.current = pos;

    if (dragRef.current) {
      dragMovedRef.current = true;
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) {
        node.x = pos.x - dragRef.current.offsetX;
        node.y = pos.y - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    const hit = findNodeAt(pos.x, pos.y);
    hoveredRef.current = hit ? hit.id : null;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = hit ? 'pointer' : 'default';
  }, [getCanvasPos, findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    const hit = findNodeAt(pos.x, pos.y);
    dragMovedRef.current = false;
    if (hit) {
      dragRef.current = { nodeId: hit.id, offsetX: pos.x - hit.x, offsetY: pos.y - hit.y };
      hit.pinned = true;
    }
  }, [getCanvasPos, findNodeAt]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return;
    const pos = getCanvasPos(e);
    const hit = findNodeAt(pos.x, pos.y);
    if (hit) {
      const newId = selectedRef.current === hit.id ? null : hit.id;
      selectedRef.current = newId;
      setSelectedNodeId(newId);
      if (newId && onNodeSelect) {
        const connectedCases = new Set<string>(caseMapping[newId] || []);
        const connectedHits = new Set<string>(hitMapping[newId] || []);
        for (const edge of edgesRef.current) {
          const neighbor = edge.source === newId ? edge.target : edge.target === newId ? edge.source : null;
          if (neighbor) {
            for (const cid of (caseMapping[neighbor] || [])) connectedCases.add(cid);
            for (const hid of (hitMapping[neighbor] || [])) connectedHits.add(hid);
          }
        }
        onNodeSelect({
          id: newId,
          type: hit.type,
          label: hit.label,
          caseIds: Array.from(connectedCases),
          hitIds: Array.from(connectedHits),
        });
      } else if (onNodeSelect) {
        onNodeSelect(null);
      }
    } else {
      selectedRef.current = null;
      setSelectedNodeId(null);
      if (onNodeSelect) onNodeSelect(null);
    }
  }, [getCanvasPos, findNodeAt, onNodeSelect, caseMapping, hitMapping]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  // -----------------------------------------------------------------------
  // Drawing helpers
  // -----------------------------------------------------------------------

  const drawHexagon = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  const drawDiamond = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  };

  // -----------------------------------------------------------------------
  // Main animation loop
  // -----------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tick = () => {
      const { w, h } = sizeRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const particles = particlesRef.current;
      const hovered = hoveredRef.current;
      timeRef.current += 1;
      const t = timeRef.current;

      if (nodes.length === 0) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // -- Physics step --

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
          if (!b.pinned) { b.vx += fx; b.vy += fy; }
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = nodes.find(n => n.id === edge.source);
        const b = nodes.find(n => n.id === edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        const force = dist * ATTRACTION;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned) { a.vx += fx; a.vy += fy; }
        if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
      }

      // Center pull and integration
      const cx = w / 2;
      const cy = h / 2;
      for (const n of nodes) {
        if (n.pinned) continue;
        n.vx += (cx - n.x) * CENTER_PULL;
        n.vy += (cy - n.y) * CENTER_PULL;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        // Cap velocity
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > VELOCITY_CAP) {
          n.vx = (n.vx / speed) * VELOCITY_CAP;
          n.vy = (n.vy / speed) * VELOCITY_CAP;
        }
        n.x += n.vx;
        n.y += n.vy;
        // Keep within bounds
        const margin = n.radius + 4;
        if (n.x < margin) { n.x = margin; n.vx *= -0.5; }
        if (n.x > w - margin) { n.x = w - margin; n.vx *= -0.5; }
        if (n.y < margin) { n.y = margin; n.vy *= -0.5; }
        if (n.y > h - margin) { n.y = h - margin; n.vy *= -0.5; }
      }

      // -- Update particles --
      for (const p of particles) {
        p.t += p.speed;
        if (p.t > 1) p.t -= 1;
      }

      // -- Clear canvas --
      ctx.fillStyle = '#080c16';
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.25)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < w; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // -- Connected edges set for hover/selected highlight --
      const connectedEdgeKeys = new Set<string>();
      const connectedNodeIds = new Set<string>();
      const activeHighlight = hovered || selectedRef.current;
      if (activeHighlight) {
        connectedNodeIds.add(activeHighlight);
        for (const e of edges) {
          if (e.source === activeHighlight || e.target === activeHighlight) {
            connectedEdgeKeys.add(`${e.source}--${e.target}`);
            connectedNodeIds.add(e.source);
            connectedNodeIds.add(e.target);
          }
        }
      }

      // -- Draw edges --
      for (const edge of edges) {
        const a = nodes.find(n => n.id === edge.source);
        const b = nodes.find(n => n.id === edge.target);
        if (!a || !b) continue;

        const isHighlighted = connectedEdgeKeys.has(`${edge.source}--${edge.target}`);
        const isDimmed = activeHighlight && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 1 + edge.confidence * 3;
        ctx.strokeStyle = isDimmed
          ? 'rgba(51, 65, 85, 0.15)'
          : isHighlighted
            ? 'rgba(56, 189, 248, 0.6)'
            : 'rgba(51, 65, 85, 0.4)';
        ctx.stroke();
      }

      // -- Draw particles --
      for (const p of particles) {
        const a = nodes.find(n => n.id === p.edge.source);
        const b = nodes.find(n => n.id === p.edge.target);
        if (!a || !b) continue;

        const isHighlighted = connectedEdgeKeys.has(`${p.edge.source}--${p.edge.target}`);
        const isDimmed = activeHighlight && !isHighlighted;
        if (isDimmed) continue;

        const px = a.x + (b.x - a.x) * p.t;
        const py = a.y + (b.y - a.y) * p.t;

        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted ? 'rgba(56, 189, 248, 0.9)' : 'rgba(148, 163, 184, 0.6)';
        ctx.fill();
      }

      // -- Draw pulse rings on critical nodes --
      for (const n of nodes) {
        if (n.risk < 80) continue;
        const style = NODE_STYLES[n.type];
        const pulsePhase = ((t * 0.02) + n.x * 0.01) % 1;
        const pulseR = n.radius + pulsePhase * 30;
        const pulseAlpha = (1 - pulsePhase) * 0.35;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = style.fill.replace(')', `, ${pulseAlpha})`).replace('rgb', 'rgba');
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Second ring offset
        const pulsePhase2 = ((t * 0.02) + n.x * 0.01 + 0.5) % 1;
        const pulseR2 = n.radius + pulsePhase2 * 30;
        const pulseAlpha2 = (1 - pulsePhase2) * 0.25;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR2, 0, Math.PI * 2);
        ctx.strokeStyle = style.fill.replace(')', `, ${pulseAlpha2})`).replace('rgb', 'rgba');
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // -- Draw nodes --
      for (const n of nodes) {
        const style = NODE_STYLES[n.type];
        const isHovered = hovered === n.id || selectedRef.current === n.id;
        const isConnected = connectedNodeIds.has(n.id);
        const isDimmed = activeHighlight && !isConnected;

        const alpha = isDimmed ? 0.2 : 1;

        // Glow halo for high-risk
        if (n.risk > 75 && !isDimmed) {
          const glowR = n.radius + 8 + Math.sin(t * 0.05) * 3;
          const grad = ctx.createRadialGradient(n.x, n.y, n.radius, n.x, n.y, glowR);
          grad.addColorStop(0, style.glow);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha;

        // Draw shape
        if (n.type === 'marketplace') {
          // Hexagonal
          drawHexagon(ctx, n.x, n.y, n.radius);
          ctx.fillStyle = style.fill;
          ctx.fill();
          ctx.strokeStyle = isHovered ? '#fff' : style.labelColor;
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.stroke();
        } else if (n.type === 'credential') {
          // Diamond
          drawDiamond(ctx, n.x, n.y, n.radius);
          ctx.fillStyle = style.fill;
          ctx.fill();
          ctx.strokeStyle = isHovered ? '#fff' : style.labelColor;
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.stroke();
        } else {
          // Circle (seller, buyer, victim_account)
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fillStyle = style.fill;
          ctx.fill();
          ctx.strokeStyle = isHovered ? '#fff' : style.labelColor;
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.stroke();

          // Seller pulsing animation
          if (n.type === 'seller') {
            const pulse = 0.7 + Math.sin(t * 0.08) * 0.3;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * pulse * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${0.35 * pulse})`;
            ctx.fill();

            // Skull icon text
            ctx.font = `bold ${Math.round(n.radius * 0.75)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#1a1a2e';
            ctx.fillText('\u2620', n.x, n.y + 1);
          }
        }

        // Node label
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isDimmed ? 'rgba(148,163,184,0.2)' : style.labelColor;

        const truncLabel = n.label.length > 14 ? n.label.slice(0, 13) + '\u2026' : n.label;
        ctx.fillText(truncLabel, n.x, n.y + n.radius + 4);

        ctx.globalAlpha = 1;
      }

      // -- Hovered node tooltip --
      if (hovered) {
        const hn = nodes.find(n => n.id === hovered);
        if (hn) {
          const tooltipW = 160;
          const tooltipH = 52;
          let tx = hn.x + hn.radius + 10;
          let ty = hn.y - tooltipH / 2;
          if (tx + tooltipW > w) tx = hn.x - hn.radius - tooltipW - 10;
          if (ty < 4) ty = 4;
          if (ty + tooltipH > h - 4) ty = h - tooltipH - 4;

          ctx.fillStyle = 'rgba(15, 22, 41, 0.95)';
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
          ctx.fill();
          ctx.stroke();

          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText(hn.label.length > 18 ? hn.label.slice(0, 17) + '\u2026' : hn.label, tx + 8, ty + 8);

          ctx.font = '10px monospace';
          ctx.fillStyle = NODE_STYLES[hn.type].labelColor;
          ctx.fillText(hn.type.replace('_', ' '), tx + 8, ty + 22);

          ctx.fillStyle = hn.risk > 75 ? '#f87171' : hn.risk > 50 ? '#fb923c' : '#34d399';
          ctx.fillText(`Risk: ${hn.risk}`, tx + 8, ty + 36);
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="relative w-full" style={{ height: 380 }} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl"
        style={{ height: 380, background: '#080c16' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Selected node indicator */}
      {selectedNodeId && (() => {
        const sn = initialNodes.find(n => n.id === selectedNodeId);
        if (!sn) return null;
        return (
          <div className="absolute top-3 left-3 bg-[#0f1629]/90 border border-cyan-500/30 rounded-lg px-3 py-2 backdrop-blur-sm flex items-center gap-2">
            <Eye size={12} className="text-cyan-400" />
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NODE_STYLES[sn.type].fill }}
            />
            <span className="text-[10px] font-mono text-cyan-300">{sn.label}</span>
            <span className="text-[9px] text-slate-500 capitalize">{sn.type.replace('_', ' ')}</span>
            <button
              onClick={() => {
                selectedRef.current = null;
                setSelectedNodeId(null);
                if (onNodeSelect) onNodeSelect(null);
              }}
              className="ml-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <EyeOff size={12} />
            </button>
          </div>
        );
      })()}

      {/* Stats overlay -- top right */}
      <div className="absolute top-3 right-3 bg-[#0f1629]/90 border border-[#1e293b] rounded-lg px-3 py-2 backdrop-blur-sm pointer-events-none">
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle size={10} className="text-amber-400" />
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Network Stats</span>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-slate-500">Sellers</span>
            <span className="text-[10px] font-mono font-bold text-red-400">{stats.sellers}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-slate-500">Marketplaces</span>
            <span className="text-[10px] font-mono font-bold text-amber-400">{stats.marketplaces}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-slate-500">Connections</span>
            <span className="text-[10px] font-mono font-bold text-cyan-400">{stats.connections}</span>
          </div>
        </div>
      </div>

      {/* Legend -- bottom left */}
      <div className="absolute bottom-3 left-3 bg-[#0f1629]/90 border border-[#1e293b] rounded-lg px-3 py-2 backdrop-blur-sm pointer-events-none">
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Legend</span>
        <div className="flex items-center gap-3">
          {LEGEND_ITEMS.map(item => {
            const style = NODE_STYLES[item.type];
            return (
              <div key={item.type} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{
                    backgroundColor: style.fill,
                    borderRadius: item.type === 'marketplace' ? '1px' : item.type === 'credential' ? '0' : '50%',
                    transform: item.type === 'credential' ? 'rotate(45deg) scale(0.8)' : 'none',
                  }}
                />
                <span className="text-[9px] text-slate-400">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {initialNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Globe size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No credential network data available</p>
          </div>
        </div>
      )}
    </div>
  );
}
