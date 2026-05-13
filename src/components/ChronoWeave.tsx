import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Activity, Atom, Maximize2, Minimize2, Pause, Play, RotateCcw, Sparkles, Eye, EyeOff, Filter, Target, Globe as Globe2, ShieldAlert, Zap } from 'lucide-react';
import {
  CWCentroid, CWEdge, CWHit, CWNode,
  cosine, createSession, loadCentroids, tickSession,
} from '../lib/chronoweave';

type ViewMode = 'raw' | 'vector' | 'fusion';

interface HoverInfo { x: number; y: number; label: string; sub: string; color: string; }

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xef4444, high: 0xf97316, medium: 0xf59e0b, low: 0x22d3ee,
};

export default function ChronoWeave() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMeshRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const centroidMeshRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgeGroupRef = useRef<THREE.Group | null>(null);
  const linkGroupRef = useRef<THREE.Group | null>(null);
  const interBadGroupRef = useRef<THREE.Group | null>(null);
  const cameraRotRef = useRef({ theta: 0.6, phi: Math.PI / 5, dist: 70 });
  const dragRef = useRef({ down: false, lx: 0, ly: 0, btn: 0 });
  const panRef = useRef({ x: 0, y: 0, z: 0 });
  const animFrame = useRef<number>(0);

  const [centroids, setCentroids] = useState<CWCentroid[]>([]);
  const [nodes, setNodes] = useState<Map<string, CWNode>>(new Map());
  const [edges, setEdges] = useState<CWEdge[]>([]);
  const [hits, setHits] = useState<CWHit[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tickIndex, setTickIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState<ViewMode>('fusion');
  const [sweepBenign, setSweepBenign] = useState(false);
  const [showCentroids, setShowCentroids] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, malicious: 0, hits: 0, topCentroid: '' });

  // Initialize session + centroids
  useEffect(() => {
    let mounted = true;
    (async () => {
      const cs = await loadCentroids();
      if (!mounted) return;
      setCentroids(cs);
      const sid = await createSession(`ChronoWeave ${new Date().toLocaleTimeString()}`);
      if (!mounted) return;
      setSessionId(sid);
    })();
    return () => { mounted = false; };
  }, []);

  // Compounding tick loop (forever)
  useEffect(() => {
    if (!sessionId || !running || !centroids.length) return;
    let cancelled = false;
    let timer: any;
    const loop = async () => {
      if (cancelled) return;
      try {
        const recent = Array.from(nodes.values()).slice(-40);
        const { nodes: newNodes, edges: newEdges, hits: newHits } = await tickSession(
          sessionId, centroids, recent, tickIndex, 8,
        );
        if (cancelled) return;
        setNodes(prev => {
          const next = new Map(prev);
          for (const n of newNodes) next.set(n.id, n);
          return next;
        });
        setEdges(prev => [...prev, ...newEdges].slice(-3000));
        setHits(prev => [...prev, ...newHits].slice(-1500));
        setTickIndex(t => t + 1);
      } catch (e) {
        console.error('tick failed', e);
      }
      timer = setTimeout(loop, 2500);
    };
    timer = setTimeout(loop, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, running, centroids, tickIndex, nodes]);

  // Stats refresh
  useEffect(() => {
    const malicious = Array.from(nodes.values()).filter(n => !n.is_benign).length;
    const counts: Record<string, number> = {};
    for (const h of hits) counts[h.centroid_id] = (counts[h.centroid_id] || 0) + 1;
    let topId = ''; let topN = 0;
    for (const [k, v] of Object.entries(counts)) if (v > topN) { topId = k; topN = v; }
    const topName = centroids.find(c => c.id === topId)?.name || '';
    setStats({ total: nodes.size, malicious, hits: hits.length, topCentroid: topName });
  }, [nodes, hits, centroids]);

  // THREE setup
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.clientWidth;
    const h = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x05070d, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.set(0, 35, 70);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x6080a0, 0.55));
    const key = new THREE.PointLight(0x22d3ee, 1.2, 200);
    key.position.set(20, 40, 30);
    scene.add(key);
    const rim = new THREE.PointLight(0xef4444, 0.8, 200);
    rim.position.set(-30, 20, -25);
    scene.add(rim);

    // Grid disk
    const grid = new THREE.GridHelper(120, 24, 0x1e293b, 0x0f1729);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as any).opacity = 0.35;
    scene.add(grid);

    // Particle starfield
    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 600;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 600;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 600;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0x334155, size: 0.6 })));

    const eg = new THREE.Group(); scene.add(eg); edgeGroupRef.current = eg;
    const lg = new THREE.Group(); scene.add(lg); linkGroupRef.current = lg;
    const ibg = new THREE.Group(); scene.add(ibg); interBadGroupRef.current = ibg;

    // Pointer
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onDown = (e: MouseEvent) => {
      dragRef.current = { down: true, lx: e.clientX, ly: e.clientY, btn: e.button };
    };
    const onUp = () => { dragRef.current.down = false; };
    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragRef.current.down) {
        const dx = e.clientX - dragRef.current.lx;
        const dy = e.clientY - dragRef.current.ly;
        if (dragRef.current.btn === 2 || e.shiftKey) {
          panRef.current.x -= dx * 0.05;
          panRef.current.y += dy * 0.05;
        } else {
          cameraRotRef.current.theta -= dx * 0.005;
          cameraRotRef.current.phi = Math.max(0.05, Math.min(Math.PI - 0.05, cameraRotRef.current.phi - dy * 0.005));
        }
        dragRef.current.lx = e.clientX;
        dragRef.current.ly = e.clientY;
        return;
      }

      // Hover detection
      raycaster.setFromCamera(pointer, camera);
      const meshes: THREE.Mesh[] = [
        ...Array.from(nodeMeshRef.current.values()),
        ...Array.from(centroidMeshRef.current.values()),
      ];
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        const m = hits[0].object as THREE.Mesh;
        const ud = (m.userData || {}) as any;
        setHover({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          label: ud.label || 'unknown',
          sub: ud.sub || '',
          color: ud.color || '#22d3ee',
        });
      } else {
        setHover(null);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRotRef.current.dist = Math.max(20, Math.min(220, cameraRotRef.current.dist + e.deltaY * 0.06));
    };
    const onCtx = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', onCtx);

    const onResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const W = containerRef.current.clientWidth;
      const H = containerRef.current.clientHeight;
      cameraRef.current.aspect = W / H;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      animFrame.current = requestAnimationFrame(animate);
      const r = cameraRotRef.current;
      const tgt = panRef.current;
      camera.position.x = tgt.x + r.dist * Math.sin(r.phi) * Math.cos(r.theta);
      camera.position.y = tgt.y + r.dist * Math.cos(r.phi);
      camera.position.z = tgt.z + r.dist * Math.sin(r.phi) * Math.sin(r.theta);
      camera.lookAt(tgt.x, tgt.y, tgt.z);

      // Pulse malicious nodes
      const t = performance.now() * 0.002;
      nodeMeshRef.current.forEach((m) => {
        const ud = m.userData as any;
        if (ud.malicious) {
          const s = 1 + Math.sin(t + ud.seed) * 0.18;
          m.scale.setScalar(s);
        }
      });
      centroidMeshRef.current.forEach((m, _id) => {
        const ud = m.userData as any;
        m.rotation.y += 0.01;
        const s = 1 + Math.sin(t * 1.5 + ud.seed) * 0.08;
        m.scale.setScalar(s);
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mouseup', onUp);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onCtx);
      renderer.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
    };
  }, []);

  // Render centroids (vector / fusion modes)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    centroidMeshRef.current.forEach(m => { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    centroidMeshRef.current.clear();
    if (!showCentroids || mode === 'raw') return;

    centroids.forEach((c, i) => {
      if (actorFilter !== 'all' && c.actor_class !== actorFilter) return;
      const a = (i / centroids.length) * Math.PI * 2;
      const r = 38;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = (c.severity === 'critical' ? 18 : 12) + Math.sin(i) * 4;
      const geom = new THREE.IcosahedronGeometry(2.4, 1);
      const col = new THREE.Color(c.color || '#ef4444');
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.7,
        metalness: 0.5, roughness: 0.25, transparent: true, opacity: 0.85,
        wireframe: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      mesh.userData = {
        label: c.name,
        sub: `${c.actor_class}${c.actor_country ? ' / ' + c.actor_country : ''} -- ${c.severity.toUpperCase()}`,
        color: c.color, seed: i, isCentroid: true,
      };
      scene.add(mesh);

      // Halo ring
      const ringGeom = new THREE.TorusGeometry(3.6, 0.08, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(mesh.position);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      mesh.userData.ring = ring;

      centroidMeshRef.current.set(c.id, mesh);
    });
  }, [centroids, mode, showCentroids, actorFilter]);

  // Inter-bad similarity edges
  useEffect(() => {
    const grp = interBadGroupRef.current;
    if (!grp) return;
    while (grp.children.length) {
      const c = grp.children[0] as THREE.Line;
      grp.remove(c);
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
    if (mode === 'raw' || !showCentroids) return;

    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const ci = centroids[i], cj = centroids[j];
        if (actorFilter !== 'all' && (ci.actor_class !== actorFilter || cj.actor_class !== actorFilter)) continue;
        const sim = cosine(ci.embedding, cj.embedding);
        if (sim < 0.84) continue;
        const mi = centroidMeshRef.current.get(ci.id);
        const mj = centroidMeshRef.current.get(cj.id);
        if (!mi || !mj) continue;
        const geom = new THREE.BufferGeometry().setFromPoints([mi.position.clone(), mj.position.clone()]);
        const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.25 + (sim - 0.84) * 3 });
        grp.add(new THREE.Line(geom, mat));
      }
    }
  }, [centroids, mode, showCentroids, actorFilter]);

  // Render nodes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const seenIds = new Set<string>();
    nodes.forEach((n) => {
      seenIds.add(n.id);
      let mesh = nodeMeshRef.current.get(n.id);
      const malicious = !n.is_benign;
      if (sweepBenign && !malicious) {
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); nodeMeshRef.current.delete(n.id); }
        return;
      }
      if (!mesh) {
        const geom = malicious ? new THREE.OctahedronGeometry(0.65, 0) : new THREE.SphereGeometry(0.32, 10, 10);
        let color = 0x22d3ee;
        if (malicious) {
          const c = centroids.find(x => x.id === n.best_centroid_id);
          color = c ? new THREE.Color(c.color).getHex() : 0xef4444;
        } else {
          color = 0x334155;
        }
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color,
          emissiveIntensity: malicious ? 0.85 : 0.15,
          metalness: 0.4, roughness: 0.4,
          transparent: true, opacity: malicious ? 0.95 : 0.55,
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.userData = {
          label: n.label,
          sub: malicious
            ? `${(centroids.find(c => c.id === n.best_centroid_id)?.name) || 'Unknown actor'}  sim ${(n.best_similarity * 100).toFixed(1)}%`
            : `benign / ${n.entity_type}`,
          color: malicious ? '#ef4444' : '#64748b',
          malicious, seed: Math.random() * 6.28,
        };
        scene.add(mesh);
        nodeMeshRef.current.set(n.id, mesh);
      }

      // Position by view mode
      if (mode === 'raw') {
        mesh.position.set(n.x, n.y, n.z);
      } else if (mode === 'vector') {
        const e = n.embedding;
        mesh.position.set((e[0] - 0.5) * 60, (e[2] - 0.5) * 40, (e[4] - 0.5) * 60);
      } else {
        // fusion: malicious gravitates toward best centroid
        if (malicious && n.best_centroid_id) {
          const cm = centroidMeshRef.current.get(n.best_centroid_id);
          if (cm) {
            const blend = Math.min(1, n.best_similarity);
            const tx = cm.position.x + (Math.random() - 0.5) * 6;
            const ty = cm.position.y + (Math.random() - 0.5) * 4;
            const tz = cm.position.z + (Math.random() - 0.5) * 6;
            mesh.position.set(n.x * (1 - blend) + tx * blend, n.y * (1 - blend) + ty * blend, n.z * (1 - blend) + tz * blend);
          } else {
            mesh.position.set(n.x, n.y, n.z);
          }
        } else {
          mesh.position.set(n.x, n.y, n.z);
        }
      }
    });

    // Cleanup removed
    nodeMeshRef.current.forEach((m, id) => {
      if (!seenIds.has(id)) {
        scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose();
        nodeMeshRef.current.delete(id);
      }
    });
  }, [nodes, mode, sweepBenign, centroids]);

  // Render edges (raw graph) and similarity links (vector/fusion)
  useEffect(() => {
    const eg = edgeGroupRef.current;
    const lg = linkGroupRef.current;
    if (!eg || !lg) return;

    while (eg.children.length) {
      const c = eg.children[0] as THREE.Line;
      eg.remove(c); c.geometry.dispose(); (c.material as THREE.Material).dispose();
    }
    while (lg.children.length) {
      const c = lg.children[0] as THREE.Line;
      lg.remove(c); c.geometry.dispose(); (c.material as THREE.Material).dispose();
    }

    if (mode !== 'vector') {
      const recent = edges.slice(-600);
      for (const e of recent) {
        const a = nodeMeshRef.current.get(e.source_id);
        const b = nodeMeshRef.current.get(e.target_id);
        if (!a || !b) continue;
        const isAttack = e.kind === 'attack-chain';
        const geom = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
        const mat = new THREE.LineBasicMaterial({
          color: isAttack ? 0xef4444 : 0x1e293b,
          transparent: true,
          opacity: isAttack ? 0.55 : 0.18,
        });
        eg.add(new THREE.Line(geom, mat));
      }
    }

    if (mode !== 'raw') {
      // Similarity links: malicious nodes -> their centroid (highest sim only)
      nodes.forEach((n) => {
        if (n.is_benign || !n.best_centroid_id) return;
        const a = nodeMeshRef.current.get(n.id);
        const b = centroidMeshRef.current.get(n.best_centroid_id);
        if (!a || !b) return;
        const geom = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
        const col = new THREE.Color((b.material as THREE.MeshStandardMaterial).color);
        const mat = new THREE.LineBasicMaterial({
          color: col, transparent: true,
          opacity: 0.15 + n.best_similarity * 0.55,
        });
        lg.add(new THREE.Line(geom, mat));
      });
    }
  }, [edges, nodes, mode]);

  const reset = useCallback(async () => {
    nodeMeshRef.current.forEach(m => { sceneRef.current?.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
    nodeMeshRef.current.clear();
    setNodes(new Map());
    setEdges([]);
    setHits([]);
    setTickIndex(0);
    const sid = await createSession(`ChronoWeave ${new Date().toLocaleTimeString()}`);
    setSessionId(sid);
  }, []);

  const topThreats = (() => {
    const counts: Record<string, { count: number; centroid: CWCentroid; topSim: number }> = {};
    hits.forEach(h => {
      const c = centroids.find(x => x.id === h.centroid_id);
      if (!c) return;
      if (!counts[c.id]) counts[c.id] = { count: 0, centroid: c, topSim: 0 };
      counts[c.id].count += 1;
      if (h.similarity > counts[c.id].topSim) counts[c.id].topSim = h.similarity;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
  })();

  return (
    <div className={`relative flex flex-col bg-[#05070d] border border-slate-800 rounded-xl overflow-hidden ${fullscreen ? 'fixed inset-2 z-50' : 'w-full h-[760px]'}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-[#070b15] to-[#0a1020]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-rose-500/20 border border-cyan-500/30 flex items-center justify-center relative">
            <Atom size={18} className="text-cyan-300" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">ChronoWeave</h3>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-mono text-cyan-300">REALTIME</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono text-emerald-300">COMPOUNDING</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Compounding threat graph fused with vector similarity to historical bad embeddings</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mode switch */}
          <div className="flex items-center bg-[#060912] border border-slate-800 rounded-lg p-0.5">
            {([
              { id: 'raw' as const, label: 'Raw graph', icon: Activity },
              { id: 'vector' as const, label: 'Vector space', icon: Sparkles },
              { id: 'fusion' as const, label: 'Fusion', icon: Atom },
            ]).map(o => {
              const Ico = o.icon;
              const active = mode === o.id;
              return (
                <button key={o.id} onClick={() => setMode(o.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${active
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                  <Ico size={11} />{o.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => setSweepBenign(s => !s)}
            title="Sweep benign nodes (kept by vector correlation)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${sweepBenign
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-[#060912] text-slate-400 border-slate-800 hover:text-slate-200'}`}>
            {sweepBenign ? <EyeOff size={11} /> : <Eye size={11} />}Sweep benign
          </button>
          <button onClick={() => setShowCentroids(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${showCentroids
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
              : 'bg-[#060912] text-slate-400 border-slate-800 hover:text-slate-200'}`}>
            <Target size={11} />Bad centroids
          </button>
          <button onClick={() => setRunning(r => !r)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#060912] text-slate-300 border border-slate-800 hover:bg-slate-800">
            {running ? <Pause size={11} /> : <Play size={11} />}{running ? 'Pause' : 'Resume'}
          </button>
          <button onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-[#060912] text-slate-300 border border-slate-800 hover:bg-slate-800">
            <RotateCcw size={11} />Reset
          </button>
          <button onClick={() => setFullscreen(f => !f)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25">
            {fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}{fullscreen ? 'Exit' : 'Maximize'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 grid grid-cols-[1fr_320px] min-h-0">
        {/* Canvas */}
        <div ref={containerRef} className="relative bg-[#05070d] cursor-grab active:cursor-grabbing">
          {hover && (
            <div className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg bg-slate-900/95 border border-cyan-500/40 backdrop-blur-sm shadow-2xl shadow-cyan-500/20"
              style={{ left: hover.x + 14, top: hover.y + 14, maxWidth: 280 }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: hover.color }} />
                <div className="text-[11px] font-bold text-white truncate">{hover.label}</div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-snug">{hover.sub}</div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] font-mono text-slate-500">
            <span className="px-2 py-1 rounded bg-slate-900/60 border border-slate-800">drag = orbit</span>
            <span className="px-2 py-1 rounded bg-slate-900/60 border border-slate-800">shift+drag = pan</span>
            <span className="px-2 py-1 rounded bg-slate-900/60 border border-slate-800">scroll = zoom</span>
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="text-[9px] text-slate-500 font-mono">TICK</div>
              <div className="text-sm font-bold text-cyan-300 font-mono">#{tickIndex.toString().padStart(4, '0')}</div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="text-[9px] text-slate-500 font-mono">NODES</div>
              <div className="text-sm font-bold text-white font-mono">{stats.total.toLocaleString()}</div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 backdrop-blur-sm">
              <div className="text-[9px] text-rose-300 font-mono">SUSPICIOUS</div>
              <div className="text-sm font-bold text-rose-200 font-mono">{stats.malicious.toLocaleString()}</div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm">
              <div className="text-[9px] text-amber-300 font-mono">SIM HITS</div>
              <div className="text-sm font-bold text-amber-200 font-mono">{stats.hits.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="border-l border-slate-800 bg-[#070b15] overflow-y-auto">
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Filter size={11} className="text-slate-400" />
              <div className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Actor filter</div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { id: 'all', label: 'All actors' },
                { id: 'state-sponsored', label: 'State-sponsored' },
                { id: 'criminal', label: 'Criminal' },
                { id: 'insider', label: 'Insider' },
                { id: 'supply-chain', label: 'Supply chain' },
              ].map(o => (
                <button key={o.id} onClick={() => setActorFilter(o.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-semibold transition-colors ${actorFilter === o.id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={11} className="text-rose-400" />
              <div className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Top threat clusters</div>
            </div>
            {topThreats.length === 0 && (
              <div className="text-[10px] text-slate-600 italic">Waiting for first similarity hit...</div>
            )}
            <div className="space-y-1.5">
              {topThreats.map(t => (
                <div key={t.centroid.id} className="px-2 py-1.5 rounded bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.centroid.color }} />
                    <div className="text-[10px] font-bold text-white truncate flex-1">{t.centroid.name}</div>
                    <div className="text-[9px] font-mono text-rose-300">{t.count}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-[9px] text-slate-500 truncate">{t.centroid.actor_class} {t.centroid.actor_country && `/ ${t.centroid.actor_country}`}</div>
                    <div className="text-[9px] font-mono text-amber-300">sim {(t.topSim * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Globe2 size={11} className="text-emerald-400" />
              <div className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Bad centroid library</div>
              <span className="ml-auto text-[9px] font-mono text-slate-500">{centroids.length}</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {centroids
                .filter(c => actorFilter === 'all' || c.actor_class === actorFilter)
                .map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-900">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <div className="text-[10px] text-slate-300 truncate flex-1">{c.name}</div>
                    <div className="text-[8px] font-mono text-slate-600 uppercase">{c.actor_country || '—'}</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={11} className="text-amber-400" />
              <div className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">How to read this</div>
            </div>
            <div className="space-y-1.5 text-[10px] text-slate-400 leading-relaxed">
              <div><b className="text-cyan-300">Raw graph</b> -- live event nodes connected as they arrive in time.</div>
              <div><b className="text-cyan-300">Vector space</b> -- nodes positioned by their 8-D embedding; clusters reveal hidden similarity.</div>
              <div><b className="text-cyan-300">Fusion</b> -- malicious events are pulled toward their best-matching historical actor centroid.</div>
              <div><b className="text-amber-300">Sweep benign</b> -- hides confirmed-benign nodes; correlation pipeline keeps them indexed for retroactive vector hits.</div>
              <div><b className="text-rose-300">Yellow lines</b> between centroids = inter-actor TTP overlap above 0.84 cosine.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
