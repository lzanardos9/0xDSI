import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AlertTriangle, Crosshair, Shield, MousePointer, RotateCcw, ZoomIn, Hand } from 'lucide-react';

interface DomainData {
  id: string;
  name: string;
  health: number;
  pressure: number;
  active: boolean;
  color: string;
  attacks: number;
  description: string;
}

type SeverityLevel = 'normal' | 'elevated' | 'high' | 'critical';

const DOMAINS: DomainData[] = [
  { id: 'identity', name: 'Identity', health: 72, pressure: 68, active: true, color: '#06b6d4', attacks: 14, description: 'Authentication & Access' },
  { id: 'endpoint', name: 'Endpoint', health: 58, pressure: 82, active: true, color: '#f59e0b', attacks: 23, description: 'Devices & Agents' },
  { id: 'network', name: 'Network', health: 85, pressure: 45, active: true, color: '#10b981', attacks: 7, description: 'Traffic & Protocols' },
  { id: 'application', name: 'Application', health: 91, pressure: 22, active: false, color: '#3b82f6', attacks: 3, description: 'Apps & Services' },
  { id: 'cloud', name: 'Cloud', health: 64, pressure: 71, active: true, color: '#0ea5e9', attacks: 18, description: 'Infrastructure & SaaS' },
  { id: 'data', name: 'Data', health: 44, pressure: 89, active: true, color: '#ef4444', attacks: 31, description: 'Storage & DLP' },
  { id: 'physical', name: 'Physical', health: 96, pressure: 12, active: false, color: '#22c55e', attacks: 1, description: 'Facilities & CCTV' },
];

const ATTACK_FLOWS = [
  { from: 0, to: 1, label: 'Credential Spray' },
  { from: 1, to: 4, label: 'Lateral Movement' },
  { from: 4, to: 5, label: 'Exfiltration' },
  { from: 0, to: 4, label: 'Token Hijack' },
  { from: 2, to: 1, label: 'Port Scan' },
];

function getSeverityConfig(severity: SeverityLevel) {
  switch (severity) {
    case 'normal': return { color: new THREE.Color('#10b981'), hex: '#10b981', label: 'NORMAL' };
    case 'elevated': return { color: new THREE.Color('#f59e0b'), hex: '#f59e0b', label: 'ELEVATED' };
    case 'high': return { color: new THREE.Color('#f97316'), hex: '#f97316', label: 'HIGH' };
    case 'critical': return { color: new THREE.Color('#ef4444'), hex: '#ef4444', label: 'CRITICAL' };
  }
}

