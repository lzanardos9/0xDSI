import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Activity, Atom, Maximize2, Minimize2, Pause, Play, RotateCcw, Sparkles, Eye, EyeOff, Filter, Target, Globe as Globe2, ShieldAlert, Zap } from 'lucide-react';
import {
  CWCentroid, CWEdge, CWHit, CWNode,
  cosine, createSession, loadCentroids, tickSession, maybeSpawnCentroid,
} from '../lib/chronoweave';

type ViewMode = 'raw' | 'vector' | 'fusion';

interface HoverInfo { x: number; y: number; label: string; sub: string; color: string; }

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xef4444, high: 0xf97316, medium: 0xf59e0b, low: 0x22d3ee,
};

// Radial glow sprite texture (cached)
let _glowTex: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// Hex-grid ring texture for centroid halos (scanline feel)
let _ringTex: THREE.Texture | null = null;
function getRingTexture(): THREE.Texture {
  if (_ringTex) return _ringTex;
  const w = 256, h = 32;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // tick marks
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 32; i++) {
    if (i % 2 === 0) ctx.fillRect((i / 32) * w, 0, 2, h);
  }
  _ringTex = new THREE.CanvasTexture(c);
  _ringTex.wrapS = THREE.RepeatWrapping;
  _ringTex.colorSpace = THREE.SRGBColorSpace;
  return _ringTex;
}

