import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { Crosshair, Maximize2, Minimize2, Video, VideoOff, RotateCcw, Hand } from 'lucide-react';

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
  { from: 0, to: 1 }, { from: 1, to: 4 }, { from: 4, to: 5 }, { from: 0, to: 4 }, { from: 2, to: 1 },
];

function getSeverityConfig(s: SeverityLevel) {
  switch (s) {
    case 'normal': return { color: new THREE.Color('#10b981'), hex: '#10b981' };
    case 'elevated': return { color: new THREE.Color('#f59e0b'), hex: '#f59e0b' };
    case 'high': return { color: new THREE.Color('#f97316'), hex: '#f97316' };
    case 'critical': return { color: new THREE.Color('#ef4444'), hex: '#ef4444' };
  }
}

const AttackUniverse = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const handTrackingActiveRef = useRef(false);
  const handAnimFrameRef = useRef<number>(0);

  const sceneDataRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    coreMesh: THREE.Mesh;
    coreGlow: THREE.Mesh;
    domainMeshes: THREE.Mesh[];
    domainRings: THREE.Mesh[];
    flowParticles: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    clock: THREE.Clock;
    animId: number;
  } | null>(null);

  const [severity, setSeverity] = useState<SeverityLevel>('critical');
  const [selectedDomain, setSelectedDomain] = useState<DomainData | null>(null);
  const [hoveredDomain, setHoveredDomain] = useState<DomainData | null>(null);
  const [coreEnergy, setCoreEnergy] = useState(85);
  const [totalAttacks, setTotalAttacks] = useState(97);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handTrackingOn, setHandTrackingOn] = useState(false);
  const [handGesture, setHandGesture] = useState<string>('');
  const [handPosition, setHandPosition] = useState<{ x: number; y: number } | null>(null);
  const [isPinching, setIsPinching] = useState(false);

  const severityRef = useRef(severity);
  const selectedIdxRef = useRef(-1);

  useEffect(() => { severityRef.current = severity; }, [severity]);

  // Initialize MediaPipe Hand Landmarker
  const initHandTracking = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
          delegate: 'GPU',
        },
        numHands: 2,
        runningMode: 'VIDEO',
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      handLandmarkerRef.current = handLandmarker;
      return true;
    } catch (e) {
      console.error('Hand tracking init failed:', e);
      return false;
    }
  }, []);

  // Start webcam
  const startHandTracking = useCallback(async () => {
    if (!videoRef.current) return;

    const success = await initHandTracking();
    if (!success) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      handTrackingActiveRef.current = true;
      setHandTrackingOn(true);
      detectHands();
    } catch (e) {
      console.error('Webcam access failed:', e);
    }
  }, [initHandTracking]);

  // Stop webcam
  const stopHandTracking = useCallback(() => {
    handTrackingActiveRef.current = false;
    setHandTrackingOn(false);
    setHandGesture('');
    setHandPosition(null);
    setIsPinching(false);
    cancelAnimationFrame(handAnimFrameRef.current);

    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // Hand detection loop
  const detectHands = useCallback(() => {
    if (!handTrackingActiveRef.current || !videoRef.current || !handLandmarkerRef.current) return;
    if (videoRef.current.readyState < 2) {
      handAnimFrameRef.current = requestAnimationFrame(detectHands);
      return;
    }

    const results: HandLandmarkerResult = handLandmarkerRef.current.detectForVideo(
      videoRef.current,
      performance.now()
    );

    processHandResults(results);
    drawHandOverlay(results);

    handAnimFrameRef.current = requestAnimationFrame(detectHands);
  }, []);

  // Process hand landmarks into gestures
  const processHandResults = useCallback((results: HandLandmarkerResult) => {
    if (!results.landmarks || results.landmarks.length === 0) {
      setHandGesture('');
      setHandPosition(null);
      setIsPinching(false);
      return;
    }

    const hand = results.landmarks[0];
    // Index finger tip (8) and thumb tip (4)
    const indexTip = hand[8];
    const thumbTip = hand[4];
    const wrist = hand[0];
    const middleTip = hand[12];

    // Palm center approximation
    const palmX = (hand[0].x + hand[5].x + hand[17].x) / 3;
    const palmY = (hand[0].y + hand[5].y + hand[17].y) / 3;

    // Mirror X for natural interaction
    setHandPosition({ x: 1 - palmX, y: palmY });

    // Pinch detection (thumb-index distance)
    const pinchDist = Math.sqrt(
      (thumbTip.x - indexTip.x) ** 2 +
      (thumbTip.y - indexTip.y) ** 2 +
      (thumbTip.z - indexTip.z) ** 2
    );

    const pinching = pinchDist < 0.06;
    setIsPinching(pinching);

    // Gesture classification
    const fingersExtended = [
      hand[8].y < hand[6].y, // Index
      hand[12].y < hand[10].y, // Middle
      hand[16].y < hand[14].y, // Ring
      hand[20].y < hand[18].y, // Pinky
    ];
    const extendedCount = fingersExtended.filter(Boolean).length;

    if (pinching) {
      setHandGesture('PINCH - Select');
    } else if (extendedCount === 0) {
      setHandGesture('FIST - Grab');
    } else if (extendedCount === 4) {
      setHandGesture('OPEN - Navigate');
    } else if (extendedCount === 1 && fingersExtended[0]) {
      setHandGesture('POINT - Target');
    } else if (extendedCount === 2 && fingersExtended[0] && fingersExtended[1]) {
      setHandGesture('PEACE - Zoom');
    } else {
      setHandGesture('TRACKING');
    }

    // Apply hand position to 3D scene
    if (sceneDataRef.current) {
      const { controls, camera, domainMeshes, raycaster } = sceneDataRef.current;

      if (pinching) {
        // Pinch = select nearest domain
        const handVec = new THREE.Vector2((1 - palmX) * 2 - 1, -(palmY * 2 - 1));
        raycaster.setFromCamera(handVec, camera);
        const intersects = raycaster.intersectObjects(domainMeshes);
        if (intersects.length > 0) {
          const idx = intersects[0].object.userData.domainIdx;
          setSelectedDomain(DOMAINS[idx]);
          selectedIdxRef.current = idx;
        }
      } else if (extendedCount === 4) {
        // Open hand = orbit the scene based on hand position
        const dx = ((1 - palmX) - 0.5) * 4;
        const dy = (palmY - 0.5) * 2;
        controls.autoRotateSpeed = dx;
        camera.position.y += (dy * 3 + 1 - camera.position.y) * 0.03;
      } else if (extendedCount === 0) {
        // Fist = stop rotation
        controls.autoRotateSpeed = 0;
      }
    }
  }, []);

  // Draw hand landmarks overlay (Minority Report style)
  const drawHandOverlay = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.landmarks || results.landmarks.length === 0) return;

    results.landmarks.forEach((hand, handIdx) => {
      const color = handIdx === 0 ? '#06b6d4' : '#f59e0b';

      // Draw connections (Minority Report style glowing lines)
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
      ];

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;

      connections.forEach(([start, end]) => {
        const s = hand[start];
        const e = hand[end];
        ctx.beginPath();
        ctx.moveTo((1 - s.x) * canvas.width, s.y * canvas.height);
        ctx.lineTo((1 - e.x) * canvas.width, e.y * canvas.height);
        ctx.stroke();
      });

      // Draw landmarks as glowing dots
      hand.forEach((landmark, i) => {
        const x = (1 - landmark.x) * canvas.width;
        const y = landmark.y * canvas.height;
        const size = [4, 8].includes(i) ? 6 : 3;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? '#ffffff' : color;
        ctx.fill();

        // Outer glow for fingertips
        if ([4, 8, 12, 16, 20].includes(i)) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}60`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Draw pinch indicator
      const thumbTip = hand[4];
      const indexTip = hand[8];
      const dist = Math.sqrt((thumbTip.x - indexTip.x) ** 2 + (thumbTip.y - indexTip.y) ** 2);
      if (dist < 0.08) {
        const cx = ((1 - thumbTip.x) + (1 - indexTip.x)) / 2 * canvas.width;
        const cy = (thumbTip.y + indexTip.y) / 2 * canvas.height;
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15;
        ctx.stroke();
      }
    });

    ctx.shadowBlur = 0;
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // 3D Scene setup
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030810');

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 2.5, 6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.7;
    controls.minDistance = 3;
    controls.maxDistance = 14;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.target.set(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0x1a2040, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.25);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    const sevConfig = getSeverityConfig(severityRef.current);

    // Core sphere
    const coreGeo = new THREE.SphereGeometry(0.65, 64, 64);
    const coreMat = new THREE.MeshPhongMaterial({
      color: sevConfig.color, emissive: sevConfig.color, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9, shininess: 120,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Core glow
    const glowGeo = new THREE.SphereGeometry(0.85, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: sevConfig.color, transparent: true, opacity: 0.12, side: THREE.BackSide,
    });
    const coreGlow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(coreGlow);

    const coreLight = new THREE.PointLight(sevConfig.color.getHex(), 2.5, 6);
    scene.add(coreLight);

    // Domain nodes
    const domainMeshes: THREE.Mesh[] = [];
    const domainRings: THREE.Mesh[] = [];
    const orbitRadius = 2.8;

    DOMAINS.forEach((domain, idx) => {
      const angle = (idx / DOMAINS.length) * Math.PI * 2;
      const nodeSize = domain.active ? 0.22 + (domain.pressure / 600) : 0.15;

      const geo = new THREE.SphereGeometry(nodeSize, 32, 32);
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(domain.color),
        emissive: new THREE.Color(domain.color),
        emissiveIntensity: domain.active ? 0.4 : 0.1,
        transparent: true, opacity: domain.active ? 0.95 : 0.5, shininess: 60,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        Math.cos(angle) * orbitRadius,
        Math.sin(angle * 0.5) * 0.3,
        Math.sin(angle) * orbitRadius
      );
      mesh.userData = { domainIdx: idx, baseY: mesh.position.y };
      scene.add(mesh);
      domainMeshes.push(mesh);

      // Selection ring
      const ringGeo = new THREE.RingGeometry(nodeSize * 1.5, nodeSize * 1.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(domain.color), transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(mesh.position);
      scene.add(ring);
      domainRings.push(ring);

      if (domain.active) {
        const light = new THREE.PointLight(new THREE.Color(domain.color).getHex(), 0.3, 1.8);
        light.position.copy(mesh.position);
        scene.add(light);
      }
    });

    // Orbit ring
    const orbitCurve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, Math.PI * 2, false, 0);
    const orbitPts = orbitCurve.getPoints(120).map(p => new THREE.Vector3(p.x, 0, p.y));
    const orbitLineGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    scene.add(new THREE.Line(orbitLineGeo, new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.3 })));

    // Flow lines & particles
    const flowParticles: THREE.Mesh[] = [];
    ATTACK_FLOWS.forEach((flow) => {
      const fromPos = domainMeshes[flow.from].position;
      const toPos = domainMeshes[flow.to].position;
      const mid = new THREE.Vector3(
        (fromPos.x + toPos.x) / 2, (fromPos.y + toPos.y) / 2 + 0.4, (fromPos.z + toPos.z) / 2
      );
      const curve = new THREE.QuadraticBezierCurve3(fromPos.clone(), mid, toPos.clone());
      const pts = curve.getPoints(40);
      const flowGeo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(flowGeo, new THREE.LineBasicMaterial({
        color: new THREE.Color(DOMAINS[flow.from].color), transparent: true, opacity: 0.2,
      })));

      const pGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(DOMAINS[flow.from].color), transparent: true, opacity: 0.9 });
      const particle = new THREE.Mesh(pGeo, pMat);
      particle.userData = { curve, progress: Math.random() };
      scene.add(particle);
      flowParticles.push(particle);
    });

    // Starfield
    const starCount = 600;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 35;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 35;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x334455, size: 0.025, transparent: true, opacity: 0.5 })));

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    const clock = new THREE.Clock();
    let hoveredIdx = -1;

    sceneDataRef.current = {
      scene, camera, renderer, controls, coreMesh, coreGlow,
      domainMeshes, domainRings, flowParticles, raycaster, clock, animId: 0,
    };

    // Mouse events
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const click = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(click, camera);
      const hits = raycaster.intersectObjects(domainMeshes);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.domainIdx;
        if (selectedIdxRef.current === idx) {
          setSelectedDomain(null);
          selectedIdxRef.current = -1;
        } else {
          setSelectedDomain(DOMAINS[idx]);
          selectedIdxRef.current = idx;
        }
      }
    };
    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const dbl = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(dbl, camera);
      const hits = raycaster.intersectObjects(domainMeshes);
      if (hits.length > 0) controls.target.copy(hits[0].object.position);
      else controls.target.set(0, 0, 0);
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);
    container.addEventListener('dblclick', onDblClick);

    // Animate
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      controls.update();

      const pulse = 1 + Math.sin(elapsed * 2) * 0.04;
      coreMesh.scale.setScalar(pulse);
      coreGlow.scale.setScalar(pulse * 1.15);
      coreMesh.rotation.y += 0.004;

      const sev = getSeverityConfig(severityRef.current);
      (coreMesh.material as THREE.MeshPhongMaterial).color.lerp(sev.color, 0.02);
      (coreMesh.material as THREE.MeshPhongMaterial).emissive.lerp(sev.color, 0.02);
      (coreGlow.material as THREE.MeshBasicMaterial).color.lerp(sev.color, 0.02);
      coreLight.color.lerp(sev.color, 0.02);

      domainMeshes.forEach((mesh, idx) => {
        mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 0.7 + idx) * 0.08;
        mesh.rotation.y += 0.006;
        domainRings[idx].position.copy(mesh.position);
        domainRings[idx].lookAt(camera.position);
      });

      // Hover via mouse
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(domainMeshes);
      const newHover = hits.length > 0 ? hits[0].object.userData.domainIdx : -1;
      if (newHover !== hoveredIdx) {
        if (hoveredIdx >= 0) {
          (domainRings[hoveredIdx].material as THREE.MeshBasicMaterial).opacity = 0;
          domainMeshes[hoveredIdx].scale.setScalar(1);
          setHoveredDomain(null);
        }
        if (newHover >= 0) {
          (domainRings[newHover].material as THREE.MeshBasicMaterial).opacity = 0.5;
          domainMeshes[newHover].scale.setScalar(1.25);
          setHoveredDomain(DOMAINS[newHover]);
          renderer.domElement.style.cursor = 'pointer';
        } else {
          renderer.domElement.style.cursor = 'grab';
        }
        hoveredIdx = newHover;
      }

      // Selected highlight
      domainRings.forEach((ring, idx) => {
        if (idx === selectedIdxRef.current) {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(elapsed * 3) * 0.2;
          ring.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.1);
        } else if (idx !== hoveredIdx) {
          (ring.material as THREE.MeshBasicMaterial).opacity = 0;
          ring.scale.setScalar(1);
        }
      });

      flowParticles.forEach((p) => {
        p.userData.progress += 0.004;
        if (p.userData.progress > 1) p.userData.progress = 0;
        p.position.copy(p.userData.curve.getPoint(p.userData.progress));
      });

      renderer.render(scene, camera);
      sceneDataRef.current!.animId = requestAnimationFrame(animate);
    };
    sceneDataRef.current.animId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const dataInt = setInterval(() => {
      setCoreEnergy(prev => Math.max(60, Math.min(100, prev + (Math.random() - 0.45) * 3)));
      setTotalAttacks(prev => prev + (Math.random() > 0.6 ? 1 : 0));
    }, 4000);

    return () => {
      cancelAnimationFrame(sceneDataRef.current?.animId || 0);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      container.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('resize', onResize);
      clearInterval(dataInt);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      sceneDataRef.current = null;
    };
  }, []);

  // Resize on fullscreen change
  useEffect(() => {
    setTimeout(() => {
      if (sceneDataRef.current && containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        sceneDataRef.current.camera.aspect = w / h;
        sceneDataRef.current.camera.updateProjectionMatrix();
        sceneDataRef.current.renderer.setSize(w, h);
      }
    }, 50);
  }, [isFullscreen]);

  const sevConfig = getSeverityConfig(severity);

  return (
    <div
      className={`relative rounded-2xl border border-slate-700/40 bg-[#030810] overflow-hidden transition-all duration-500 ${
        isFullscreen ? 'fixed inset-0 z-[9999] rounded-none border-none' : 'w-full'
      }`}
      style={{ height: isFullscreen ? '100vh' : '640px' }}
    >
      {/* Three.js Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Hand Tracking Overlay Canvas */}
      <canvas
        ref={canvasOverlayRef}
        width={640}
        height={480}
        className={`absolute inset-0 w-full h-full pointer-events-none z-20 ${handTrackingOn ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Hidden video element for webcam */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Webcam PIP Feed */}
      {handTrackingOn && (
        <div className="absolute bottom-24 right-4 z-30 w-48 h-36 rounded-lg border-2 border-cyan-500/50 overflow-hidden shadow-lg shadow-cyan-500/20">
          <video
            ref={el => {
              if (el && videoRef.current?.srcObject) {
                el.srcObject = videoRef.current.srcObject;
                el.play();
              }
            }}
            className="w-full h-full object-cover transform scale-x-[-1]"
            playsInline
            muted
            autoPlay
          />
          <div className="absolute inset-0 border-2 border-cyan-400/20 rounded-lg pointer-events-none" />
          <div className="absolute top-1 left-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[8px] text-cyan-400 font-bold uppercase">LIVE</span>
          </div>
        </div>
      )}

      {/* Hand Gesture HUD */}
      {handTrackingOn && handGesture && (
        <div className="absolute top-1/2 left-8 -translate-y-1/2 z-30">
          <div className="px-4 py-3 rounded-xl border border-cyan-500/30 bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-1">
              <Hand className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Gesture</span>
            </div>
            <div className="text-sm font-bold text-white">{handGesture}</div>
            {isPinching && (
              <div className="mt-1 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                <span className="text-[10px] text-red-400 font-bold">SELECTING</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hand cursor indicator in 3D space */}
      {handTrackingOn && handPosition && (
        <div
          className="absolute z-25 pointer-events-none transition-all duration-75"
          style={{
            left: `${handPosition.x * 100}%`,
            top: `${handPosition.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className={`w-8 h-8 rounded-full border-2 ${isPinching ? 'border-red-400 bg-red-400/20 scale-75' : 'border-cyan-400 bg-cyan-400/10'} transition-all duration-150`} />
          <div className={`absolute inset-0 w-8 h-8 rounded-full ${isPinching ? 'border border-red-400/40' : 'border border-cyan-400/30'} animate-ping`} />
        </div>
      )}

      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-4 bg-gradient-to-b from-[#030810]/95 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: sevConfig.hex, boxShadow: `0 0 8px ${sevConfig.hex}` }} />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Attack Universe</h2>
              {handTrackingOn && (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 uppercase">
                  Hand Control Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {handTrackingOn ? 'Use hand gestures to navigate - Open palm to orbit, Pinch to select' : 'Drag to orbit - Click domains to inspect - Scroll to zoom'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase">Status</div>
              <div className="text-lg font-black" style={{ color: sevConfig.hex }}>{severity.toUpperCase()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase">Attacks</div>
              <div className="text-lg font-black text-white">{totalAttacks}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase">Energy</div>
              <div className="text-lg font-black text-cyan-400">{coreEnergy}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="absolute top-20 right-4 z-30 flex flex-col gap-2">
        <button
          onClick={toggleFullscreen}
          className="p-2.5 rounded-lg border border-slate-600/40 bg-slate-900/70 text-slate-400 hover:text-white hover:border-white/20 transition-all backdrop-blur-sm"
          title={isFullscreen ? 'Exit fullscreen' : 'Maximize'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={handTrackingOn ? stopHandTracking : startHandTracking}
          className={`p-2.5 rounded-lg border transition-all backdrop-blur-sm ${
            handTrackingOn
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/20'
              : 'border-slate-600/40 bg-slate-900/70 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
          }`}
          title={handTrackingOn ? 'Disable hand tracking' : 'Enable hand tracking (webcam)'}
        >
          {handTrackingOn ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>
        <button
          onClick={() => {
            if (sceneDataRef.current) {
              sceneDataRef.current.controls.target.set(0, 0, 0);
              sceneDataRef.current.camera.position.set(0, 2.5, 6.5);
            }
          }}
          className="p-2.5 rounded-lg border border-slate-600/40 bg-slate-900/70 text-slate-400 hover:text-white hover:border-white/20 transition-all backdrop-blur-sm"
          title="Reset camera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Hover Tooltip */}
      {hoveredDomain && !selectedDomain && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[120%] z-10 pointer-events-none">
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

      {/* Selected Domain Panel */}
      {selectedDomain && (
        <div className="absolute bottom-20 left-4 z-10 max-w-sm">
          <div className="rounded-xl border bg-slate-900/90 backdrop-blur-md p-4" style={{ borderColor: `${selectedDomain.color}40` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedDomain.color, boxShadow: `0 0 10px ${selectedDomain.color}60` }} />
                <span className="text-base font-bold text-white">{selectedDomain.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selectedDomain.active ? 'bg-green-500/10 text-green-400' : 'bg-slate-700/50 text-slate-500'}`}>
                  {selectedDomain.active ? 'ACTIVE' : 'DORMANT'}
                </span>
              </div>
              <button onClick={() => { setSelectedDomain(null); selectedIdxRef.current = -1; }} className="text-slate-500 hover:text-white text-xs px-2 py-1 rounded border border-slate-700/40 hover:border-white/20 transition-all">ESC</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center"><div className="text-lg font-black text-white">{selectedDomain.health}%</div><div className="text-[9px] text-slate-500 uppercase">Health</div></div>
              <div className="text-center"><div className="text-lg font-black" style={{ color: selectedDomain.pressure > 70 ? '#ef4444' : '#f59e0b' }}>{selectedDomain.pressure}%</div><div className="text-[9px] text-slate-500 uppercase">Pressure</div></div>
              <div className="text-center"><div className="text-lg font-black text-red-400">{selectedDomain.attacks}</div><div className="text-[9px] text-slate-500 uppercase">Attacks</div></div>
              <div className="text-center"><div className="text-lg font-black text-cyan-400">{100 - selectedDomain.pressure}%</div><div className="text-[9px] text-slate-500 uppercase">Capacity</div></div>
            </div>
            <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${selectedDomain.health}%`, backgroundColor: selectedDomain.health > 70 ? '#10b981' : selectedDomain.health > 40 ? '#f59e0b' : '#ef4444' }} />
            </div>
          </div>
        </div>
      )}

      {/* Threat Actor */}
      <div className="absolute bottom-20 right-4 z-10 w-48">
        <div className="rounded-xl border border-red-500/20 bg-slate-900/80 backdrop-blur-md p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Crosshair className="w-3 h-3 text-red-400" />
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Threat Actor</span>
          </div>
          <div className="text-sm font-bold text-white">APT-29 (Cozy Bear)</div>
          <div className="flex items-center gap-2 mt-1 mb-1">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: '92%' }} />
            </div>
            <span className="text-[10px] font-bold text-red-400">92%</span>
          </div>
        </div>
      </div>

      {/* Severity Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/30 bg-slate-900/70 backdrop-blur-sm">
        {(['normal', 'elevated', 'high', 'critical'] as SeverityLevel[]).map((s) => {
          const c = getSeverityConfig(s);
          return (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                severity === s ? 'bg-white/10 scale-105' : 'opacity-50 hover:opacity-100'
              }`}
              style={{ color: c.hex }}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Domain Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-x-3 gap-y-1">
        {DOMAINS.map(d => (
          <div key={d.id} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color, opacity: d.active ? 1 : 0.4 }} />
            <span className="text-[8px] text-slate-500 font-medium">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AttackUniverse;
