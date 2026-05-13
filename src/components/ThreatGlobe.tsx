import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Swords, Megaphone, AlertOctagon, Flame, Activity, Briefcase, Landmark, Banknote, ShieldAlert, RefreshCw, X, Globe as Globe2, Radar, Link2, Target } from 'lucide-react';
import {
  createEarthTexture, latLonToVector3, createArcCurve, findNearestCity,
  SEVERITY_COLORS, ATTACK_TYPES, ATMOSPHERE_VS, ATMOSPHERE_INNER_FS,
  ATMOSPHERE_OUTER_FS, GLOBE_RADIUS, KNOWN_CITIES,
} from '../lib/globeGeometry';
import {
  fetchGeopoliticalEvents, fetchExposureZones, fetchCyberGeoCorrelations, refreshFeeds, categoryMeta,
  type GeopoliticalEvent, type ExposureZone, type CyberGeoCorrelation,
} from '../lib/geopoliticalRisk';

interface ThreatData {
  source: { lat: number; lon: number };
  target: { lat: number; lon: number };
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ActiveArc {
  line: THREE.Line;
  head: THREE.Mesh;
  sourceRing: THREE.Mesh;
  targetRing: THREE.Mesh | null;
  curve: THREE.CubicBezierCurve3;
  progress: number;
  speed: number;
  severity: string;
  totalPoints: number;
  feedItem: FeedItem;
}

interface FeedItem {
  id: number;
  type: string;
  severity: string;
  source: string;
  target: string;
  time: number;
}

interface RiskMarker {
  group: THREE.Group;
  pulse: THREE.Mesh;
  core: THREE.Mesh;
  event: GeopoliticalEvent;
}

type Mode = 'cyber' | 'geopolitical' | 'correlated';

interface CorrelationVisual {
  correlation: CyberGeoCorrelation;
  line: THREE.Line;
  sourceMarker: THREE.Mesh;
  targetMarker: THREE.Mesh;
  pulseRing: THREE.Mesh;
  flowParticle: THREE.Mesh;
  curve: THREE.CubicBezierCurve3;
}

const CATEGORY_ICONS: Record<string, typeof Swords> = {
  armed_conflict: Swords,
  civil_unrest: Flame,
  protest: Megaphone,
  strike: Briefcase,
  sanctions: AlertOctagon,
  political: Landmark,
  natural_disaster: Activity,
  seismic: Activity,
  wildfire: Flame,
  cyber_state: ShieldAlert,
  financial_risk: Banknote,
};

const ThreatGlobe = ({ threats }: { threats: ThreatData[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const threatsRef = useRef(threats);
  const autoRotateRef = useRef(true);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [mode, setMode] = useState<Mode>('cyber');
  const modeRef = useRef<Mode>('cyber');
  const [attackFeed, setAttackFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, critical: 0 });
  const feedIdRef = useRef(0);
  const totalRef = useRef(0);
  const criticalRef = useRef(0);

  const [geoEvents, setGeoEvents] = useState<GeopoliticalEvent[]>([]);
  const [zones, setZones] = useState<ExposureZone[]>([]);
  const [correlations, setCorrelations] = useState<CyberGeoCorrelation[]>([]);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<GeopoliticalEvent | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [hoveredCorrelation, setHoveredCorrelation] = useState<CyberGeoCorrelation | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedCorrelation, setSelectedCorrelation] = useState<CyberGeoCorrelation | null>(null);

  const geoLayerRef = useRef<THREE.Group | null>(null);
  const zonesLayerRef = useRef<THREE.Group | null>(null);
  const correlationLayerRef = useRef<THREE.Group | null>(null);
  const correlationVisualsRef = useRef<CorrelationVisual[]>([]);
  const markersRef = useRef<RiskMarker[]>([]);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const arcGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => { threatsRef.current = threats; }, [threats]);
  useEffect(() => { autoRotateRef.current = isAutoRotating; }, [isAutoRotating]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const loadGeoData = useCallback(async () => {
    setLoadingGeo(true);
    try {
      const [events, zoneData, corrData] = await Promise.all([
        fetchGeopoliticalEvents(200),
        fetchExposureZones(),
        fetchCyberGeoCorrelations(),
      ]);
      setGeoEvents(events);
      setZones(zoneData);
      setCorrelations(corrData);
      setLastRefresh(new Date());
    } finally {
      setLoadingGeo(false);
    }
  }, []);

  useEffect(() => { void loadGeoData(); }, [loadGeoData]);

  useEffect(() => {
    if (mode !== 'geopolitical') return;
    const interval = setInterval(() => { void loadGeoData(); }, 60_000);
    return () => clearInterval(interval);
  }, [mode, loadGeoData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeeds();
      await loadGeoData();
    } catch (e) {
      console.error('refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadGeoData]);

  const toggleFilter = useCallback((cat: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d1a);

    const camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.1, 1000,
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0x334466, 0.8);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x0ea5e9, 0.25);
    fillLight.position.set(-3, -2, -3);
    scene.add(fillLight);

    const canvasTexture = createEarthTexture();
    let activeTexture: THREE.Texture = canvasTexture;
    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      map: canvasTexture,
      emissive: 0x061420,
      emissiveIntensity: 0.25,
      shininess: 15,
      specular: 0x1a4a6e,
    });
    new THREE.TextureLoader().load('/earth-dark.webp', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      globeMat.map = tex;
      globeMat.needsUpdate = true;
      canvasTexture.dispose();
      activeTexture = tex;
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    globe.rotation.z = -0.41;
    scene.add(globe);

    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.015, 64, 32);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VS,
      fragmentShader: ATMOSPHERE_INNER_FS,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    const outerGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 64, 32);
    const outerMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VS,
      fragmentShader: ATMOSPHERE_OUTER_FS,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(outerGeo, outerMat));

    const starCount = 2500;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(Math.random() * 2 - 1);
      const r = 25 + Math.random() * 25;
      starPos[i * 3] = r * Math.sin(p) * Math.cos(t);
      starPos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      starPos[i * 3 + 2] = r * Math.cos(p);
      const b = 0.5 + Math.random() * 0.5;
      starCol[i * 3] = b * (Math.random() > 0.7 ? 0.85 : 1);
      starCol[i * 3 + 1] = b;
      starCol[i * 3 + 2] = b;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starsMat = new THREE.PointsMaterial({
      size: 0.08, vertexColors: true, transparent: true, opacity: 0.8, sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starsGeo, starsMat));

    const cityMarkers: THREE.Mesh[] = [];
    for (const city of KNOWN_CITIES) {
      const pos = latLonToVector3(city.lat, city.lon, GLOBE_RADIUS * 1.003);
      const geo = new THREE.SphereGeometry(0.015, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.8 });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.copy(pos);
      scene.add(dot);
      cityMarkers.push(dot);
    }

    const cam = {
      theta: 0.3, phi: 1.2, radius: 7.5,
      tTheta: 0.3, tPhi: 1.2, tRadius: 5.0,
      dragging: false, dragMoved: false, prevX: 0, prevY: 0, downX: 0, downY: 0,
    };

    const arcs: ActiveArc[] = [];
    const arcGroup = new THREE.Group();
    scene.add(arcGroup);
    arcGroupRef.current = arcGroup;

    const geoLayer = new THREE.Group();
    geoLayer.visible = false;
    scene.add(geoLayer);
    geoLayerRef.current = geoLayer;

    const zonesLayer = new THREE.Group();
    zonesLayer.visible = false;
    scene.add(zonesLayer);
    zonesLayerRef.current = zonesLayer;

    const correlationLayer = new THREE.Group();
    correlationLayer.visible = false;
    scene.add(correlationLayer);
    correlationLayerRef.current = correlationLayer;

    function spawnArc() {
      const available = threatsRef.current;
      if (!available.length || arcs.length >= 15 || modeRef.current !== 'cyber') return;

      const threat = available[Math.floor(Math.random() * available.length)];
      const color = SEVERITY_COLORS[threat.severity]?.hex ?? 0xffffff;
      const curve = createArcCurve(threat.source, threat.target, GLOBE_RADIUS * 1.005);
      const numPts = 80;
      const points = curve.getPoints(numPts);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      lineGeo.setDrawRange(0, 0);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const line = new THREE.Line(lineGeo, lineMat);
      arcGroup.add(line);

      const headGeo = new THREE.SphereGeometry(0.035, 8, 8);
      const headMat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const head = new THREE.Mesh(headGeo, headMat);
      const glowGeo = new THREE.SphereGeometry(0.09, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
      });
      head.add(new THREE.Mesh(glowGeo, glowMat));
      arcGroup.add(head);

      const srcPos = latLonToVector3(threat.source.lat, threat.source.lon, GLOBE_RADIUS * 1.005);
      const srcGeo = new THREE.RingGeometry(0.02, 0.04, 32);
      const srcMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      });
      const srcRing = new THREE.Mesh(srcGeo, srcMat);
      srcRing.position.copy(srcPos);
      srcRing.lookAt(srcPos.clone().multiplyScalar(2));
      arcGroup.add(srcRing);

      const attackType = ATTACK_TYPES[Math.floor(Math.random() * ATTACK_TYPES.length)];
      const sourceLoc = findNearestCity(threat.source.lat, threat.source.lon);
      const targetLoc = findNearestCity(threat.target.lat, threat.target.lon);

      const feedItem: FeedItem = {
        id: ++feedIdRef.current,
        type: attackType,
        severity: threat.severity,
        source: `${sourceLoc.name}, ${sourceLoc.country}`,
        target: `${targetLoc.name}, ${targetLoc.country}`,
        time: Date.now(),
      };

      totalRef.current++;
      if (threat.severity === 'critical') criticalRef.current++;
      setAttackFeed((prev) => [feedItem, ...prev].slice(0, 8));

      arcs.push({
        line, head, sourceRing: srcRing, targetRing: null,
        curve, progress: 0,
        speed: 0.005 + Math.random() * 0.003,
        severity: threat.severity,
        totalPoints: numPts + 1,
        feedItem,
      });
    }

    function updateArc(arc: ActiveArc, delta: number, now: number): boolean {
      arc.progress += arc.speed * delta;

      if (arc.progress <= 1) {
        const idx = Math.floor(arc.progress * (arc.totalPoints - 1));
        arc.line.geometry.setDrawRange(0, idx + 1);
        const pos = arc.curve.getPoint(arc.progress);
        arc.head.position.copy(pos);
        arc.head.visible = true;
        const pulse = 1 + Math.sin(now * 0.008) * 0.3;
        arc.sourceRing.scale.setScalar(pulse);
        return false;
      }

      if (arc.progress <= 1.4) {
        arc.line.geometry.setDrawRange(0, arc.totalPoints);
        arc.head.visible = false;
        if (!arc.targetRing) {
          const tgtPos = arc.curve.getPoint(1);
          const rGeo = new THREE.RingGeometry(0.01, 0.025, 32);
          const rMat = new THREE.MeshBasicMaterial({
            color: SEVERITY_COLORS[arc.severity]?.hex ?? 0xffffff,
            transparent: true, opacity: 1, side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(rGeo, rMat);
          ring.position.copy(tgtPos);
          ring.lookAt(tgtPos.clone().multiplyScalar(2));
          arcGroup.add(ring);
          arc.targetRing = ring;
        }
        const t = (arc.progress - 1) / 0.4;
        arc.targetRing.scale.setScalar(1 + t * 4);
        (arc.targetRing.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        return false;
      }

      if (arc.progress <= 2) {
        const t = (arc.progress - 1.4) / 0.6;
        (arc.line.material as THREE.LineBasicMaterial).opacity = 0.7 * (1 - t);
        (arc.sourceRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
        if (arc.targetRing) {
          arc.targetRing.scale.setScalar(5 + t * 2);
          (arc.targetRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.15 * (1 - t));
        }
        return false;
      }

      return true;
    }

    function removeArc(arc: ActiveArc) {
      arcGroup.remove(arc.line);
      arcGroup.remove(arc.head);
      arcGroup.remove(arc.sourceRing);
      if (arc.targetRing) arcGroup.remove(arc.targetRing);
      arc.line.geometry.dispose();
      (arc.line.material as THREE.Material).dispose();
      arc.head.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      arc.head.geometry.dispose();
      (arc.head.material as THREE.Material).dispose();
      arc.sourceRing.geometry.dispose();
      (arc.sourceRing.material as THREE.Material).dispose();
      if (arc.targetRing) {
        arc.targetRing.geometry.dispose();
        (arc.targetRing.material as THREE.Material).dispose();
      }
    }

    let lastTime = performance.now();
    let animFrameId: number;
    let prevArcCount = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 16.67, 3);
      lastTime = now;

      if (autoRotateRef.current && !cam.dragging) {
        cam.tTheta += 0.0008 * delta;
      }
      cam.theta += (cam.tTheta - cam.theta) * 0.06;
      cam.phi += (cam.tPhi - cam.phi) * 0.06;
      cam.radius += (cam.tRadius - cam.radius) * 0.06;

      camera.position.x = cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
      camera.position.y = cam.radius * Math.cos(cam.phi);
      camera.position.z = cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
      camera.lookAt(0, 0, 0);

      const cityPulse = 0.6 + Math.sin(now * 0.003) * 0.4;
      for (const m of cityMarkers) {
        (m.material as THREE.MeshBasicMaterial).opacity = cityPulse;
      }

      const glowPulse = 0.2 + Math.sin(now * 0.001) * 0.08;
      globeMat.emissiveIntensity = glowPulse;

      for (let i = arcs.length - 1; i >= 0; i--) {
        if (updateArc(arcs[i], delta, now)) {
          removeArc(arcs[i]);
          arcs.splice(i, 1);
        }
      }

      // Pulse risk markers
      const markerPulse = 1 + Math.sin(now * 0.004) * 0.4;
      for (const m of markersRef.current) {
        m.pulse.scale.setScalar(markerPulse);
        const mat = m.pulse.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.55 - (markerPulse - 1) * 0.6;
      }

      // Animate cyber-geo correlation flows
      if (modeRef.current === 'correlated') {
        const corrPulse = 1 + Math.sin(now * 0.005) * 0.5;
        for (const v of correlationVisualsRef.current) {
          v.flowParticle.userData.progress = ((v.flowParticle.userData.progress as number) + 0.006 * delta) % 1;
          const p = v.flowParticle.userData.progress as number;
          const pos = v.curve.getPoint(p);
          v.flowParticle.position.copy(pos);
          v.pulseRing.scale.setScalar(corrPulse);
          (v.pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.6 - (corrPulse - 1) * 0.5;
          const sourceScale = 1 + Math.sin(now * 0.006) * 0.25;
          v.sourceMarker.scale.setScalar(sourceScale);
        }
      }

      if (arcs.length !== prevArcCount) {
        prevArcCount = arcs.length;
        setStats({ total: totalRef.current, active: arcs.length, critical: criticalRef.current });
      }

      renderer.render(scene, camera);
    };

    animate();

    const spawnInterval = setInterval(() => {
      spawnArc();
      if (Math.random() > 0.5) setTimeout(spawnArc, 400 + Math.random() * 800);
    }, 2500);

    setTimeout(spawnArc, 200);
    setTimeout(spawnArc, 700);
    setTimeout(spawnArc, 1200);

    const onMouseDown = (e: MouseEvent) => {
      cam.dragging = true;
      cam.dragMoved = false;
      cam.prevX = e.clientX;
      cam.prevY = e.clientY;
      cam.downX = e.clientX;
      cam.downY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (cam.dragging) {
        const dx = e.clientX - cam.prevX;
        const dy = e.clientY - cam.prevY;
        if (Math.abs(e.clientX - cam.downX) > 4 || Math.abs(e.clientY - cam.downY) > 4) {
          cam.dragMoved = true;
        }
        cam.tTheta -= dx * 0.005;
        cam.tPhi = Math.max(0.3, Math.min(Math.PI - 0.3, cam.tPhi + dy * 0.005));
        cam.prevX = e.clientX;
        cam.prevY = e.clientY;
        return;
      }
      if (modeRef.current === 'correlated') {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const meshes: THREE.Object3D[] = [];
        for (const v of correlationVisualsRef.current) {
          meshes.push(v.sourceMarker, v.targetMarker, v.flowParticle);
        }
        const hits = ray.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const c = hits[0].object.userData.correlation as CyberGeoCorrelation | undefined;
          if (c) {
            setHoveredCorrelation(c);
            setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            renderer.domElement.style.cursor = 'pointer';
            return;
          }
        }
        setHoveredCorrelation(null);
        renderer.domElement.style.cursor = '';
      }
    };
    const onMouseUp = () => { cam.dragging = false; };
    const onClick = (e: MouseEvent) => {
      if (cam.dragMoved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      if (modeRef.current === 'geopolitical') {
        const meshes = markersRef.current.map((m) => m.core);
        const hits = ray.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const hit = hits[0].object;
          const marker = markersRef.current.find((m) => m.core === hit);
          if (marker) setSelectedEvent(marker.event);
        }
      } else if (modeRef.current === 'correlated') {
        const meshes: THREE.Object3D[] = [];
        for (const v of correlationVisualsRef.current) {
          meshes.push(v.sourceMarker, v.targetMarker, v.flowParticle);
        }
        const hits = ray.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const c = hits[0].object.userData.correlation as CyberGeoCorrelation | undefined;
          if (c) setSelectedCorrelation(c);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.tRadius = Math.max(3, Math.min(8, cam.tRadius + e.deltaY * 0.003));
    };
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const cvs = renderer.domElement;
    cvs.addEventListener('mousedown', onMouseDown);
    cvs.addEventListener('mousemove', onMouseMove);
    cvs.addEventListener('mouseup', onMouseUp);
    cvs.addEventListener('mouseleave', onMouseUp);
    cvs.addEventListener('click', onClick);
    cvs.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        cam.dragging = true;
        cam.dragMoved = false;
        cam.prevX = e.touches[0].clientX;
        cam.prevY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!cam.dragging || e.touches.length !== 1) return;
      cam.tTheta -= (e.touches[0].clientX - cam.prevX) * 0.005;
      cam.tPhi = Math.max(0.3, Math.min(Math.PI - 0.3, cam.tPhi + (e.touches[0].clientY - cam.prevY) * 0.005));
      cam.prevX = e.touches[0].clientX;
      cam.prevY = e.touches[0].clientY;
    };
    const onTouchEnd = () => { cam.dragging = false; };
    cvs.addEventListener('touchstart', onTouchStart, { passive: true });
    cvs.addEventListener('touchmove', onTouchMove, { passive: true });
    cvs.addEventListener('touchend', onTouchEnd);

    return () => {
      cancelAnimationFrame(animFrameId);
      clearInterval(spawnInterval);
      arcs.forEach(removeArc);
      arcs.length = 0;
      cvs.removeEventListener('mousedown', onMouseDown);
      cvs.removeEventListener('mousemove', onMouseMove);
      cvs.removeEventListener('mouseup', onMouseUp);
      cvs.removeEventListener('mouseleave', onMouseUp);
      cvs.removeEventListener('click', onClick);
      cvs.removeEventListener('wheel', onWheel);
      cvs.removeEventListener('touchstart', onTouchStart);
      cvs.removeEventListener('touchmove', onTouchMove);
      cvs.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', onResize);
      globeGeo.dispose();
      globeMat.dispose();
      activeTexture.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      outerGeo.dispose();
      outerMat.dispose();
      starsGeo.dispose();
      starsMat.dispose();
      cityMarkers.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (container.contains(cvs)) container.removeChild(cvs);
    };
  }, []);

  // Sync mode visibility on layers
  useEffect(() => {
    if (geoLayerRef.current) geoLayerRef.current.visible = mode === 'geopolitical' || mode === 'correlated';
    if (zonesLayerRef.current) zonesLayerRef.current.visible = mode === 'geopolitical' || mode === 'correlated';
    if (arcGroupRef.current) arcGroupRef.current.visible = mode === 'cyber';
    if (correlationLayerRef.current) correlationLayerRef.current.visible = mode === 'correlated';
  }, [mode]);

  // Re-render exposure zones layer
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    while (layer.children.length) {
      const c = layer.children[0];
      layer.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }
    for (const z of zones) {
      const pos = latLonToVector3(z.lat, z.lon, GLOBE_RADIUS * 1.006);
      const ringGeo = new THREE.RingGeometry(0.025, 0.05 + z.criticality * 0.012, 48);
      const color = z.asset_type === 'datacenter' ? 0x22d3ee
        : z.asset_type === 'headquarters' ? 0x34d399
        : z.asset_type === 'engineering' ? 0x60a5fa
        : z.asset_type === 'supplier' ? 0xfbbf24
        : z.asset_type === 'finance' ? 0xfb7185
        : 0x94a3b8;
      const ringMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      layer.add(ring);

      const dotGeo = new THREE.SphereGeometry(0.025, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      layer.add(dot);
    }
  }, [zones]);

  // Re-render geopolitical markers (filtered)
  useEffect(() => {
    const layer = geoLayerRef.current;
    if (!layer) return;
    // Tear down old
    for (const m of markersRef.current) {
      layer.remove(m.group);
      m.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    markersRef.current = [];

    const filtered = activeFilters.size === 0
      ? geoEvents
      : geoEvents.filter((e) => activeFilters.has(e.category));

    for (const ev of filtered) {
      if (!ev.lat && !ev.lon) continue;
      const meta = categoryMeta(ev.category);
      const pos = latLonToVector3(ev.lat, ev.lon, GLOBE_RADIUS * 1.012);
      const group = new THREE.Group();

      const sevScale = 0.018 + ev.severity * 0.008;
      const coreGeo = new THREE.SphereGeometry(sevScale, 14, 14);
      const coreMat = new THREE.MeshBasicMaterial({ color: meta.hex });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.copy(pos);
      group.add(core);

      const pulseGeo = new THREE.RingGeometry(sevScale * 1.4, sevScale * 2.4, 32);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: meta.hex, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.copy(pos);
      pulse.lookAt(pos.clone().multiplyScalar(2));
      group.add(pulse);

      // Beam vertical for high-exposure events
      if (ev.acmeco_exposure_score >= 30) {
        const beamGeo = new THREE.CylinderGeometry(sevScale * 0.4, sevScale * 0.1, sevScale * 8, 8);
        const beamMat = new THREE.MeshBasicMaterial({
          color: meta.hex, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        const beamPos = pos.clone().multiplyScalar(1 + (sevScale * 4) / GLOBE_RADIUS);
        beam.position.copy(beamPos);
        beam.lookAt(0, 0, 0);
        beam.rotateX(Math.PI / 2);
        group.add(beam);
      }

      layer.add(group);
      markersRef.current.push({ group, pulse, core, event: ev });
    }
  }, [geoEvents, activeFilters]);

  // Re-render cyber-geo correlation arcs
  useEffect(() => {
    const layer = correlationLayerRef.current;
    if (!layer) return;
    for (const v of correlationVisualsRef.current) {
      layer.remove(v.line);
      layer.remove(v.sourceMarker);
      layer.remove(v.targetMarker);
      layer.remove(v.pulseRing);
      layer.remove(v.flowParticle);
      v.line.geometry.dispose();
      (v.line.material as THREE.Material).dispose();
      v.sourceMarker.geometry.dispose();
      (v.sourceMarker.material as THREE.Material).dispose();
      v.targetMarker.geometry.dispose();
      (v.targetMarker.material as THREE.Material).dispose();
      v.pulseRing.geometry.dispose();
      (v.pulseRing.material as THREE.Material).dispose();
      v.flowParticle.geometry.dispose();
      (v.flowParticle.material as THREE.Material).dispose();
    }
    correlationVisualsRef.current = [];

    for (const c of correlations) {
      const sevColor = c.severity >= 85 ? 0xef4444 : c.severity >= 70 ? 0xf97316 : 0xfbbf24;
      const curve = createArcCurve(
        { lat: c.cyber_source_lat, lon: c.cyber_source_lon },
        { lat: c.target_lat, lon: c.target_lon },
        GLOBE_RADIUS * 1.02,
      );
      const points = curve.getPoints(80);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: sevColor, transparent: true, opacity: 0.85,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      layer.add(line);

      const srcPos = latLonToVector3(c.cyber_source_lat, c.cyber_source_lon, GLOBE_RADIUS * 1.02);
      const srcGeo = new THREE.SphereGeometry(0.04, 14, 14);
      const srcMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const sourceMarker = new THREE.Mesh(srcGeo, srcMat);
      sourceMarker.position.copy(srcPos);
      sourceMarker.userData.correlation = c;
      sourceMarker.userData.role = 'cyber_source';
      layer.add(sourceMarker);

      const tgtPos = latLonToVector3(c.target_lat, c.target_lon, GLOBE_RADIUS * 1.02);
      const tgtGeo = new THREE.SphereGeometry(0.05, 14, 14);
      const tgtMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const targetMarker = new THREE.Mesh(tgtGeo, tgtMat);
      targetMarker.position.copy(tgtPos);
      targetMarker.userData.correlation = c;
      targetMarker.userData.role = 'geo_target';
      layer.add(targetMarker);

      const ringGeo = new THREE.RingGeometry(0.06, 0.1, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: sevColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const pulseRing = new THREE.Mesh(ringGeo, ringMat);
      pulseRing.position.copy(tgtPos);
      pulseRing.lookAt(tgtPos.clone().multiplyScalar(2));
      layer.add(pulseRing);

      const partGeo = new THREE.SphereGeometry(0.045, 10, 10);
      const partMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const flowParticle = new THREE.Mesh(partGeo, partMat);
      flowParticle.position.copy(srcPos);
      flowParticle.userData.correlation = c;
      flowParticle.userData.role = 'flow';
      flowParticle.userData.progress = Math.random();
      layer.add(flowParticle);

      correlationVisualsRef.current.push({
        correlation: c, line, sourceMarker, targetMarker, pulseRing, flowParticle, curve,
      });
    }
  }, [correlations]);

  const toggleAutoRotate = useCallback(() => setIsAutoRotating((p) => !p), []);

  const sevDot = (s: string) => {
    const m: Record<string, string> = {
      critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-green-500',
    };
    return m[s] || 'bg-slate-500';
  };

  const timeAgo = (t: number | string) => {
    const ts = typeof t === 'number' ? t : new Date(t).getTime();
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'now';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  const topRisks = [...geoEvents]
    .filter((e) => activeFilters.size === 0 || activeFilters.has(e.category))
    .sort((a, b) => b.acmeco_exposure_score - a.acmeco_exposure_score)
    .slice(0, 6);

  const geoCounts = geoEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  const totalExposed = geoEvents.filter((e) => e.acmeco_exposure_score >= 20).length;
  const criticalExposed = geoEvents.filter((e) => e.acmeco_exposure_score >= 60).length;

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute inset-0 pointer-events-none rounded-b-xl"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(7,13,26,0.5) 100%)' }} />

      {/* Mode toggle */}
      <div className="absolute top-3 left-3 z-10 inline-flex bg-slate-900/70 backdrop-blur-md border border-slate-700/50 rounded-xl p-1">
        <button
          onClick={() => setMode('cyber')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
            mode === 'cyber' ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radar className="w-3.5 h-3.5" /> Cyber Threats
        </button>
        <button
          onClick={() => setMode('geopolitical')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
            mode === 'geopolitical' ? 'bg-amber-500/20 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe2 className="w-3.5 h-3.5" /> Geopolitical Risk
        </button>
        <button
          onClick={() => setMode('correlated')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
            mode === 'correlated' ? 'bg-rose-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" /> Cyber x Geo
          <span className={`ml-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
            mode === 'correlated' ? 'bg-rose-500/40 text-white' : 'bg-slate-700/60 text-slate-300'
          }`}>{correlations.length}</span>
        </button>
      </div>

      <button
        onClick={toggleAutoRotate}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 text-[11px] font-medium rounded-lg
          bg-slate-800/60 backdrop-blur-sm border border-slate-700/40 text-slate-400
          hover:bg-slate-700/60 hover:text-white transition-all"
      >
        {isAutoRotating ? 'Pause Rotation' : 'Auto-Rotate'}
      </button>

      {mode === 'cyber' && (
        <>
          <div className="absolute bottom-3 left-3 z-10 w-60 bg-slate-900/70 backdrop-blur-md
            border border-slate-700/30 rounded-xl p-3">
            <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-2">
              Live Threat Feed
            </div>
            <div>
              {attackFeed.length === 0 && (
                <div className="text-[11px] text-slate-600 py-2">Initializing sensors...</div>
              )}
              {attackFeed.map((item) => (
                <div key={item.id}
                  className="flex items-start gap-2 py-1.5 border-b border-slate-800/30 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${sevDot(item.severity)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-200 font-medium truncate">{item.type}</div>
                    <div className="text-[9px] text-slate-500 truncate">
                      {item.source} &rarr; {item.target}
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-600 flex-shrink-0 mt-0.5">{timeAgo(item.time)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-10 bg-slate-900/70 backdrop-blur-md
            border border-slate-700/30 rounded-xl p-3">
            <div className="grid grid-cols-3 gap-x-5 gap-y-1">
              <div className="text-center">
                <div className="text-base font-bold text-cyan-400 tabular-nums">{stats.active}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Active</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-white tabular-nums">{stats.total}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Total</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-red-400 tabular-nums">{stats.critical}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Critical</div>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === 'geopolitical' && (
        <>
          {/* Filter chips */}
          <div className="absolute top-14 left-3 z-10 max-w-md flex flex-wrap gap-1.5 bg-slate-900/70 backdrop-blur-md border border-slate-700/40 rounded-xl p-2">
            {Object.entries(geoCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => {
                const meta = categoryMeta(cat);
                const Icon = CATEGORY_ICONS[cat] ?? Activity;
                const active = activeFilters.has(cat);
                const dim = activeFilters.size > 0 && !active;
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFilter(cat)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                      active
                        ? 'bg-slate-700 border-slate-500 text-white'
                        : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-700/40'
                    } ${dim ? 'opacity-50' : ''}`}
                    style={active ? { boxShadow: `0 0 10px ${meta.color}40` } : {}}
                  >
                    <Icon className="w-3 h-3" style={{ color: meta.color }} />
                    {meta.label}
                    <span className="text-slate-500 ml-1">{count}</span>
                  </button>
                );
              })}
          </div>

          {/* Top risks drawer */}
          <div className="absolute bottom-3 left-3 z-10 w-80 bg-slate-900/80 backdrop-blur-md border border-amber-500/20 rounded-xl p-3 shadow-[0_0_24px_rgba(245,158,11,0.15)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Top Risks to Acmeco</span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded border border-slate-700/40 hover:border-slate-500/60 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Fetching...' : 'Refresh'}
              </button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {loadingGeo && topRisks.length === 0 && <div className="text-[11px] text-slate-500 py-2">Loading global feeds...</div>}
              {!loadingGeo && topRisks.length === 0 && <div className="text-[11px] text-slate-500 py-2">No events match filters.</div>}
              {topRisks.map((ev) => {
                const meta = categoryMeta(ev.category);
                const Icon = CATEGORY_ICONS[ev.category] ?? Activity;
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left flex gap-2 py-1.5 px-2 rounded-lg border border-slate-800/30 hover:border-slate-600/60 hover:bg-slate-800/40 transition-all"
                  >
                    <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: meta.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white font-medium leading-tight line-clamp-2">{ev.headline}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span>{ev.country_name || ev.region || 'global'}</span>
                        <span>·</span>
                        <span>{ev.source}</span>
                        <span>·</span>
                        <span>{timeAgo(ev.occurred_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <div className={`text-[10px] font-bold tabular-nums ${
                        ev.acmeco_exposure_score >= 60 ? 'text-rose-300'
                        : ev.acmeco_exposure_score >= 30 ? 'text-amber-300'
                        : 'text-slate-400'
                      }`}>{ev.acmeco_exposure_score}</div>
                      <div className="text-[8px] text-slate-600 uppercase tracking-wider">exp</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {lastRefresh && (
              <div className="mt-2 pt-2 border-t border-slate-800/40 text-[8px] text-slate-600 uppercase tracking-wider">
                Last refresh {timeAgo(lastRefresh.toISOString())} · {geoEvents.length} events live
              </div>
            )}
          </div>

          <div className="absolute bottom-3 right-3 z-10 bg-slate-900/70 backdrop-blur-md border border-slate-700/30 rounded-xl p-3">
            <div className="grid grid-cols-3 gap-x-5 gap-y-1">
              <div className="text-center">
                <div className="text-base font-bold text-amber-300 tabular-nums">{geoEvents.length}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Events</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-orange-300 tabular-nums">{totalExposed}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Exposed</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-rose-300 tabular-nums">{criticalExposed}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Critical</div>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === 'correlated' && (
        <>
          <div className="absolute top-14 left-3 z-10 max-w-md flex items-center gap-2 bg-slate-900/70 backdrop-blur-md border border-rose-500/30 rounded-xl px-3 py-2">
            <Target className="w-3.5 h-3.5 text-rose-300" />
            <div className="text-[10px] text-rose-200 font-semibold uppercase tracking-wider">Cross-Domain Correlations</div>
            <span className="text-[9px] text-slate-400">Hover an arc to read why these events are linked</span>
          </div>

          <div className="absolute bottom-3 left-3 z-10 w-[22rem] bg-slate-900/85 backdrop-blur-md border border-rose-500/25 rounded-xl p-3 shadow-[0_0_24px_rgba(244,63,94,0.18)]">
            <div className="flex items-center gap-1.5 mb-2">
              <Link2 className="w-3.5 h-3.5 text-rose-300" />
              <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Correlated Cyber x Geo Threats</span>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {correlations.length === 0 && <div className="text-[11px] text-slate-500 py-2">No correlations detected.</div>}
              {correlations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCorrelation(c)}
                  onMouseEnter={() => setHoveredCorrelation(c)}
                  onMouseLeave={() => setHoveredCorrelation(null)}
                  className="w-full text-left flex gap-2 py-2 px-2 rounded-lg border border-slate-800/50 hover:border-rose-500/40 hover:bg-slate-800/40 transition-all"
                >
                  <div className="flex flex-col items-center pt-0.5 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="w-0.5 h-3 bg-gradient-to-b from-red-500 to-amber-400" />
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white font-semibold leading-tight">
                      {c.cyber_attack_type.replace(/_/g, ' ')} -&gt; {c.geo_event_headline.split(' - ')[0].slice(0, 48)}{c.geo_event_headline.length > 48 ? '...' : ''}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {c.cyber_threat_actor} · {c.cyber_source_country} · confidence {c.confidence_score}%
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className={`text-[10px] font-bold tabular-nums ${
                      c.severity >= 85 ? 'text-rose-300' : c.severity >= 70 ? 'text-orange-300' : 'text-amber-300'
                    }`}>{c.severity}</div>
                    <div className="text-[8px] text-slate-600 uppercase tracking-wider">sev</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-10 bg-slate-900/70 backdrop-blur-md border border-slate-700/30 rounded-xl p-3">
            <div className="grid grid-cols-3 gap-x-5 gap-y-1">
              <div className="text-center">
                <div className="text-base font-bold text-rose-300 tabular-nums">{correlations.length}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Linked</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-orange-300 tabular-nums">{correlations.filter((c) => c.severity >= 80).length}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">High Sev</div>
              </div>
              <div className="text-center">
                <div className="text-base font-bold text-cyan-300 tabular-nums">
                  {correlations.length === 0 ? 0 : Math.round(correlations.reduce((s, c) => s + c.confidence_score, 0) / correlations.length)}%
                </div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Avg Conf</div>
              </div>
            </div>
          </div>

          {hoveredCorrelation && (
            <div
              className="absolute z-20 pointer-events-none w-80 bg-slate-950/95 backdrop-blur-md border border-rose-500/40 rounded-xl p-3 shadow-[0_0_30px_rgba(244,63,94,0.35)]"
              style={{
                left: Math.min(hoverPos.x + 16, (containerRef.current?.clientWidth ?? 800) - 336),
                top: Math.min(hoverPos.y + 16, (containerRef.current?.clientHeight ?? 600) - 280),
              }}
            >
              <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-slate-800">
                <Link2 className="w-3 h-3 text-rose-400" />
                <span className="text-[9px] font-bold text-rose-300 uppercase tracking-wider">Why are these correlated?</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-red-300/80 font-bold">Cyber threat</div>
                  <div className="text-[11px] text-white font-semibold leading-tight">
                    {hoveredCorrelation.cyber_attack_type.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px] text-slate-400">{hoveredCorrelation.cyber_threat_actor} ({hoveredCorrelation.cyber_source_country})</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-wider text-amber-300/80 font-bold">Geopolitical event</div>
                  <div className="text-[11px] text-white leading-tight line-clamp-2">{hoveredCorrelation.geo_event_headline}</div>
                </div>
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[8px] uppercase tracking-wider text-rose-300 font-bold mb-1">Correlation narrative</div>
                  <p className="text-[10.5px] text-slate-200 leading-relaxed">{hoveredCorrelation.correlation_narrative}</p>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60">
                  <span className="text-[9px] text-slate-500">Confidence</span>
                  <span className="text-[10px] font-bold text-cyan-300">{hoveredCorrelation.confidence_score}%</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10
        text-[9px] text-slate-600/50 select-none pointer-events-none">
        Drag to orbit · Scroll to zoom · {mode === 'geopolitical' ? 'Click markers for impact brief' : mode === 'correlated' ? 'Hover arcs to see why threats are linked' : 'Live cyber telemetry'}
      </div>

      {selectedEvent && (
        <EventDrilldown event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {selectedCorrelation && (
        <CorrelationDrilldown correlation={selectedCorrelation} onClose={() => setSelectedCorrelation(null)} />
      )}
    </div>
  );
};

function EventDrilldown({ event, onClose }: { event: GeopoliticalEvent; onClose: () => void }) {
  const meta = categoryMeta(event.category);
  const Icon = CATEGORY_ICONS[event.category] ?? Activity;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-xl max-h-[85%] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg" style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}55` }}>
              <Icon className="w-5 h-5" style={{ color: meta.color }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider">
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}40` }}>
                  {meta.label}
                </span>
                <span className="text-slate-500">{event.source}</span>
                <span className="text-slate-500">severity {event.severity}/5</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-white leading-tight">{event.headline}</h3>
              <div className="mt-1 text-[11px] text-slate-400">
                {event.country_name || 'Global'} · {new Date(event.occurred_at).toUTCString()}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-1">Acmeco exposure score</div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-white">{event.acmeco_exposure_score}<span className="text-sm text-slate-500">/100</span></div>
              <div className="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${event.acmeco_exposure_score}%`,
                    background: event.acmeco_exposure_score >= 60 ? '#fb7185'
                      : event.acmeco_exposure_score >= 30 ? '#fbbf24'
                      : '#34d399',
                  }}
                />
              </div>
            </div>
          </section>

          {event.summary && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Context</div>
              <p className="text-sm text-slate-300 leading-relaxed">{event.summary}</p>
            </section>
          )}

          {event.exposure_assets && event.exposure_assets.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Acmeco assets in proximity</div>
              <div className="space-y-1.5">
                {event.exposure_assets.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-1.5">
                    <span className="text-slate-200 font-medium truncate">{a.name}</span>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 shrink-0 ml-3">
                      <span>{a.distance_km} km</span>
                      <span className="font-mono">crit {a.criticality}/5</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-cyan-300 hover:text-cyan-200 underline"
            >
              Source: {event.source}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CorrelationDrilldown({ correlation, onClose }: { correlation: CyberGeoCorrelation; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[85%] overflow-y-auto bg-slate-900 border border-rose-500/40 rounded-2xl shadow-[0_0_40px_rgba(244,63,94,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/40">
              <Link2 className="w-5 h-5 text-rose-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider">
                <span className="px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">Cyber x Geo Correlation</span>
                <span className="text-slate-500">severity {correlation.severity}/100</span>
                <span className="text-cyan-400">confidence {correlation.confidence_score}%</span>
              </div>
              <h3 className="mt-2 text-base font-bold text-white leading-tight">
                {correlation.cyber_attack_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} correlated with geopolitical event
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <section className="bg-red-500/5 border border-red-500/30 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-red-300 font-bold mb-1.5">Cyber threat</div>
              <div className="text-sm font-bold text-white">{correlation.cyber_attack_type.replace(/_/g, ' ')}</div>
              <div className="text-[11px] text-slate-300 mt-1">{correlation.cyber_threat_actor}</div>
              <div className="text-[10px] text-slate-500 mt-1">Origin: {correlation.cyber_source_country}</div>
            </section>
            <section className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-1.5">Geopolitical event</div>
              <div className="text-sm font-bold text-white leading-tight line-clamp-3">{correlation.geo_event_headline}</div>
            </section>
          </div>

          <section className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold mb-1.5">Why these are correlated</div>
            <p className="text-sm text-slate-200 leading-relaxed">{correlation.correlation_narrative}</p>
          </section>

          <section>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Acmeco impact</div>
            <p className="text-xs text-slate-300 leading-relaxed">{correlation.acmeco_impact}</p>
          </section>

          {correlation.detected_iocs && correlation.detected_iocs.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Detected IOCs</div>
              <div className="space-y-1">
                {correlation.detected_iocs.map((ioc, i) => (
                  <code key={i} className="block text-[11px] text-cyan-300 bg-slate-950/60 border border-slate-800 rounded px-2 py-1 font-mono">
                    {ioc}
                  </code>
                ))}
              </div>
            </section>
          )}

          <section className="bg-cyan-500/5 border border-cyan-500/25 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-1">Recommended action</div>
            <p className="text-xs text-slate-200 leading-relaxed">{correlation.recommended_action}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ThreatGlobe;