function makeGlowSprite(colorHex: number, scale: number, opacity = 0.9): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: colorHex,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

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
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [tacticFilter, setTacticFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<string>('all');

  const passesFilters = (c: CWCentroid): boolean => {
    if (actorFilter !== 'all' && c.actor_class !== actorFilter) return false;
    if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
    if (regionFilter !== 'all') {
      const country = (c.actor_country || '').toUpperCase();
      const REGIONS: Record<string, string[]> = {
        americas: ['US', 'CA', 'MX', 'BR', 'AR'],
        emea: ['BY', 'RU', 'IR', 'IL', 'SA', 'AE', 'GB', 'DE', 'FR', 'TR'],
        apac: ['CN', 'KP', 'JP', 'IN', 'KR', 'VN', 'TH', 'AU'],
        unattributed: [''],
      };
      const list = REGIONS[regionFilter] || [];
      if (regionFilter === 'unattributed') {
        if (country !== '') return false;
      } else if (!list.includes(country)) return false;
    }
    if (tacticFilter !== 'all') {
      const tactics = (c.mitre_tactics || []).map(x => x.toLowerCase());
      if (!tactics.includes(tacticFilter)) return false;
    }
    if (activityFilter !== 'all') {
      const lastHit = recentHitsRef.current.get(c.id) || 0;
      const ageMs = Date.now() - lastHit;
      if (activityFilter === 'active' && (!lastHit || ageMs > 8000)) return false;
      if (activityFilter === 'dormant' && lastHit && ageMs <= 8000) return false;
    }
    return true;
  };
  const [stats, setStats] = useState({ total: 0, malicious: 0, hits: 0, topCentroid: '' });
  const [emergeFlash, setEmergeFlash] = useState<CWCentroid | null>(null);
  const pendingCentroidsRef = useRef<CWCentroid[]>([]);
  const recentHitsRef = useRef<Map<string, number>>(new Map());
  const [focusCentroid, setFocusCentroid] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);

  // Initialize session + centroids
  useEffect(() => {
    let mounted = true;
    (async () => {
      const cs = await loadCentroids();
      if (!mounted) return;
      // Reveal only a small starter set; the rest will emerge over time
      const shuffled = [...cs].sort(() => Math.random() - 0.5);
      const initial = shuffled.slice(0, 3);
      const queued = shuffled.slice(3);
      pendingCentroidsRef.current = queued;
      setCentroids(initial);
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
        const recent = Array.from(nodes.values()).slice(-30);
        const { nodes: newNodes, edges: newEdges, hits: newHits } = await tickSession(
          sessionId, centroids, recent, tickIndex, 3,
        );
        if (cancelled) return;
        setNodes(prev => {
          const next = new Map(prev);
          for (const n of newNodes) next.set(n.id, n);
          // cap total nodes for visual clarity
          if (next.size > 400) {
            const arr = Array.from(next.entries());
            arr.sort((a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime());
            const trimmed = arr.slice(-400);
            return new Map(trimmed);
          }
          return next;
        });
        setEdges(prev => [...prev, ...newEdges].slice(-800));
        setHits(prev => {
          const merged = [...prev, ...newHits].slice(-600);
          // Track recent activations (used to drive glow)
          const now = Date.now();
          for (const h of newHits) recentHitsRef.current.set(h.centroid_id, now);
          return merged;
        });
        setTickIndex(t => t + 1);

        // Slow drip: emerge a new threat actor every ~6 ticks, only one at a time
        if (tickIndex > 4 && Math.random() < 0.16 && pendingCentroidsRef.current.length) {
          const next = pendingCentroidsRef.current.shift();
          if (next && !cancelled) {
            setCentroids(prev => [...prev, next]);
            setEmergeFlash(next);
            setTimeout(() => setEmergeFlash(null), 5500);
          }
        } else if (tickIndex > 8 && pendingCentroidsRef.current.length === 0 && Math.random() < 0.06) {
          // Once seeded pool exhausted, occasionally spawn a brand-new one from code pool
          const spawned = await maybeSpawnCentroid(centroids);
          if (spawned && !cancelled) {
            setCentroids(prev => [...prev, spawned]);
            setEmergeFlash(spawned);
            setTimeout(() => setEmergeFlash(null), 5500);
          }
        }
      } catch (e) {
        console.error('tick failed', e);
      }
      timer = setTimeout(loop, 5000);
    };
    timer = setTimeout(loop, 800);
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

    scene.add(new THREE.AmbientLight(0x4060a0, 0.45));
    const key = new THREE.PointLight(0x22d3ee, 1.4, 240);
    key.position.set(25, 50, 35); scene.add(key);
    const rim = new THREE.PointLight(0xff2a6d, 1.0, 240);
    rim.position.set(-35, 22, -28); scene.add(rim);
    const fill = new THREE.PointLight(0x05d9ff, 0.7, 220);
    fill.position.set(0, -20, 0); scene.add(fill);

    // Hex/cyber grid floor (two layers)
    const gridA = new THREE.GridHelper(180, 36, 0x00f0ff, 0x0a1a2a);
    (gridA.material as THREE.Material).transparent = true;
    (gridA.material as any).opacity = 0.22;
    gridA.position.y = -22;
    scene.add(gridA);
    const gridB = new THREE.GridHelper(180, 12, 0x00f0ff, 0x0a1a2a);
    (gridB.material as THREE.Material).transparent = true;
    (gridB.material as any).opacity = 0.12;
    gridB.position.y = -22.05;
    scene.add(gridB);

    // Glowing horizon ring
    const horizonGeom = new THREE.RingGeometry(78, 86, 96, 1);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const horizon = new THREE.Mesh(horizonGeom, horizonMat);
    horizon.rotation.x = -Math.PI / 2;
    horizon.position.y = -21.9;
    scene.add(horizon);

    // Layered starfield (depth + color variance)
    for (const layer of [
      { count: 600, color: 0x1e3a5f, size: 0.5, range: 700 },
      { count: 400, color: 0x06b6d4, size: 0.4, range: 500 },
      { count: 220, color: 0xf472b6, size: 0.6, range: 400 },
    ]) {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(layer.count * 3);
      for (let i = 0; i < layer.count; i++) {
        p[i * 3] = (Math.random() - 0.5) * layer.range;
        p[i * 3 + 1] = (Math.random() - 0.5) * layer.range;
        p[i * 3 + 2] = (Math.random() - 0.5) * layer.range;
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({
        color: layer.color, size: layer.size,
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }

    const eg = new THREE.Group(); scene.add(eg); edgeGroupRef.current = eg;
    const lg = new THREE.Group(); scene.add(lg); linkGroupRef.current = lg;
    const ibg = new THREE.Group(); scene.add(ibg); interBadGroupRef.current = ibg;

    // Pointer
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const downStartRef = { x: 0, y: 0, t: 0 };
    const onDown = (e: MouseEvent) => {
      dragRef.current = { down: true, lx: e.clientX, ly: e.clientY, btn: e.button };
      downStartRef.x = e.clientX;
      downStartRef.y = e.clientY;
      downStartRef.t = performance.now();
    };
    const onUp = (e: MouseEvent) => {
      const wasClick =
        Math.abs(e.clientX - downStartRef.x) < 4 &&
        Math.abs(e.clientY - downStartRef.y) < 4 &&
        performance.now() - downStartRef.t < 350;
      dragRef.current.down = false;
      if (!wasClick) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const cmeshes = Array.from(centroidMeshRef.current.values());
      const hit = raycaster.intersectObjects(cmeshes, false)[0];
      if (hit) {
        const m = hit.object as THREE.Mesh;
        let cid: string | null = null;
        centroidMeshRef.current.forEach((mesh, id) => { if (mesh === m) cid = id; });
        if (cid) {
          focusRef.current = focusRef.current === cid ? null : cid;
          setFocusCentroid(focusRef.current);
        }
      } else {
        // click on empty space clears focus
        if (focusRef.current) {
          focusRef.current = null;
          setFocusCentroid(null);
        }
      }
    };
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

      const t = performance.now() * 0.001;

      // Slowly drift the floor grid
      gridA.position.x = Math.sin(t * 0.1) * 4;
      gridB.position.x = -Math.cos(t * 0.07) * 4;
      horizon.rotation.z = t * 0.05;
      (horizon.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 0.6) * 0.08;

      // Pulse nodes (different cadence for malicious vs benign)
      nodeMeshRef.current.forEach((m) => {
        const ud = m.userData as any;
        if (ud.malicious) {
          const s = 1 + Math.sin(t * 2.5 + ud.seed) * 0.28;
          m.scale.setScalar(s);
          m.rotation.x += 0.018;
          m.rotation.y += 0.022;
          if (ud.glow) {
            const g = 0.85 + Math.sin(t * 3 + ud.seed) * 0.15;
            (ud.glow.material as THREE.SpriteMaterial).opacity = g;
          }
        } else {
          m.rotation.y += 0.005;
        }
      });

      // Centroid orchestration - dim baseline, glow strongly on activation
      const now = Date.now();
      centroidMeshRef.current.forEach((mesh, cid) => {
        const ud = mesh.userData as any;
        // activation = how recently this centroid had a similarity hit (0..1)
        const lastHit = recentHitsRef.current.get(cid) || 0;
        const ageMs = now - lastHit;
        const activation = lastHit ? Math.max(0, 1 - ageMs / 6000) : 0;
        // baseline slow rotation; faster when active
        const rotSpeed = 0.003 + activation * 0.02;
        mesh.rotation.x += rotSpeed * 0.5;
        mesh.rotation.y += rotSpeed;
        const s = 1 + (0.04 + activation * 0.18) * Math.sin(t * (1 + activation * 2) + ud.seed);
        mesh.scale.setScalar(s);

        // Core glow ramps with activation
        const coreMat = mesh.material as THREE.MeshStandardMaterial;
        coreMat.emissiveIntensity = 0.18 + activation * 1.6;
        coreMat.opacity = 0.85 + activation * 0.13;

        const ctr: THREE.Vector3 = ud.center;
        if (ud.wire) {
          ud.wire.rotation.y -= 0.003 + activation * 0.012;
          ud.wire.rotation.x -= 0.002 + activation * 0.008;
          (ud.wire.material as THREE.MeshBasicMaterial).opacity = 0.18 + activation * 0.5;
        }
        if (ud.ring) {
          ud.ring.rotation.z += 0.004 + activation * 0.018;
          (ud.ring.material as THREE.MeshBasicMaterial).opacity = 0.22 + activation * 0.7;
          if ((ud.ring.material as THREE.MeshBasicMaterial).map) {
            (ud.ring.material as THREE.MeshBasicMaterial).map!.offset.x = (t * (0.15 + activation * 0.6)) % 1;
          }
        }
        if (ud.ring2) {
          ud.ring2.rotation.x += 0.003 + activation * 0.014;
          ud.ring2.rotation.y += 0.002 + activation * 0.01;
          (ud.ring2.material as THREE.MeshBasicMaterial).opacity = 0.18 + activation * 0.55;
        }
        // Electrons only orbit visibly when active
        if (ud.electron1 && ud.electron2 && ctr) {
          const oa = t * 1.6 + ud.seed;
          const ob = -t * 2.0 + ud.seed * 1.7;
          const orad1 = 4.4, orad2 = 5.8;
          ud.electron1.position.set(
            ctr.x + Math.cos(oa) * orad1,
            ctr.y + Math.sin(oa * 1.3) * 1.5,
            ctr.z + Math.sin(oa) * orad1,
          );
          ud.electron2.position.set(
            ctr.x + Math.cos(ob) * orad2,
            ctr.y + Math.cos(ob * 0.9) * 1.8,
            ctr.z + Math.sin(ob) * orad2,
          );
          ud.electron1.visible = activation > 0.05;
          ud.electron2.visible = activation > 0.05;
        }
        // Beam: dim baseline, strong pulse on activation
        if (ud.beam) {
          (ud.beam.material as THREE.MeshBasicMaterial).opacity = 0.04 + activation * (0.25 + Math.sin(t * 4 + ud.seed) * 0.12);
        }
        // Halos
        if (ud.glow) {
          (ud.glow.material as THREE.SpriteMaterial).opacity = 0.12 + activation * (0.85 + Math.sin(t * 3 + ud.seed) * 0.15);
          ud.glow.scale.setScalar(8 + activation * 12);
        }
        if (ud.glowOuter) {
          (ud.glowOuter.material as THREE.SpriteMaterial).opacity = 0.05 + activation * 0.45;
          ud.glowOuter.scale.setScalar(16 + activation * 18);
        }
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
    centroidMeshRef.current.forEach(m => {
      const ud = m.userData as any;
      [m, ud.glow, ud.glowOuter, ud.ring, ud.ring2, ud.wire, ud.electron1, ud.electron2, ud.beam].forEach((o: any) => {
        if (!o) return;
        scene.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((mm: THREE.Material) => mm.dispose());
          else (o.material as THREE.Material).dispose();
        }
      });
    });
    centroidMeshRef.current.clear();
    if (!showCentroids || mode === 'raw') return;

    centroids.forEach((c, i) => {
      if (!passesFilters(c)) return;
      const a = (i / centroids.length) * Math.PI * 2;
      const r = 42;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = (c.severity === 'critical' ? 16 : 10) + Math.sin(i * 1.7) * 5;
      const col = new THREE.Color(c.color || '#ef4444');
      const colHex = col.getHex();

      // Core: faceted gem-like orb (starts dim/raw, glows when activated)
      const geom = new THREE.IcosahedronGeometry(2.0, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.18,
        metalness: 0.85, roughness: 0.45,
        transparent: true, opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, y, z);
      scene.add(mesh);

      // Wireframe shell (dim by default)
      const wireGeom = new THREE.IcosahedronGeometry(2.6, 1);
      const wireMat = new THREE.MeshBasicMaterial({
        color: col, wireframe: true, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const wire = new THREE.Mesh(wireGeom, wireMat);
      wire.position.copy(mesh.position);
      scene.add(wire);

      // Glow sprites (inner + outer halo) - dormant by default
      const glow = makeGlowSprite(colHex, 8, 0.12);
      glow.position.copy(mesh.position);
      scene.add(glow);
      const glowOuter = makeGlowSprite(colHex, 16, 0.05);
      glowOuter.position.copy(mesh.position);
      scene.add(glowOuter);

      // Scanline rings (textured)
      const ringGeom = new THREE.TorusGeometry(4.2, 0.18, 12, 96);
      const tex = getRingTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(6, 1);
      const ringMat = new THREE.MeshBasicMaterial({
        map: tex, color: col, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(mesh.position);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      const ring2Geom = new THREE.TorusGeometry(5.6, 0.06, 8, 96);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
      ring2.position.copy(mesh.position);
      ring2.rotation.x = Math.PI / 2.4;
      ring2.rotation.z = Math.PI / 5;
      scene.add(ring2);

      // Orbiting electrons
      const eGeom = new THREE.SphereGeometry(0.22, 12, 12);
      const eMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const electron1 = new THREE.Mesh(eGeom, eMat);
      const electron2 = new THREE.Mesh(eGeom.clone(), eMat.clone());
      scene.add(electron1); scene.add(electron2);
      const eGlow1 = makeGlowSprite(colHex, 1.6, 0.95);
      const eGlow2 = makeGlowSprite(colHex, 1.6, 0.95);
      electron1.add(eGlow1); electron2.add(eGlow2);

      // Vertical light beam down to floor (critical only)
      let beam: THREE.Mesh | null = null;
      if (c.severity === 'critical') {
        const bGeom = new THREE.CylinderGeometry(0.12, 1.4, Math.abs(y - (-22)), 16, 1, true);
        const bMat = new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.18,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        beam = new THREE.Mesh(bGeom, bMat);
        beam.position.set(x, (y + (-22)) / 2, z);
        scene.add(beam);
      }

      mesh.userData = {
        label: c.name,
        sub: `${c.actor_class}${c.actor_country ? ' / ' + c.actor_country : ''} -- ${c.severity.toUpperCase()}`,
        color: c.color, seed: i, isCentroid: true,
        glow, glowOuter, ring, ring2, wire, electron1, electron2, beam,
        center: mesh.position.clone(),
      };
      centroidMeshRef.current.set(c.id, mesh);
    });
  }, [centroids, mode, showCentroids, actorFilter, regionFilter, severityFilter, tacticFilter, activityFilter]);

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
        if (!passesFilters(ci) || !passesFilters(cj)) continue;
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
  }, [centroids, mode, showCentroids, actorFilter, regionFilter, severityFilter, tacticFilter, activityFilter]);

  // Render nodes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const seenIds = new Set<string>();
    const disposeNode = (mesh: THREE.Mesh) => {
      const ud = mesh.userData as any;
      [mesh, ud.glow].forEach((o: any) => {
        if (!o) return;
        scene.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material) (o.material as THREE.Material).dispose();
      });
    };
    nodes.forEach((n) => {
      seenIds.add(n.id);
      let mesh = nodeMeshRef.current.get(n.id);
      const malicious = !n.is_benign;
      if (sweepBenign && !malicious) {
        if (mesh) { disposeNode(mesh); nodeMeshRef.current.delete(n.id); }
        return;
      }
      if (!mesh) {
        let color = 0x22d3ee;
        if (malicious) {
          const c = centroids.find(x => x.id === n.best_centroid_id);
          color = c ? new THREE.Color(c.color).getHex() : 0xef4444;
        } else {
          color = 0x06b6d4;
        }

        // Core: tiny faceted gem (octa for malicious, dodeca for benign)
        const geom = malicious
          ? new THREE.OctahedronGeometry(0.55, 0)
          : new THREE.DodecahedronGeometry(0.28, 0);
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color,
          emissiveIntensity: malicious ? 1.6 : 0.6,
          metalness: 0.7, roughness: 0.25,
          transparent: true, opacity: 0.95,
        });
        mesh = new THREE.Mesh(geom, mat);

        // Glow halo sprite (this is what makes it pop)
        const glow = makeGlowSprite(color, malicious ? 4.2 : 1.6, malicious ? 0.95 : 0.45);
        mesh.add(glow);

        mesh.userData = {
          label: n.label,
          sub: malicious
            ? `${(centroids.find(c => c.id === n.best_centroid_id)?.name) || 'Unknown actor'}  sim ${(n.best_similarity * 100).toFixed(1)}%`
            : `benign / ${n.entity_type}`,
          color: malicious ? '#ef4444' : '#06b6d4',
          malicious, seed: Math.random() * 6.28, glow, baseColor: color,
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

  // Apply focus highlight: dim non-related nodes/centroids when a centroid is focused
  useEffect(() => {
    nodes.forEach((n) => {
      const m = nodeMeshRef.current.get(n.id);
      if (!m) return;
      const ud = m.userData as any;
      const mat = m.material as THREE.MeshStandardMaterial;
      const glowMat = ud.glow ? (ud.glow.material as THREE.SpriteMaterial) : null;
      const malicious = !n.is_benign;
      if (!focusCentroid) {
        mat.opacity = malicious ? 0.95 : 0.75;
        mat.emissiveIntensity = malicious ? 1.6 : 0.6;
        if (glowMat) glowMat.opacity = malicious ? 0.95 : 0.45;
        m.visible = true;
        return;
      }
      const isRelated = malicious && n.best_centroid_id === focusCentroid;
      if (isRelated) {
        mat.opacity = 1;
        mat.emissiveIntensity = 2.4;
        if (glowMat) glowMat.opacity = 1;
        m.visible = true;
      } else {
        mat.opacity = 0.05;
        mat.emissiveIntensity = 0.05;
        if (glowMat) glowMat.opacity = 0.02;
        m.visible = malicious;
      }
    });
    centroidMeshRef.current.forEach((m, cid) => {
      const dim = focusCentroid !== null && cid !== focusCentroid;
      const ud = m.userData as any;
      (m.material as THREE.MeshStandardMaterial).opacity = dim ? 0.15 : 0.95;
      [ud.wire, ud.ring, ud.ring2, ud.beam, ud.glow, ud.glowOuter, ud.electron1, ud.electron2].forEach((o: any) => {
        if (!o || !o.material) return;
        if (dim) {
          (o.material as any).opacity = (o.material as any).opacity * 0.1;
          o.visible = false;
        } else {
          o.visible = true;
        }
      });
    });
  }, [focusCentroid, nodes]);

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
        // when focused, only show edges that touch a related (focused-centroid) malicious node
        if (focusCentroid) {
          const ns = nodes.get(e.source_id);
          const nt = nodes.get(e.target_id);
          const sRel = ns && !ns.is_benign && ns.best_centroid_id === focusCentroid;
          const tRel = nt && !nt.is_benign && nt.best_centroid_id === focusCentroid;
          if (!sRel && !tRel) continue;
        }
        const geom = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
        const mat = new THREE.LineBasicMaterial({
          color: isAttack ? 0xff2a6d : 0x06b6d4,
          transparent: true,
          opacity: isAttack ? 0.85 : 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        eg.add(new THREE.Line(geom, mat));
      }
    }

    if (mode !== 'raw') {
      nodes.forEach((n) => {
        if (n.is_benign || !n.best_centroid_id) return;
        if (focusCentroid && n.best_centroid_id !== focusCentroid) return;
        const a = nodeMeshRef.current.get(n.id);
        const b = centroidMeshRef.current.get(n.best_centroid_id);
        if (!a || !b) return;
        const geom = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
        const col = new THREE.Color((b.material as THREE.MeshStandardMaterial).color);
        const mat = new THREE.LineBasicMaterial({
          color: col, transparent: true,
          opacity: focusCentroid ? Math.min(1, 0.45 + n.best_similarity * 0.55) : 0.25 + n.best_similarity * 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        lg.add(new THREE.Line(geom, mat));
      });
    }
  }, [edges, nodes, mode, focusCentroid]);

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
          {focusCentroid && (() => {
            const c = centroids.find(x => x.id === focusCentroid);
            if (!c) return null;
            const related = Array.from(nodes.values()).filter(n => !n.is_benign && n.best_centroid_id === focusCentroid).length;
            return (
              <div className="absolute top-3 right-3 z-30 px-4 py-2.5 rounded-xl bg-slate-900/90 border-2 backdrop-blur-md shadow-2xl"
                style={{ borderColor: c.color, boxShadow: `0 0 30px ${c.color}55` }}>
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
                  <div className="flex flex-col">
                    <div className="text-[9px] font-mono font-bold tracking-[0.2em]" style={{ color: c.color }}>FOCUSED THREAT</div>
                    <div className="text-[12px] font-bold text-white">{c.name}</div>
                    <div className="text-[10px] text-slate-400">{related} related events highlighted</div>
                  </div>
                  <button
                    onClick={() => { focusRef.current = null; setFocusCentroid(null); }}
                    className="ml-2 px-2 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                    Clear
                  </button>
                </div>
              </div>
            );
          })()}
          {emergeFlash && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-xl bg-slate-900/90 border-2 backdrop-blur-md shadow-2xl animate-pulse"
              style={{ borderColor: emergeFlash.color, boxShadow: `0 0 40px ${emergeFlash.color}55, inset 0 0 20px ${emergeFlash.color}22` }}>
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full animate-ping" style={{ background: emergeFlash.color }} />
                <div className="absolute w-2.5 h-2.5 rounded-full" style={{ background: emergeFlash.color, marginLeft: 0 }} />
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold tracking-[0.2em]" style={{ color: emergeFlash.color }}>NEW THREAT EMERGED</span>
                    <span className="text-[9px] font-mono text-slate-500">tick #{tickIndex.toString().padStart(4, '0')}</span>
                  </div>
                  <div className="text-[12px] font-bold text-white mt-0.5">{emergeFlash.name}</div>
                  <div className="text-[10px] text-slate-400">{emergeFlash.actor_class}{emergeFlash.actor_country && ` / ${emergeFlash.actor_country}`} -- {emergeFlash.severity.toUpperCase()}</div>
                </div>
              </div>
            </div>
          )}
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
            <span className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">click centroid = focus</span>
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
            <div className="px-3 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 backdrop-blur-sm">
              <div className="text-[9px] text-fuchsia-300 font-mono">THREAT ACTORS</div>
              <div className="text-sm font-bold text-fuchsia-200 font-mono">{centroids.length}</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="border-l border-slate-800 bg-[#070b15] overflow-y-auto">
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Filter size={11} className="text-slate-400" />
                <div className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Filters</div>
              </div>
              {(actorFilter !== 'all' || regionFilter !== 'all' || severityFilter !== 'all' || tacticFilter !== 'all' || activityFilter !== 'all') && (
                <button
                  onClick={() => { setActorFilter('all'); setRegionFilter('all'); setSeverityFilter('all'); setTacticFilter('all'); setActivityFilter('all'); }}
                  className="text-[9px] font-mono text-cyan-400 hover:text-cyan-200 underline">
                  reset all
                </button>
              )}
            </div>

            <div className="text-[9px] font-mono text-slate-500 mb-1">ACTOR CLASS</div>
            <div className="grid grid-cols-2 gap-1 mb-3">
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

            <div className="text-[9px] font-mono text-slate-500 mb-1">REGION</div>
            <div className="grid grid-cols-2 gap-1 mb-3">
              {[
                { id: 'all', label: 'Worldwide' },
                { id: 'americas', label: 'Americas' },
                { id: 'emea', label: 'EMEA' },
                { id: 'apac', label: 'APAC' },
                { id: 'unattributed', label: 'Unattributed' },
              ].map(o => (
                <button key={o.id} onClick={() => setRegionFilter(o.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-semibold transition-colors ${regionFilter === o.id
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="text-[9px] font-mono text-slate-500 mb-1">SEVERITY</div>
            <div className="grid grid-cols-4 gap-1 mb-3">
              {[
                { id: 'all', label: 'Any' },
                { id: 'critical', label: 'Crit' },
                { id: 'high', label: 'High' },
                { id: 'medium', label: 'Med' },
              ].map(o => (
                <button key={o.id} onClick={() => setSeverityFilter(o.id)}
                  className={`px-1.5 py-1.5 rounded text-[10px] font-semibold transition-colors ${severityFilter === o.id
                    ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="text-[9px] font-mono text-slate-500 mb-1">MITRE TACTIC</div>
            <div className="grid grid-cols-2 gap-1 mb-3">
              {[
                { id: 'all', label: 'Any tactic' },
                { id: 'initial-access', label: 'Initial access' },
                { id: 'persistence', label: 'Persistence' },
                { id: 'credential-access', label: 'Credential' },
                { id: 'lateral-movement', label: 'Lateral move' },
                { id: 'collection', label: 'Collection' },
                { id: 'exfiltration', label: 'Exfiltration' },
                { id: 'command-and-control', label: 'C2' },
                { id: 'impact', label: 'Impact' },
                { id: 'defense-evasion', label: 'Evasion' },
                { id: 'execution', label: 'Execution' },
                { id: 'ml-model-tampering', label: 'ML tamper' },
              ].map(o => (
                <button key={o.id} onClick={() => setTacticFilter(o.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-semibold transition-colors ${tacticFilter === o.id
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'}`}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="text-[9px] font-mono text-slate-500 mb-1">ACTIVITY</div>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'all', label: 'Any' },
                { id: 'active', label: 'Active' },
                { id: 'dormant', label: 'Dormant' },
              ].map(o => (
                <button key={o.id} onClick={() => setActivityFilter(o.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-semibold transition-colors ${activityFilter === o.id
                    ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40'
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
                .filter(passesFilters)
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
