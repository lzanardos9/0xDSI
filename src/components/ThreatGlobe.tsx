import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  createEarthTexture, latLonToVector3, createArcCurve, findNearestCity,
  SEVERITY_COLORS, ATTACK_TYPES, ATMOSPHERE_VS, ATMOSPHERE_INNER_FS,
  ATMOSPHERE_OUTER_FS, GLOBE_RADIUS, KNOWN_CITIES,
} from '../lib/globeGeometry';

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

const ThreatGlobe = ({ threats }: { threats: ThreatData[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const threatsRef = useRef(threats);
  const autoRotateRef = useRef(true);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [attackFeed, setAttackFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, critical: 0 });
  const feedIdRef = useRef(0);
  const totalRef = useRef(0);
  const criticalRef = useRef(0);

  useEffect(() => { threatsRef.current = threats; }, [threats]);
  useEffect(() => { autoRotateRef.current = isAutoRotating; }, [isAutoRotating]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d1a);

    const camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.1, 1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

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
      dragging: false, prevX: 0, prevY: 0,
    };

    const arcs: ActiveArc[] = [];
    const arcGroup = new THREE.Group();
    scene.add(arcGroup);

    function spawnArc() {
      const available = threatsRef.current;
      if (!available.length || arcs.length >= 15) return;

      const threat = available[Math.floor(Math.random() * available.length)];
      const color = SEVERITY_COLORS[threat.severity]?.hex ?? 0xffffff;
      const curve = createArcCurve(threat.source, threat.target, GLOBE_RADIUS * 1.005);
      const numPts = 80;
      const points = curve.getPoints(numPts);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      lineGeo.setDrawRange(0, 0);
      const lineMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.7,
      });
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
      setAttackFeed(prev => [feedItem, ...prev].slice(0, 8));

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
      arc.head.children.forEach(child => {
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
      cam.prevX = e.clientX;
      cam.prevY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!cam.dragging) return;
      cam.tTheta -= (e.clientX - cam.prevX) * 0.005;
      cam.tPhi = Math.max(0.3, Math.min(Math.PI - 0.3, cam.tPhi + (e.clientY - cam.prevY) * 0.005));
      cam.prevX = e.clientX;
      cam.prevY = e.clientY;
    };
    const onMouseUp = () => { cam.dragging = false; };
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
    cvs.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        cam.dragging = true;
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
      cityMarkers.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (container.contains(cvs)) container.removeChild(cvs);
    };
  }, []);

  const toggleAutoRotate = useCallback(() => setIsAutoRotating(p => !p), []);

  const sevDot = (s: string) => {
    const m: Record<string, string> = {
      critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-green-500',
    };
    return m[s] || 'bg-slate-500';
  };

  const timeAgo = (t: number) => {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 5) return 'now';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m`;
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute inset-0 pointer-events-none rounded-b-xl"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(7,13,26,0.5) 100%)' }} />

      <button
        onClick={toggleAutoRotate}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 text-[11px] font-medium rounded-lg
          bg-slate-800/60 backdrop-blur-sm border border-slate-700/40 text-slate-400
          hover:bg-slate-700/60 hover:text-white transition-all"
      >
        {isAutoRotating ? 'Pause Rotation' : 'Auto-Rotate'}
      </button>

      <div className="absolute bottom-3 left-3 z-10 w-60 bg-slate-900/70 backdrop-blur-md
        border border-slate-700/30 rounded-xl p-3">
        <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-2">
          Live Threat Feed
        </div>
        <div>
          {attackFeed.length === 0 && (
            <div className="text-[11px] text-slate-600 py-2">Initializing sensors...</div>
          )}
          {attackFeed.map(item => (
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

      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10
        text-[9px] text-slate-600/50 select-none pointer-events-none">
        Drag to orbit &middot; Scroll to zoom
      </div>
    </div>
  );
};

export default ThreatGlobe;
