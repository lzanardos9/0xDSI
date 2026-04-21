import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Network,
  AlertTriangle,
  Shield,
  Activity,
  Loader2,
  RefreshCw,
  Filter,
  Search,
  Eye,
  EyeOff,
  Users,
  Link2,
  CircleDot,
  Layers,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphEdge {
  id: string;
  source_node_id: string;
  source_node_type: string;
  target_node_id: string;
  target_node_type: string;
  edge_type: string;
  weight: number;
  is_suspicious: boolean;
  first_seen: string;
  last_seen: string;
}

interface IdentityProfile {
  entity_id: string;
  entity_name: string;
  trust_score: number;
  identity_status: string;
}

interface GraphNode {
  id: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  pinned: boolean;
  label: string;
  clusterId: number;
  profile?: IdentityProfile;
}

interface SimEdge {
  source: string;
  target: string;
  edgeType: string;
  weight: number;
  isSuspicious: boolean;
  firstSeen: string;
  lastSeen: string;
  id: string;
}

interface Tooltip {
  x: number;
  y: number;
  node: GraphNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<string, string> = {
  user: '#22d3ee',
  device: '#22c55e',
  ip: '#eab308',
  session: '#94a3b8',
  transaction: '#3b82f6',
  beneficiary: '#f97316',
  entity: '#14b8a6',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  user: 'User',
  device: 'Device',
  ip: 'IP Address',
  session: 'Session',
  transaction: 'Transaction',
  beneficiary: 'Beneficiary',
  entity: 'Entity',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateId(id: string, len = 8): string {
  if (!id) return '';
  return id.length > len ? id.slice(0, len) + '\u2026' : id;
}

function formatDate(dt: string | null | undefined): string {
  if (!dt) return '\u2014';
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return 'Never';
  const diff = Date.now() - new Date(dt).getTime();
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Cluster Detection
// ---------------------------------------------------------------------------

function detectClusters(nodes: GraphNode[], edges: SimEdge[]): Map<string, number> {
  // Union-Find for connected components, prioritizing device/ip shared links
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function find(x: string): string {
    if (!parent.has(x)) {
      parent.set(x, x);
      rank.set(x, 0);
    }
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra) || 0;
    const rankB = rank.get(rb) || 0;
    if (rankA < rankB) parent.set(ra, rb);
    else if (rankA > rankB) parent.set(rb, ra);
    else {
      parent.set(rb, ra);
      rank.set(ra, rankA + 1);
    }
  }

  for (const n of nodes) {
    find(n.id);
  }

  for (const e of edges) {
    union(e.source, e.target);
  }

  const clusterMap = new Map<string, number>();
  const rootToId = new Map<string, number>();
  let nextId = 0;

  for (const n of nodes) {
    const root = find(n.id);
    if (!rootToId.has(root)) {
      rootToId.set(root, nextId++);
    }
    clusterMap.set(n.id, rootToId.get(root)!);
  }

  return clusterMap;
}

function findMuleClusters(
  nodes: GraphNode[],
  edges: SimEdge[],
  clusterMap: Map<string, number>
): Set<number> {
  // A cluster is flagged as a mule network if it has suspicious edges
  // or shares devices/IPs across multiple users
  const muleClusterIds = new Set<number>();

  // Flag clusters with suspicious edges
  for (const e of edges) {
    if (e.isSuspicious) {
      const cid = clusterMap.get(e.source);
      if (cid !== undefined) muleClusterIds.add(cid);
    }
  }

  // Flag clusters where multiple users share a device or IP
  const clusterDeviceUsers = new Map<number, Map<string, Set<string>>>();
  for (const e of edges) {
    const sourceNode = nodes.find((n) => n.id === e.source);
    const targetNode = nodes.find((n) => n.id === e.target);
    if (!sourceNode || !targetNode) continue;

    let userNode: GraphNode | undefined;
    let sharedNode: GraphNode | undefined;

    if (sourceNode.type === 'user' && (targetNode.type === 'device' || targetNode.type === 'ip')) {
      userNode = sourceNode;
      sharedNode = targetNode;
    } else if (
      targetNode.type === 'user' &&
      (sourceNode.type === 'device' || sourceNode.type === 'ip')
    ) {
      userNode = targetNode;
      sharedNode = sourceNode;
    }

    if (userNode && sharedNode) {
      const cid = clusterMap.get(userNode.id) ?? 0;
      if (!clusterDeviceUsers.has(cid)) clusterDeviceUsers.set(cid, new Map());
      const deviceMap = clusterDeviceUsers.get(cid)!;
      if (!deviceMap.has(sharedNode.id)) deviceMap.set(sharedNode.id, new Set());
      deviceMap.get(sharedNode.id)!.add(userNode.id);
    }
  }

  for (const [cid, deviceMap] of clusterDeviceUsers) {
    for (const [, users] of deviceMap) {
      if (users.size > 1) {
        muleClusterIds.add(cid);
        break;
      }
    }
  }

  return muleClusterIds;
}

// ---------------------------------------------------------------------------
// Force Simulation
// ---------------------------------------------------------------------------

function runForceStep(nodes: GraphNode[], edges: SimEdge[], width: number, height: number) {
  const REPULSION = 3000;
  const ATTRACTION = 0.005;
  const DAMPING = 0.85;
  const CENTER_PULL = 0.01;
  const centerX = width / 2;
  const centerY = height / 2;

  // Repulsion between all node pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.pinned) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  // Attraction along edges
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const e of edges) {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;
    const force = dist * ATTRACTION * (e.weight || 1);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) {
      a.vx += fx;
      a.vy += fy;
    }
    if (!b.pinned) {
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Center pull + apply velocity
  for (const n of nodes) {
    if (n.pinned) continue;
    n.vx += (centerX - n.x) * CENTER_PULL;
    n.vy += (centerY - n.y) * CENTER_PULL;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    // Keep in bounds
    const pad = 30;
    n.x = Math.max(pad, Math.min(width - pad, n.x));
    n.y = Math.max(pad, Math.min(height - pad, n.y));
  }
}

// ---------------------------------------------------------------------------
// Canvas Drawing
// ---------------------------------------------------------------------------

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: SimEdge[],
  width: number,
  height: number,
  highlightedNode: string | null,
  hoveredNode: string | null,
  muleClusters: Set<number>,
  dpr: number
) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, width, height);

  // Grid dots
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < width; x += 30) {
    for (let y = 0; y < height; y += 30) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const highlightedEdges = new Set<string>();
  if (highlightedNode) {
    for (const e of edges) {
      if (e.source === highlightedNode || e.target === highlightedNode) {
        highlightedEdges.add(e.id);
      }
    }
  }

  // Draw edges
  for (const e of edges) {
    const a = nodeMap.get(e.source);
    const b = nodeMap.get(e.target);
    if (!a || !b) continue;

    const isHighlighted = highlightedEdges.has(e.id);
    const dimmed = highlightedNode && !isHighlighted;
    const lineWidth = Math.max(1, Math.min(4, e.weight * 1.5));

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);

    if (e.isSuspicious) {
      // Dashed red line
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = dimmed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.7)';
    } else {
      ctx.setLineDash([]);
      ctx.strokeStyle = dimmed ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.2)';
    }

    if (isHighlighted) {
      ctx.strokeStyle = e.isSuspicious ? 'rgba(239, 68, 68, 0.9)' : 'rgba(148, 163, 184, 0.5)';
    }

    ctx.lineWidth = isHighlighted ? lineWidth + 1 : lineWidth;
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw mule cluster halos
  const clusterNodePositions = new Map<number, { xs: number[]; ys: number[] }>();
  for (const n of nodes) {
    if (muleClusters.has(n.clusterId)) {
      if (!clusterNodePositions.has(n.clusterId)) {
        clusterNodePositions.set(n.clusterId, { xs: [], ys: [] });
      }
      const pos = clusterNodePositions.get(n.clusterId)!;
      pos.xs.push(n.x);
      pos.ys.push(n.y);
    }
  }

  for (const [, pos] of clusterNodePositions) {
    if (pos.xs.length < 2) continue;
    const cx = pos.xs.reduce((s, v) => s + v, 0) / pos.xs.length;
    const cy = pos.ys.reduce((s, v) => s + v, 0) / pos.ys.length;
    let maxDist = 0;
    for (let i = 0; i < pos.xs.length; i++) {
      const d = Math.sqrt((pos.xs[i] - cx) ** 2 + (pos.ys[i] - cy) ** 2);
      if (d > maxDist) maxDist = d;
    }
    const radius = maxDist + 40;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.06)');
    grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.03)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Dashed circle border
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw nodes
  const connectedToHighlight = new Set<string>();
  if (highlightedNode) {
    for (const e of edges) {
      if (e.source === highlightedNode) connectedToHighlight.add(e.target);
      if (e.target === highlightedNode) connectedToHighlight.add(e.source);
    }
    connectedToHighlight.add(highlightedNode);
  }

  for (const n of nodes) {
    const color = NODE_COLORS[n.type] || '#94a3b8';
    const baseRadius = Math.max(5, Math.min(16, 4 + n.connections * 1.5));
    const isHighlighted =
      n.id === highlightedNode || n.id === hoveredNode || connectedToHighlight.has(n.id);
    const dimmed = highlightedNode && !connectedToHighlight.has(n.id);
    const radius = isHighlighted ? baseRadius + 2 : baseRadius;

    // Glow
    if (isHighlighted) {
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius + 12);
      glow.addColorStop(0, color + '40');
      glow.addColorStop(1, color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = dimmed ? color + '30' : color + 'cc';
    ctx.fill();
    ctx.strokeStyle = dimmed ? color + '20' : color;
    ctx.lineWidth = isHighlighted ? 2 : 1;
    ctx.stroke();

    // Label
    if (radius >= 7 || isHighlighted) {
      ctx.font = `${isHighlighted ? 11 : 9}px ui-monospace, monospace`;
      ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(truncateId(n.label, 6), n.x, n.y + radius + 12);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IdentityGraphExplorer() {
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [profiles, setProfiles] = useState<IdentityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Graph state
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<SimEdge[]>([]);
  const [muleClusters, setMuleClusters] = useState<Set<number>>(new Set());
  const [clusterCount, setClusterCount] = useState(0);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Edge list filters
  const [filterSuspicious, setFilterSuspicious] = useState<'all' | 'yes' | 'no'>('all');
  const [filterEdgeType, setFilterEdgeType] = useState('all');
  const [filterNodeType, setFilterNodeType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null,
    offsetX: 0,
    offsetY: 0,
  });
  const muleRef = useRef<Set<number>>(new Set());
  const highlightRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const canvasWidth = useRef(900);
  const canvasHeight = useRef(500);
  const iterRef = useRef(0);

  // -----------------------------------------------------------------------
  // Fetch Data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [edgeRes, profileRes] = await Promise.all([
        supabase.from('financial_identity_graph_edges').select('*'),
        supabase
          .from('financial_identity_profiles')
          .select('entity_id, entity_name, trust_score, identity_status'),
      ]);

      if (edgeRes.error) throw edgeRes.error;
      if (profileRes.error) throw profileRes.error;

      setEdges(edgeRes.data || []);
      setProfiles(profileRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Build Graph from Edges
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (edges.length === 0) return;

    const profileMap = new Map<string, IdentityProfile>();
    for (const p of profiles) {
      profileMap.set(p.entity_id, p);
    }

    const nodeSet = new Map<string, { type: string; connections: number }>();

    const addNode = (id: string, type: string) => {
      const existing = nodeSet.get(id);
      if (existing) {
        existing.connections++;
      } else {
        nodeSet.set(id, { type, connections: 1 });
      }
    };

    const simEdges: SimEdge[] = edges.map((e) => {
      addNode(e.source_node_id, e.source_node_type);
      addNode(e.target_node_id, e.target_node_type);
      return {
        source: e.source_node_id,
        target: e.target_node_id,
        edgeType: e.edge_type,
        weight: e.weight,
        isSuspicious: e.is_suspicious,
        firstSeen: e.first_seen,
        lastSeen: e.last_seen,
        id: e.id,
      };
    });

    const w = canvasWidth.current;
    const h = canvasHeight.current;

    const simNodes: GraphNode[] = Array.from(nodeSet.entries()).map(([id, info]) => ({
      id,
      type: info.type,
      x: w * 0.2 + Math.random() * w * 0.6,
      y: h * 0.2 + Math.random() * h * 0.6,
      vx: 0,
      vy: 0,
      connections: info.connections,
      pinned: false,
      label: profileMap.get(id)?.entity_name || id,
      clusterId: 0,
      profile: profileMap.get(id),
    }));

    // Detect clusters
    const clusterMap = detectClusters(simNodes, simEdges);
    for (const n of simNodes) {
      n.clusterId = clusterMap.get(n.id) ?? 0;
    }
    const uniqueClusters = new Set(clusterMap.values());
    setClusterCount(uniqueClusters.size);

    const mule = findMuleClusters(simNodes, simEdges, clusterMap);
    setMuleClusters(mule);
    muleRef.current = mule;

    setGraphNodes(simNodes);
    setGraphEdges(simEdges);
    nodesRef.current = simNodes;
    edgesRef.current = simEdges;
    iterRef.current = 0;
  }, [edges, profiles]);

  // -----------------------------------------------------------------------
  // Animation Loop
  // -----------------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graphNodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth.current;
    const h = canvasHeight.current;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    let running = true;

    function tick() {
      if (!running || !ctx) return;

      // Run simulation (slow down over time)
      if (iterRef.current < 300) {
        runForceStep(nodesRef.current, edgesRef.current, w, h);
        iterRef.current++;
      } else if (dragRef.current.nodeId) {
        // Still run if dragging
        runForceStep(nodesRef.current, edgesRef.current, w, h);
      }

      drawGraph(
        ctx,
        nodesRef.current,
        edgesRef.current,
        w,
        h,
        highlightRef.current,
        hoveredRef.current,
        muleRef.current,
        dpr
      );

      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [graphNodes.length]);

  // Keep refs in sync
  useEffect(() => {
    highlightRef.current = highlightedNode;
  }, [highlightedNode]);
  useEffect(() => {
    hoveredRef.current = hoveredNode;
  }, [hoveredNode]);

  // -----------------------------------------------------------------------
  // Canvas Interaction
  // -----------------------------------------------------------------------

  const getNodeAtPos = useCallback(
    (mx: number, my: number): GraphNode | null => {
      for (let i = nodesRef.current.length - 1; i >= 0; i--) {
        const n = nodesRef.current[i];
        const r = Math.max(5, Math.min(16, 4 + n.connections * 1.5)) + 4;
        const dx = mx - n.x;
        const dy = my - n.y;
        if (dx * dx + dy * dy < r * r) return n;
      }
      return null;
    },
    []
  );

  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const node = getNodeAtPos(pos.x, pos.y);
      if (node) {
        dragRef.current = { nodeId: node.id, offsetX: pos.x - node.x, offsetY: pos.y - node.y };
        node.pinned = true;
        iterRef.current = 0; // Restart simulation
      }
    },
    [getCanvasPos, getNodeAtPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);

      if (dragRef.current.nodeId) {
        const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
        if (node) {
          node.x = pos.x - dragRef.current.offsetX;
          node.y = pos.y - dragRef.current.offsetY;
          node.vx = 0;
          node.vy = 0;
        }
        return;
      }

      const node = getNodeAtPos(pos.x, pos.y);
      if (node) {
        setHoveredNode(node.id);
        setTooltip({ x: pos.x, y: pos.y, node });
        if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
      } else {
        setHoveredNode(null);
        setTooltip(null);
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      }
    },
    [getCanvasPos, getNodeAtPos]
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
      if (node) node.pinned = false;
      dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const node = getNodeAtPos(pos.x, pos.y);
      if (node) {
        setHighlightedNode((prev) => (prev === node.id ? null : node.id));
      } else {
        setHighlightedNode(null);
      }
    },
    [getCanvasPos, getNodeAtPos]
  );

  // -----------------------------------------------------------------------
  // Derived Stats
  // -----------------------------------------------------------------------

  const stats = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const e of edges) {
      nodeIds.add(e.source_node_id);
      nodeIds.add(e.target_node_id);
    }
    return {
      totalNodes: nodeIds.size,
      totalEdges: edges.length,
      suspiciousEdges: edges.filter((e) => e.is_suspicious).length,
      clusters: clusterCount,
    };
  }, [edges, clusterCount]);

  // -----------------------------------------------------------------------
  // Edge List Filtering
  // -----------------------------------------------------------------------

  const edgeTypes = useMemo(
    () => [...new Set(edges.map((e) => e.edge_type))].sort(),
    [edges]
  );

  const nodeTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of edges) {
      types.add(e.source_node_type);
      types.add(e.target_node_type);
    }
    return [...types].sort();
  }, [edges]);

  const filteredEdges = useMemo(() => {
    let result = edges;

    if (highlightedNode) {
      result = result.filter(
        (e) => e.source_node_id === highlightedNode || e.target_node_id === highlightedNode
      );
    }

    if (filterSuspicious === 'yes') result = result.filter((e) => e.is_suspicious);
    else if (filterSuspicious === 'no') result = result.filter((e) => !e.is_suspicious);

    if (filterEdgeType !== 'all') result = result.filter((e) => e.edge_type === filterEdgeType);

    if (filterNodeType !== 'all')
      result = result.filter(
        (e) => e.source_node_type === filterNodeType || e.target_node_type === filterNodeType
      );

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.source_node_id.toLowerCase().includes(term) ||
          e.target_node_id.toLowerCase().includes(term) ||
          e.edge_type.toLowerCase().includes(term)
      );
    }

    return result;
  }, [edges, highlightedNode, filterSuspicious, filterEdgeType, filterNodeType, searchTerm]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-[#0a0e1a]">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <span className="ml-3 text-slate-400 text-sm">Loading identity graph...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-[#0a0e1a]">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
        <span className="text-red-400 text-sm">{error}</span>
        <button
          onClick={fetchData}
          className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-[#0a0e1a] min-h-screen p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Identity Graph Explorer</h2>
          <span className="text-xs text-slate-500 ml-2">
            {stats.totalNodes} nodes / {stats.totalEdges} edges
          </span>
        </div>
        <button
          onClick={() => {
            iterRef.current = 0;
            fetchData();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs rounded border border-slate-700/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'Total Nodes',
            value: stats.totalNodes,
            icon: CircleDot,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/10 border-cyan-500/20',
          },
          {
            label: 'Total Edges',
            value: stats.totalEdges,
            icon: Link2,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10 border-blue-500/20',
          },
          {
            label: 'Suspicious Edges',
            value: stats.suspiciousEdges,
            icon: AlertTriangle,
            color: 'text-red-400',
            bg: 'bg-red-500/10 border-red-500/20',
          },
          {
            label: 'Network Clusters',
            value: stats.clusters,
            icon: Layers,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10 border-amber-500/20',
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-3 ${card.bg}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider">
                {card.label}
              </span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-2">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-slate-400 capitalize">
              {NODE_TYPE_LABELS[type] || type}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4">
          <div className="w-5 h-0.5 border-t border-dashed border-red-500" />
          <span className="text-[10px] text-slate-400">Suspicious</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border border-dashed border-red-500/40 bg-red-500/10" />
          <span className="text-[10px] text-slate-400">Mule Cluster</span>
        </div>
      </div>

      {/* Graph Canvas */}
      <div
        ref={containerRef}
        className="relative rounded-lg border border-slate-700/50 overflow-hidden"
        style={{ height: 500 }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: canvasWidth.current, height: canvasHeight.current, display: 'block' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setHoveredNode(null);
            setTooltip(null);
          }}
          onClick={handleClick}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 shadow-xl"
            style={{
              left: Math.min(tooltip.x + 12, canvasWidth.current - 200),
              top: Math.max(tooltip.y - 60, 8),
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: NODE_COLORS[tooltip.node.type] || '#94a3b8' }}
              />
              <span className="text-xs font-medium text-white capitalize">
                {NODE_TYPE_LABELS[tooltip.node.type] || tooltip.node.type}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mb-1">
              {truncateId(tooltip.node.id, 20)}
            </div>
            {tooltip.node.profile && (
              <div className="text-[10px] text-slate-300 mb-1">
                {tooltip.node.profile.entity_name}
              </div>
            )}
            <div className="text-[10px] text-slate-500">
              {tooltip.node.connections} connection{tooltip.node.connections !== 1 ? 's' : ''}
            </div>
            {tooltip.node.profile && (
              <div className="text-[10px] text-slate-500">
                Trust: {tooltip.node.profile.trust_score} | {tooltip.node.profile.identity_status}
              </div>
            )}
          </div>
        )}

        {/* Highlight info */}
        {highlightedNode && (
          <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-300">
                Focused: {truncateId(highlightedNode, 12)}
              </span>
              <button
                onClick={() => setHighlightedNode(null)}
                className="ml-2 text-slate-500 hover:text-slate-300"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {graphNodes.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No graph data available</p>
            </div>
          </div>
        )}
      </div>

      {/* Edge List Panel */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/40">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-medium text-white">Edge List</h3>
            <span className="text-xs text-slate-500">
              {filteredEdges.length} of {edges.length}
            </span>
            {highlightedNode && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] text-cyan-400 font-mono">
                <Eye className="w-3 h-3" />
                {truncateId(highlightedNode, 14)}
                <button
                  onClick={() => setHighlightedNode(null)}
                  className="ml-0.5 hover:text-white transition-colors"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-700/30 bg-slate-900/20">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search nodes..."
              className="pl-6 pr-2 py-1 bg-slate-800/80 border border-slate-700/50 rounded text-xs text-slate-300 placeholder-slate-600 w-40 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <select
            value={filterSuspicious}
            onChange={(e) => setFilterSuspicious(e.target.value as 'all' | 'yes' | 'no')}
            className="bg-slate-800/80 border border-slate-700/50 rounded text-xs text-slate-300 px-2 py-1 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Edges</option>
            <option value="yes">Suspicious Only</option>
            <option value="no">Normal Only</option>
          </select>

          <select
            value={filterEdgeType}
            onChange={(e) => setFilterEdgeType(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/50 rounded text-xs text-slate-300 px-2 py-1 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Edge Types</option>
            {edgeTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filterNodeType}
            onChange={(e) => setFilterNodeType(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/50 rounded text-xs text-slate-300 px-2 py-1 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Node Types</option>
            {nodeTypes.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900/95">
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-slate-400 font-medium px-4 py-2">Source</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Target</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Edge Type</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2 w-28">Weight</th>
                <th className="text-center text-slate-400 font-medium px-4 py-2">Suspicious</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">First Seen</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredEdges.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    No edges match the current filters.
                  </td>
                </tr>
              ) : (
                filteredEdges.slice(0, 100).map((edge) => (
                  <tr
                    key={edge.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: NODE_COLORS[edge.source_node_type] || '#94a3b8',
                          }}
                        />
                        <span className="text-slate-400 text-[10px] capitalize">
                          {edge.source_node_type}
                        </span>
                        <span className="text-slate-300 font-mono">
                          {truncateId(edge.source_node_id, 10)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: NODE_COLORS[edge.target_node_type] || '#94a3b8',
                          }}
                        />
                        <span className="text-slate-400 text-[10px] capitalize">
                          {edge.target_node_type}
                        </span>
                        <span className="text-slate-300 font-mono">
                          {truncateId(edge.target_node_id, 10)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                        {edge.edge_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cyan-500/70"
                            style={{ width: `${Math.min(100, (edge.weight / 5) * 100)}%` }}
                          />
                        </div>
                        <span className="text-slate-500 text-[10px] w-6 text-right">
                          {edge.weight.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {edge.is_suspicious ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 text-[10px]">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-600">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{formatDate(edge.first_seen)}</td>
                    <td className="px-4 py-2 text-slate-400">{timeAgo(edge.last_seen)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filteredEdges.length > 100 && (
            <div className="text-center text-xs text-slate-500 py-2 border-t border-slate-800/50">
              Showing 100 of {filteredEdges.length} edges
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