const AttackUniverse = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneDataRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    coreMesh: THREE.Mesh;
    coreGlow: THREE.Mesh;
    domainMeshes: THREE.Mesh[];
    domainRings: THREE.Mesh[];
    flowLines: THREE.Line[];
    flowParticles: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    clock: THREE.Clock;
    animId: number;
    hoveredIdx: number;
    selectedIdx: number;
  } | null>(null);

  const [severity, setSeverity] = useState<SeverityLevel>('critical');
  const [selectedDomain, setSelectedDomain] = useState<DomainData | null>(null);
  const [hoveredDomain, setHoveredDomain] = useState<DomainData | null>(null);
  const [coreEnergy, setCoreEnergy] = useState(85);
  const [totalAttacks, setTotalAttacks] = useState(97);
  const [isRotating, setIsRotating] = useState(true);

  const severityRef = useRef(severity);
  const selectedIdxRef = useRef(-1);

  useEffect(() => { severityRef.current = severity; }, [severity]);

  const handleDomainClick = useCallback((idx: number) => {
    if (idx >= 0 && idx < DOMAINS.length) {
      setSelectedDomain(DOMAINS[idx]);
      selectedIdxRef.current = idx;
    } else {
      setSelectedDomain(null);
      selectedIdxRef.current = -1;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050a15');

    // Camera
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 3, 7);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls - DRAG to rotate, SCROLL to zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.panSpeed = 0.5;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x1a2040, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight.position.set(5, 8, 5);
    scene.add(directionalLight);

    // Grid floor (subtle reference plane)
    const gridHelper = new THREE.GridHelper(12, 24, 0x1a2a3a, 0x0a1520);
    gridHelper.position.y = -2.5;
    scene.add(gridHelper);

    // === ATTACK CORE (center sphere) ===
    const coreGeometry = new THREE.SphereGeometry(0.7, 64, 64);
    const coreMaterial = new THREE.MeshPhongMaterial({
      color: getSeverityConfig(severity).color,
      emissive: getSeverityConfig(severity).color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
      shininess: 100,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(coreMesh);

    // Core glow
    const glowGeometry = new THREE.SphereGeometry(0.9, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: getSeverityConfig(severity).color,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const coreGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(coreGlow);

    // Core point light
    const coreLight = new THREE.PointLight(getSeverityConfig(severity).color.getHex(), 2, 6);
    scene.add(coreLight);

    // === DOMAIN NODES (orbital planets) ===
    const domainMeshes: THREE.Mesh[] = [];
    const domainRings: THREE.Mesh[] = [];
    const orbitRadius = 3.0;

    DOMAINS.forEach((domain, idx) => {
      const angle = (idx / DOMAINS.length) * Math.PI * 2;
      const nodeSize = domain.active ? 0.25 + (domain.pressure / 500) : 0.18;

      // Domain sphere
      const geometry = new THREE.SphereGeometry(nodeSize, 32, 32);
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(domain.color),
        emissive: new THREE.Color(domain.color),
        emissiveIntensity: domain.active ? 0.4 : 0.1,
        transparent: true,
        opacity: domain.active ? 0.95 : 0.5,
        shininess: 60,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        Math.cos(angle) * orbitRadius,
        Math.sin(angle * 0.5) * 0.4,
        Math.sin(angle) * orbitRadius
      );
      mesh.userData = { domainIdx: idx, baseY: mesh.position.y };
      scene.add(mesh);
      domainMeshes.push(mesh);

      // Selection ring
      const ringGeometry = new THREE.RingGeometry(nodeSize * 1.5, nodeSize * 1.8, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(domain.color),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(mesh.position);
      ring.lookAt(camera.position);
      scene.add(ring);
      domainRings.push(ring);

      // Domain light
      if (domain.active) {
        const light = new THREE.PointLight(new THREE.Color(domain.color).getHex(), 0.4, 2);
        light.position.copy(mesh.position);
        scene.add(light);
      }
    });

    // === ORBIT RING ===
    const orbitCurve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, Math.PI * 2, false, 0);
    const orbitPoints = orbitCurve.getPoints(100).map(p => new THREE.Vector3(p.x, 0, p.y));
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.4 });
    const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
    scene.add(orbitLine);

    // === ATTACK FLOW LINES ===
    const flowLines: THREE.Line[] = [];
    const flowParticles: THREE.Mesh[] = [];

    ATTACK_FLOWS.forEach((flow) => {
      const fromPos = domainMeshes[flow.from].position;
      const toPos = domainMeshes[flow.to].position;
      const mid = new THREE.Vector3(
        (fromPos.x + toPos.x) / 2,
        (fromPos.y + toPos.y) / 2 + 0.5,
        (fromPos.z + toPos.z) / 2
      );
      const curve = new THREE.QuadraticBezierCurve3(fromPos.clone(), mid, toPos.clone());
      const points = curve.getPoints(40);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(DOMAINS[flow.from].color),
        transparent: true,
        opacity: 0.25,
      });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      flowLines.push(line);

      // Traveling particle on flow
      const particleGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const particleMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(DOMAINS[flow.from].color),
        transparent: true,
        opacity: 0.9,
      });
      const particle = new THREE.Mesh(particleGeo, particleMat);
      particle.userData = { curve, progress: Math.random() };
      scene.add(particle);
      flowParticles.push(particle);
    });

    // === STARFIELD ===
    const starCount = 500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 30;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x334455, size: 0.03, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Raycaster for interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    let hoveredIdx = -1;
    let localSelectedIdx = -1;

    // Mouse move - hover detection
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;
    };

    // Click - select domain
    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
      raycaster.setFromCamera(clickMouse, camera);
      const intersects = raycaster.intersectObjects(domainMeshes);

      if (intersects.length > 0) {
        const idx = intersects[0].object.userData.domainIdx;
        if (localSelectedIdx === idx) {
          localSelectedIdx = -1;
          handleDomainClick(-1);
        } else {
          localSelectedIdx = idx;
          handleDomainClick(idx);
        }
      } else {
        // Check if clicked on core
        const coreIntersects = raycaster.intersectObject(coreMesh);
        if (coreIntersects.length > 0) {
          localSelectedIdx = -1;
          handleDomainClick(-1);
        }
      }
    };

    // Double-click - focus on domain
    const handleDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const dblMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width) * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
      raycaster.setFromCamera(dblMouse, camera);
      const intersects = raycaster.intersectObjects(domainMeshes);
      if (intersects.length > 0) {
        const target = intersects[0].object.position.clone();
        controls.target.copy(target);
      } else {
        controls.target.set(0, 0, 0);
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('click', handleClick);
    container.addEventListener('dblclick', handleDblClick);

    const clock = new THREE.Clock();
    const sceneData = {
      scene, camera, renderer, controls, coreMesh, coreGlow,
      domainMeshes, domainRings, flowLines, flowParticles,
      raycaster, mouse, clock, animId: 0, hoveredIdx, selectedIdx: -1,
    };
    sceneDataRef.current = sceneData;

    // Animation loop
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      controls.update();

      // Core pulse
      const pulse = 1 + Math.sin(elapsed * 2) * 0.05;
      coreMesh.scale.setScalar(pulse);
      coreGlow.scale.setScalar(pulse * 1.2);
      coreMesh.rotation.y += 0.005;

      // Update core color
      const sevConfig = getSeverityConfig(severityRef.current);
      (coreMesh.material as THREE.MeshPhongMaterial).color.lerp(sevConfig.color, 0.03);
      (coreMesh.material as THREE.MeshPhongMaterial).emissive.lerp(sevConfig.color, 0.03);
      (coreGlow.material as THREE.MeshBasicMaterial).color.lerp(sevConfig.color, 0.03);
      coreLight.color.lerp(sevConfig.color, 0.03);

      // Domain node animations
      domainMeshes.forEach((mesh, idx) => {
        const baseY = mesh.userData.baseY;
        mesh.position.y = baseY + Math.sin(elapsed * 0.8 + idx) * 0.1;
        mesh.rotation.y += 0.008;

        // Rings follow and billboard to camera
        domainRings[idx].position.copy(mesh.position);
        domainRings[idx].lookAt(camera.position);
      });

      // Hover detection via raycaster
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(domainMeshes);
      const newHoveredIdx = intersects.length > 0 ? intersects[0].object.userData.domainIdx : -1;

      if (newHoveredIdx !== hoveredIdx) {
        // Unhover previous
        if (hoveredIdx >= 0) {
          const prevRing = domainRings[hoveredIdx];
          (prevRing.material as THREE.MeshBasicMaterial).opacity = 0;
          const prevMesh = domainMeshes[hoveredIdx];
          prevMesh.scale.setScalar(1);
          setHoveredDomain(null);
        }
        // Hover new
        if (newHoveredIdx >= 0) {
          const ring = domainRings[newHoveredIdx];
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.6;
          const mesh = domainMeshes[newHoveredIdx];
          mesh.scale.setScalar(1.3);
          setHoveredDomain(DOMAINS[newHoveredIdx]);
          renderer.domElement.style.cursor = 'pointer';
        } else {
          renderer.domElement.style.cursor = 'grab';
        }
        hoveredIdx = newHoveredIdx;
      }

      // Selected domain highlight
      domainRings.forEach((ring, idx) => {
        if (idx === selectedIdxRef.current) {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 + Math.sin(elapsed * 3) * 0.2;
          const ringScale = 1 + Math.sin(elapsed * 2) * 0.1;
          ring.scale.setScalar(ringScale);
        } else if (idx !== hoveredIdx) {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0;
          ring.scale.setScalar(1);
        }
      });

      // Flow particles travel along curves
      flowParticles.forEach((particle) => {
        const data = particle.userData;
        data.progress += 0.003;
        if (data.progress > 1) data.progress = 0;
        const point = data.curve.getPoint(data.progress);
        particle.position.copy(point);
        particle.scale.setScalar(0.8 + Math.sin(elapsed * 4 + data.progress * 10) * 0.3);
      });

      renderer.render(scene, camera);
      sceneData.animId = requestAnimationFrame(animate);
    };

    sceneData.animId = requestAnimationFrame(animate);

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Data simulation
    const dataInterval = setInterval(() => {
      setCoreEnergy(prev => Math.max(60, Math.min(100, prev + (Math.random() - 0.45) * 3)));
      setTotalAttacks(prev => prev + (Math.random() > 0.6 ? 1 : 0));
    }, 4000);

    return () => {
      cancelAnimationFrame(sceneData.animId);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('resize', handleResize);
      clearInterval(dataInterval);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneDataRef.current = null;
    };
  }, [handleDomainClick]);

  // Toggle auto-rotate
  const toggleRotation = useCallback(() => {
    if (sceneDataRef.current) {
      const newVal = !isRotating;
      sceneDataRef.current.controls.autoRotate = newVal;
      setIsRotating(newVal);
    }
  }, [isRotating]);

  // Reset camera
  const resetCamera = useCallback(() => {
    if (sceneDataRef.current) {
      const { controls, camera } = sceneDataRef.current;
      controls.target.set(0, 0, 0);
      camera.position.set(0, 3, 7);
      controls.update();
    }
  }, []);

  const sevConfig = getSeverityConfig(severity);

  return (
    <div className="relative w-full rounded-2xl border border-slate-700/40 bg-[#050a15] overflow-hidden" style={{ height: '640px' }}>
      {/* Three.js Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-4 bg-gradient-to-b from-[#050a15]/95 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: sevConfig.hex, boxShadow: `0 0 8px ${sevConfig.hex}` }} />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Attack Universe</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Real-time 3D attack surface visualization</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Core Status</div>
              <div className="text-lg font-black" style={{ color: sevConfig.hex }}>{sevConfig.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Active Attacks</div>
              <div className="text-lg font-black text-white">{totalAttacks}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Energy</div>
              <div className="text-lg font-black text-cyan-400">{coreEnergy}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interaction Controls */}
      <div className="absolute top-20 right-4 z-10 flex flex-col gap-1.5">
        <button
          onClick={toggleRotation}
          className={`p-2 rounded-lg border transition-all ${isRotating ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' : 'border-slate-700/40 bg-slate-900/60 text-slate-500'}`}
          title="Toggle auto-rotate"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={resetCamera}
          className="p-2 rounded-lg border border-slate-700/40 bg-slate-900/60 text-slate-500 hover:text-white hover:border-slate-600 transition-all"
          title="Reset camera"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Interaction Guide */}
      <div className="absolute top-20 left-4 z-10">
        <div className="px-3 py-2 rounded-lg border border-slate-700/30 bg-slate-900/70 backdrop-blur-sm space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <MousePointer className="w-3 h-3" />
            <span>Click domain to inspect</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Hand className="w-3 h-3" />
            <span>Drag to orbit / Scroll to zoom</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <ZoomIn className="w-3 h-3" />
            <span>Double-click to focus</span>
          </div>
        </div>
      </div>

      {/* Domain Hover Tooltip */}
      {hoveredDomain && !selectedDomain && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
          <div className="px-4 py-3 rounded-xl border bg-slate-900/90 backdrop-blur-md" style={{ borderColor: `${hoveredDomain.color}40` }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hoveredDomain.color }} />
              <span className="text-sm font-bold text-white">{hoveredDomain.name}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{hoveredDomain.description}</div>
            <div className="flex gap-4 mt-2 text-[10px]">
              <span className="text-slate-400">Health: <span className="text-white font-bold">{hoveredDomain.health}%</span></span>
              <span className="text-slate-400">Attacks: <span className="text-red-400 font-bold">{hoveredDomain.attacks}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Domain Detail Panel */}
      {selectedDomain && (
        <div className="absolute bottom-20 left-4 right-4 z-10">
          <div className="max-w-md rounded-xl border bg-slate-900/90 backdrop-blur-md p-4" style={{ borderColor: `${selectedDomain.color}40` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedDomain.color, boxShadow: `0 0 10px ${selectedDomain.color}60` }} />
                <span className="text-base font-bold text-white">{selectedDomain.name} Domain</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selectedDomain.active ? 'bg-green-500/10 text-green-400' : 'bg-slate-700/50 text-slate-500'}`}>
                  {selectedDomain.active ? 'ACTIVE' : 'DORMANT'}
                </span>
              </div>
              <button onClick={() => { setSelectedDomain(null); selectedIdxRef.current = -1; }} className="text-slate-500 hover:text-white text-xs">
                Close
              </button>
            </div>
            <div className="text-xs text-slate-400 mb-3">{selectedDomain.description}</div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-black text-white">{selectedDomain.health}%</div>
                <div className="text-[9px] text-slate-500 uppercase">Health</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-black" style={{ color: selectedDomain.pressure > 70 ? '#ef4444' : selectedDomain.pressure > 40 ? '#f59e0b' : '#10b981' }}>{selectedDomain.pressure}%</div>
                <div className="text-[9px] text-slate-500 uppercase">Pressure</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-black text-red-400">{selectedDomain.attacks}</div>
                <div className="text-[9px] text-slate-500 uppercase">Attacks</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-black text-cyan-400">{100 - selectedDomain.pressure}%</div>
                <div className="text-[9px] text-slate-500 uppercase">Capacity</div>
              </div>
            </div>
            {/* Health bar */}
            <div className="mt-3">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${selectedDomain.health}%`,
                  backgroundColor: selectedDomain.health > 70 ? '#10b981' : selectedDomain.health > 40 ? '#f59e0b' : '#ef4444'
                }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Threat Actor Card */}
      <div className="absolute bottom-20 right-4 z-10 w-52">
        <div className="rounded-xl border border-red-500/20 bg-slate-900/80 backdrop-blur-md p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Crosshair className="w-3 h-3 text-red-400" />
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Threat Actor</span>
          </div>
          <div className="text-sm font-bold text-white">APT-29 (Cozy Bear)</div>
          <div className="flex items-center gap-2 mt-1.5 mb-1">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: '92%' }} />
            </div>
            <span className="text-[10px] font-bold text-red-400">92%</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Objective: <span className="text-amber-400 font-medium">Data Exfiltration</span>
          </div>
        </div>
      </div>

      {/* Missing Events Alert */}
      <div className="absolute left-4 bottom-[180px] z-10">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Missing Signals</span>
        </div>
        <div className="space-y-1">
          {[
            { domain: 'Identity', event: 'MFA Challenge' },
            { domain: 'Endpoint', event: 'EDR Heartbeat' },
            { domain: 'Data', event: 'DLP Confirmation' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded border border-red-500/20 bg-slate-900/60 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <div>
                <div className="text-[9px] font-medium text-red-300">{item.event}</div>
                <div className="text-[8px] text-slate-600">{item.domain}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Severity Selector */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700/30 bg-slate-900/70 backdrop-blur-sm">
        {(['normal', 'elevated', 'high', 'critical'] as SeverityLevel[]).map((s) => {
          const c = getSeverityConfig(s);
          return (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
                severity === s
                  ? 'bg-white/10 scale-105 shadow-lg'
                  : 'opacity-50 hover:opacity-100'
              }`}
              style={{ color: c.hex, borderBottom: severity === s ? `2px solid ${c.hex}` : 'none' }}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Domain Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {DOMAINS.map(d => (
            <div key={d.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color, opacity: d.active ? 1 : 0.4 }} />
              <span className="text-[8px] text-slate-500 font-medium">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AttackUniverse;
