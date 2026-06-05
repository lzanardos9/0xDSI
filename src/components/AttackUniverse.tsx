import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { Crosshair, Maximize2, Minimize2, Video, VideoOff, RotateCcw, Hand, Zap, Link2, Target } from 'lucide-react';

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

interface InvestigationLink {
  fromIdx: number;
  toIdx: number;
  timestamp: number;
  strength: number;
}

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
    laserLine: THREE.Line;
    shockwaveRing: THREE.Mesh;
    investigationLines: THREE.Line[];
    raycaster: THREE.Raycaster;
    clock: THREE.Clock;
    animId: number;
  } | null>(null);

  // Hand physics state
  const prevHandPosRef = useRef<{ x: number; y: number } | null>(null);
  const handVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const grabbedDomainRef = useRef<number>(-1);
  const grabbedOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const domainOrigPosRef = useRef<THREE.Vector3[]>([]);
  const domainDisplaceRef = useRef<THREE.Vector3[]>([]);
  const prevTwoHandDistRef = useRef<number>(0);
  const linkStartRef = useRef<number>(-1);
  const shockwaveTimeRef = useRef<number>(0);
  const prevBothHandsDistRef = useRef<number>(999);

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
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isBeaming, setIsBeaming] = useState(false);
  const [investigationLinks, setInvestigationLinks] = useState<InvestigationLink[]>([]);
  const [shockwaveActive, setShockwaveActive] = useState(false);
  const [twoHandsDetected, setTwoHandsDetected] = useState(false);
  const [showGestureTutorial, setShowGestureTutorial] = useState(true);

  const severityRef = useRef(severity);
  const selectedIdxRef = useRef(-1);

  useEffect(() => { severityRef.current = severity; }, [severity]);

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
      setShowGestureTutorial(true);
      setTimeout(() => setShowGestureTutorial(false), 8000);
      detectHands();
    } catch (e) {
      console.error('Webcam access failed:', e);
    }
  }, [initHandTracking]);

  const stopHandTracking = useCallback(() => {
    handTrackingActiveRef.current = false;
    setHandTrackingOn(false);
    setHandGesture('');
    setHandPosition(null);
    setIsPinching(false);
    setIsGrabbing(false);
    setIsBeaming(false);
    setTwoHandsDetected(false);
    grabbedDomainRef.current = -1;
    cancelAnimationFrame(handAnimFrameRef.current);
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const detectHands = useCallback(() => {
    if (!handTrackingActiveRef.current || !videoRef.current || !handLandmarkerRef.current) return;
    if (videoRef.current.readyState < 2) {
      handAnimFrameRef.current = requestAnimationFrame(detectHands);
      return;
    }
    const results: HandLandmarkerResult = handLandmarkerRef.current.detectForVideo(
      videoRef.current, performance.now()
    );
    processHandResults(results);
    drawHandOverlay(results);
    handAnimFrameRef.current = requestAnimationFrame(detectHands);
  }, []);

  const processHandResults = useCallback((results: HandLandmarkerResult) => {
    if (!results.landmarks || results.landmarks.length === 0) {
      setHandGesture('');
      setHandPosition(null);
      setIsPinching(false);
      setIsGrabbing(false);
      setIsBeaming(false);
      setTwoHandsDetected(false);
      grabbedDomainRef.current = -1;
      prevHandPosRef.current = null;
      return;
    }

    const hand1 = results.landmarks[0];
    const hasTwoHands = results.landmarks.length >= 2;
    setTwoHandsDetected(hasTwoHands);

    const indexTip = hand1[8];
    const thumbTip = hand1[4];
    const palmX = (hand1[0].x + hand1[5].x + hand1[17].x) / 3;
    const palmY = (hand1[0].y + hand1[5].y + hand1[17].y) / 3;
    const mirroredX = 1 - palmX;

    // Track velocity
    if (prevHandPosRef.current) {
      handVelocityRef.current = {
        x: mirroredX - prevHandPosRef.current.x,
        y: palmY - prevHandPosRef.current.y,
      };
    }
    prevHandPosRef.current = { x: mirroredX, y: palmY };
    setHandPosition({ x: mirroredX, y: palmY });

    // Pinch detection
    const pinchDist = Math.sqrt(
      (thumbTip.x - indexTip.x) ** 2 +
      (thumbTip.y - indexTip.y) ** 2 +
      (thumbTip.z - indexTip.z) ** 2
    );
    const pinching = pinchDist < 0.06;
    setIsPinching(pinching);

    // Finger extension
    const fingersExtended = [
      hand1[8].y < hand1[6].y,
      hand1[12].y < hand1[10].y,
      hand1[16].y < hand1[14].y,
      hand1[20].y < hand1[18].y,
    ];
    const extendedCount = fingersExtended.filter(Boolean).length;

    // TWO-HAND ZOOM
    if (hasTwoHands) {
      const hand2 = results.landmarks[1];
      const palm2X = (hand2[0].x + hand2[5].x + hand2[17].x) / 3;
      const palm2Y = (hand2[0].y + hand2[5].y + hand2[17].y) / 3;
      const dist = Math.sqrt((palmX - palm2X) ** 2 + (palmY - palm2Y) ** 2);

      // SHOCKWAVE CLAP detection
      if (prevBothHandsDistRef.current > 0.15 && dist < 0.08) {
        triggerShockwave();
      }
      prevBothHandsDistRef.current = dist;

      // Two-hand zoom
      if (prevTwoHandDistRef.current > 0 && sceneDataRef.current) {
        const delta = dist - prevTwoHandDistRef.current;
        const zoomSpeed = delta * 15;
        sceneDataRef.current.camera.position.multiplyScalar(1 - zoomSpeed);
        const minD = 3;
        const maxD = 14;
        const camDist = sceneDataRef.current.camera.position.length();
        if (camDist < minD) sceneDataRef.current.camera.position.setLength(minD);
        if (camDist > maxD) sceneDataRef.current.camera.position.setLength(maxD);
      }
      prevTwoHandDistRef.current = dist;
      setHandGesture('TWO-HAND ZOOM');
      return;
    } else {
      prevTwoHandDistRef.current = 0;
      prevBothHandsDistRef.current = 999;
    }

    // GESTURE CLASSIFICATION & DOMAIN INTERACTION
    if (!sceneDataRef.current) return;
    const { controls, camera, domainMeshes, raycaster, laserLine } = sceneDataRef.current;
    const handVec = new THREE.Vector2(mirroredX * 2 - 1, -(palmY * 2 - 1));

    if (extendedCount === 1 && fingersExtended[0] && !pinching) {
      // POINT = Energy Beam
      setHandGesture('BEAM - Targeting');
      setIsBeaming(true);
      setIsGrabbing(false);
      grabbedDomainRef.current = -1;

      const fingerTipX = 1 - indexTip.x;
      const fingerTipY = indexTip.y;
      const fingerVec = new THREE.Vector2(fingerTipX * 2 - 1, -(fingerTipY * 2 - 1));
      raycaster.setFromCamera(fingerVec, camera);

      const beamOrigin = new THREE.Vector3(fingerVec.x * 3, fingerVec.y * 3, 4).unproject(camera);
      const intersects = raycaster.intersectObjects(domainMeshes);

      const positions = laserLine.geometry.attributes.position;
      if (intersects.length > 0) {
        const target = intersects[0].point;
        positions.setXYZ(0, beamOrigin.x, beamOrigin.y, beamOrigin.z);
        positions.setXYZ(1, target.x, target.y, target.z);
        (laserLine.material as THREE.LineBasicMaterial).opacity = 0.9;

        const hitIdx = intersects[0].object.userData.domainIdx;
        setHoveredDomain(DOMAINS[hitIdx]);
      } else {
        const farPoint = raycaster.ray.at(10, new THREE.Vector3());
        positions.setXYZ(0, beamOrigin.x, beamOrigin.y, beamOrigin.z);
        positions.setXYZ(1, farPoint.x, farPoint.y, farPoint.z);
        (laserLine.material as THREE.LineBasicMaterial).opacity = 0.3;
      }
      positions.needsUpdate = true;
      laserLine.visible = true;

    } else if (extendedCount === 0) {
      // FIST = Grab & Drag
      setIsBeaming(false);
      laserLine.visible = false;

      if (grabbedDomainRef.current === -1) {
        raycaster.setFromCamera(handVec, camera);
        const intersects = raycaster.intersectObjects(domainMeshes);
        if (intersects.length > 0) {
          const idx = intersects[0].object.userData.domainIdx;
          grabbedDomainRef.current = idx;
          setIsGrabbing(true);
          setHandGesture('GRAB - Dragging');
          controls.enabled = false;
        } else {
          setHandGesture('FIST - Ready');
          setIsGrabbing(false);
        }
      } else {
        setHandGesture('GRAB - Dragging');
        const vel = handVelocityRef.current;
        const displacement = domainDisplaceRef.current[grabbedDomainRef.current] || new THREE.Vector3();
        displacement.x += vel.x * 8;
        displacement.y -= vel.y * 5;
        domainDisplaceRef.current[grabbedDomainRef.current] = displacement;
      }

    } else if (extendedCount === 4) {
      // OPEN PALM = Force Push/Pull
      setIsBeaming(false);
      laserLine.visible = false;
      setIsGrabbing(false);

      if (grabbedDomainRef.current >= 0) {
        grabbedDomainRef.current = -1;
        controls.enabled = true;
      }

      const vel = handVelocityRef.current;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

      if (speed > 0.015) {
        setHandGesture('FORCE PUSH');
        // Push all domains away from hand position
        domainMeshes.forEach((mesh, idx) => {
          const meshScreen = mesh.position.clone().project(camera);
          const dx = meshScreen.x - handVec.x;
          const dy = meshScreen.y - handVec.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1.5) {
            const force = (1.5 - dist) * speed * 3;
            const dir = new THREE.Vector3(dx, dy, 0).normalize();
            const displacement = domainDisplaceRef.current[idx] || new THREE.Vector3();
            displacement.add(dir.multiplyScalar(force));
            domainDisplaceRef.current[idx] = displacement;
          }
        });
      } else {
        setHandGesture('OPEN - Navigate');
        const dx = (mirroredX - 0.5) * 4;
        const dy = (palmY - 0.5) * 2;
        controls.autoRotateSpeed = dx;
        camera.position.y += (dy * 3 + 1 - camera.position.y) * 0.03;
      }

    } else if (extendedCount === 2 && fingersExtended[0] && fingersExtended[1]) {
      // PEACE = Investigation Link mode
      setIsBeaming(false);
      laserLine.visible = false;
      setIsGrabbing(false);
      setHandGesture('LINK - Connect Domains');

      if (grabbedDomainRef.current >= 0) {
        grabbedDomainRef.current = -1;
        controls.enabled = true;
      }

      raycaster.setFromCamera(handVec, camera);
      const intersects = raycaster.intersectObjects(domainMeshes);
      if (intersects.length > 0) {
        const hitIdx = intersects[0].object.userData.domainIdx;
        if (linkStartRef.current === -1) {
          linkStartRef.current = hitIdx;
          setHandGesture(`LINK - From: ${DOMAINS[hitIdx].name}`);
        } else if (linkStartRef.current !== hitIdx) {
          const newLink: InvestigationLink = {
            fromIdx: linkStartRef.current,
            toIdx: hitIdx,
            timestamp: Date.now(),
            strength: 1,
          };
          setInvestigationLinks(prev => [...prev.slice(-4), newLink]);
          addInvestigationLine3D(linkStartRef.current, hitIdx);
          linkStartRef.current = -1;
          setHandGesture('LINK - Connected!');
        }
      }

    } else if (pinching) {
      // PINCH = Select
      setIsBeaming(false);
      laserLine.visible = false;
      setIsGrabbing(false);
      setHandGesture('PINCH - Select');

      if (grabbedDomainRef.current >= 0) {
        grabbedDomainRef.current = -1;
        controls.enabled = true;
      }

      raycaster.setFromCamera(handVec, camera);
      const intersects = raycaster.intersectObjects(domainMeshes);
      if (intersects.length > 0) {
        const idx = intersects[0].object.userData.domainIdx;
        setSelectedDomain(DOMAINS[idx]);
        selectedIdxRef.current = idx;
      }
    } else {
      setIsBeaming(false);
      laserLine.visible = false;
      setIsGrabbing(false);
      setHandGesture('TRACKING');

      if (grabbedDomainRef.current >= 0) {
        grabbedDomainRef.current = -1;
        controls.enabled = true;
      }
    }
  }, []);

  const triggerShockwave = useCallback(() => {
    setShockwaveActive(true);
    shockwaveTimeRef.current = 0;
    setTimeout(() => setShockwaveActive(false), 2000);
  }, []);

  const addInvestigationLine3D = useCallback((fromIdx: number, toIdx: number) => {
    if (!sceneDataRef.current) return;
    const { scene, domainMeshes, investigationLines } = sceneDataRef.current;
    const from = domainMeshes[fromIdx].position;
    const to = domainMeshes[toIdx].position;

    const points = [];
    const segments = 30;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * 0.5;
      const z = from.z + (to.z - from.z) * t;
      points.push(new THREE.Vector3(x, y, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.8,
    });
    const line = new THREE.Line(geo, mat);
    line.userData = { createdAt: Date.now(), lifetime: 8000 };
    scene.add(line);
    investigationLines.push(line);
  }, []);

  const drawHandOverlay = useCallback((results: HandLandmarkerResult) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!results.landmarks || results.landmarks.length === 0) return;

    results.landmarks.forEach((hand, handIdx) => {
      const color = handIdx === 0 ? '#06b6d4' : '#f59e0b';
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
      ];

      // Glowing skeleton lines
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;

      connections.forEach(([start, end]) => {
        const s = hand[start];
        const e = hand[end];
        ctx.beginPath();
        ctx.moveTo((1 - s.x) * canvas.width, s.y * canvas.height);
        ctx.lineTo((1 - e.x) * canvas.width, e.y * canvas.height);
        ctx.stroke();
      });

      // Landmark dots
      hand.forEach((landmark, i) => {
        const x = (1 - landmark.x) * canvas.width;
        const y = landmark.y * canvas.height;
        const isFingertip = [4, 8, 12, 16, 20].includes(i);
        const size = isFingertip ? 6 : 3;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = isFingertip ? '#ffffff' : color;
        ctx.shadowColor = isFingertip ? '#ffffff' : color;
        ctx.shadowBlur = isFingertip ? 15 : 8;
        ctx.fill();

        if (isFingertip) {
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}50`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Pinch indicator
      const thumbTip = hand[4];
      const indexTip = hand[8];
      const dist = Math.sqrt((thumbTip.x - indexTip.x) ** 2 + (thumbTip.y - indexTip.y) ** 2);
      if (dist < 0.08) {
        const cx = ((1 - thumbTip.x) + (1 - indexTip.x)) / 2 * canvas.width;
        const cy = (thumbTip.y + indexTip.y) / 2 * canvas.height;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 20;
        ctx.stroke();
      }

      // Energy beam from index finger
      if (hand[8].y < hand[6].y && hand[12].y > hand[10].y) {
        const tipX = (1 - hand[8].x) * canvas.width;
        const tipY = hand[8].y * canvas.height;
        const gradient = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 40);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(0.5, '#06b6d440');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(tipX - 40, tipY - 40, 80, 80);
      }
    });

    // Shockwave overlay
    if (shockwaveActive) {
      const t = shockwaveTimeRef.current;
      const radius = t * canvas.width * 0.8;
      const opacity = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
      ctx.lineWidth = 4 * (1 - t);
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 30;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, radius * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${opacity * 0.5})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      shockwaveTimeRef.current += 0.02;
    }

    ctx.shadowBlur = 0;
  }, [shockwaveActive]);

  const toggleFullscreen = useCallback(() => setIsFullscreen(prev => !prev), []);

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

    const glowGeo = new THREE.SphereGeometry(0.85, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: sevConfig.color, transparent: true, opacity: 0.12, side: THREE.BackSide,
    });
    const coreGlow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(coreGlow);

    const coreLight = new THREE.PointLight(sevConfig.color.getHex(), 2.5, 6);
    scene.add(coreLight);

    // Domain nodes - Advanced 3D with layered geometry and custom shaders
    const domainMeshes: THREE.Mesh[] = [];
    const domainRings: THREE.Mesh[] = [];
    const domainExtras: { shells: THREE.Mesh[]; particles: THREE.Points; hexGrid: THREE.LineSegments; innerRing: THREE.Mesh; outerRing: THREE.Mesh; disc: THREE.Mesh }[] = [];
    const orbitRadius = 2.8;

    // Custom fresnel shader for energy shells
    const fresnelVertexShader = `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `;
    const fresnelFragmentShader = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uPressure;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float fresnel = pow(1.0 - dot(vNormal, vViewDir), 3.0);
        float pulse = 0.8 + 0.2 * sin(uTime * 2.0 + vUv.y * 6.28);
        float energyBand = smoothstep(0.4, 0.6, sin(vUv.y * 12.0 + uTime * 1.5)) * 0.3;
        float glow = fresnel * uIntensity * pulse + energyBand * uPressure;
        vec3 finalColor = uColor * (1.0 + fresnel * 2.0);
        gl_FragColor = vec4(finalColor, glow * 0.85);
      }
    `;

    // Hex grid vertex/fragment for holographic disc
    const hexDiscVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const hexDiscFragmentShader = `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float dist = length(p);
        float ring1 = smoothstep(0.02, 0.0, abs(dist - 0.6 - 0.05 * sin(uTime * 2.0)));
        float ring2 = smoothstep(0.015, 0.0, abs(dist - 0.85));
        float scanLine = smoothstep(0.01, 0.0, abs(fract(p.y * 8.0 + uTime * 0.5) - 0.5) - 0.48) * 0.3;
        float alpha = (ring1 * 0.8 + ring2 * 0.5 + scanLine) * uOpacity * smoothstep(1.0, 0.7, dist);
        gl_FragColor = vec4(uColor, alpha);
      }
    `;

    DOMAINS.forEach((domain, idx) => {
      const angle = (idx / DOMAINS.length) * Math.PI * 2;
      const nodeSize = domain.active ? 0.22 + (domain.pressure / 600) : 0.15;
      const color = new THREE.Color(domain.color);

      // Layer 1: Inner core - solid glass sphere with refraction-like effect
      const coreGeoD = new THREE.SphereGeometry(nodeSize * 0.6, 48, 48);
      const coreMatD = new THREE.MeshPhongMaterial({
        color: color.clone().multiplyScalar(0.4),
        emissive: color,
        emissiveIntensity: domain.active ? 0.8 : 0.2,
        transparent: true,
        opacity: domain.active ? 0.9 : 0.4,
        shininess: 200,
        specular: new THREE.Color(0xffffff),
      });
      const coreMeshD = new THREE.Mesh(coreGeoD, coreMatD);

      // Layer 2: Energy shell with fresnel shader
      const shellGeo = new THREE.SphereGeometry(nodeSize, 48, 48);
      const shellMat = new THREE.ShaderMaterial({
        vertexShader: fresnelVertexShader,
        fragmentShader: fresnelFragmentShader,
        uniforms: {
          uColor: { value: color },
          uTime: { value: 0 },
          uIntensity: { value: domain.active ? 1.2 : 0.4 },
          uPressure: { value: domain.pressure / 100 },
        },
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const shellMesh = new THREE.Mesh(shellGeo, shellMat);

      // Layer 3: Outer atmosphere glow
      const atmosGeo = new THREE.SphereGeometry(nodeSize * 1.4, 32, 32);
      const atmosMat = new THREE.ShaderMaterial({
        vertexShader: fresnelVertexShader,
        fragmentShader: fresnelFragmentShader,
        uniforms: {
          uColor: { value: color.clone().multiplyScalar(0.6) },
          uTime: { value: 0 },
          uIntensity: { value: domain.active ? 0.6 : 0.15 },
          uPressure: { value: domain.pressure / 200 },
        },
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);

      // Combine into group via a parent mesh (use shell as the main hittable mesh)
      const groupMesh = new THREE.Mesh(new THREE.SphereGeometry(nodeSize * 1.1, 16, 16), new THREE.MeshBasicMaterial({ visible: false }));
      groupMesh.add(coreMeshD);
      groupMesh.add(shellMesh);
      groupMesh.add(atmosMesh);

      groupMesh.position.set(
        Math.cos(angle) * orbitRadius,
        Math.sin(angle * 0.5) * 0.3,
        Math.sin(angle) * orbitRadius
      );
      groupMesh.userData = { domainIdx: idx, baseY: groupMesh.position.y };
      scene.add(groupMesh);
      domainMeshes.push(groupMesh);

      domainOrigPosRef.current[idx] = groupMesh.position.clone();
      domainDisplaceRef.current[idx] = new THREE.Vector3();

      // Holographic disc (horizontal ring under the sphere)
      const discGeo = new THREE.PlaneGeometry(nodeSize * 4, nodeSize * 4);
      const discMat = new THREE.ShaderMaterial({
        vertexShader: hexDiscVertexShader,
        fragmentShader: hexDiscFragmentShader,
        uniforms: {
          uColor: { value: color },
          uTime: { value: 0 },
          uOpacity: { value: domain.active ? 0.6 : 0.2 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(groupMesh.position);
      disc.position.y -= nodeSize * 0.3;
      scene.add(disc);

      // Orbiting particle ring
      const particleCount = domain.active ? 60 : 20;
      const particleGeo = new THREE.BufferGeometry();
      const pPositions = new Float32Array(particleCount * 3);
      const pSizes = new Float32Array(particleCount);
      for (let i = 0; i < particleCount; i++) {
        const a = (i / particleCount) * Math.PI * 2;
        const r = nodeSize * (1.6 + Math.random() * 0.4);
        pPositions[i * 3] = Math.cos(a) * r;
        pPositions[i * 3 + 1] = (Math.random() - 0.5) * nodeSize * 0.6;
        pPositions[i * 3 + 2] = Math.sin(a) * r;
        pSizes[i] = 0.01 + Math.random() * 0.02;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      particleGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));
      const particleMat = new THREE.PointsMaterial({
        color: color,
        size: 0.025,
        transparent: true,
        opacity: domain.active ? 0.8 : 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      particles.position.copy(groupMesh.position);
      scene.add(particles);

      // Inner spinning ring (tilted)
      const innerRingGeo = new THREE.TorusGeometry(nodeSize * 1.2, 0.008, 8, 64);
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: domain.active ? 0.7 : 0.2,
      });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      innerRing.position.copy(groupMesh.position);
      innerRing.rotation.x = Math.PI * 0.3;
      innerRing.rotation.z = Math.PI * 0.15 * idx;
      scene.add(innerRing);

      // Outer spinning ring (opposite tilt)
      const outerRingGeo = new THREE.TorusGeometry(nodeSize * 1.6, 0.005, 8, 64);
      const outerRingMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: domain.active ? 0.4 : 0.1,
      });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.position.copy(groupMesh.position);
      outerRing.rotation.x = -Math.PI * 0.4;
      outerRing.rotation.z = -Math.PI * 0.2 * idx;
      scene.add(outerRing);

      // Hex grid wireframe (icosahedron as structural cage)
      const hexGeo = new THREE.IcosahedronGeometry(nodeSize * 1.3, 1);
      const hexEdges = new THREE.EdgesGeometry(hexGeo);
      const hexLine = new THREE.LineSegments(hexEdges, new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: domain.active ? 0.25 : 0.08,
      }));
      hexLine.position.copy(groupMesh.position);
      scene.add(hexLine);

      domainExtras.push({ shells: [shellMesh, atmosMesh], particles, hexGrid: hexLine, innerRing, outerRing, disc });

      // Selection ring (used by hover/selection logic)
      const ringGeo = new THREE.RingGeometry(nodeSize * 2.0, nodeSize * 2.3, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(groupMesh.position);
      scene.add(ring);
      domainRings.push(ring);

      if (domain.active) {
        const light = new THREE.PointLight(color.getHex(), 0.6, 2.5);
        light.position.copy(groupMesh.position);
        scene.add(light);
      }
    });

    // Orbit ring
    const orbitCurve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, Math.PI * 2, false, 0);
    const orbitPts = orbitCurve.getPoints(120).map(p => new THREE.Vector3(p.x, 0, p.y));
    const orbitLineGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    scene.add(new THREE.Line(orbitLineGeo, new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.3 })));

    // Flow particles
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

    // LASER BEAM LINE
    const laserGeo = new THREE.BufferGeometry();
    const laserPositions = new Float32Array(6);
    laserGeo.setAttribute('position', new THREE.BufferAttribute(laserPositions, 3));
    const laserMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9, linewidth: 2 });
    const laserLine = new THREE.Line(laserGeo, laserMat);
    laserLine.visible = false;
    scene.add(laserLine);

    // SHOCKWAVE RING
    const shockGeo = new THREE.RingGeometry(0.1, 0.3, 64);
    const shockMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const shockwaveRing = new THREE.Mesh(shockGeo, shockMat);
    shockwaveRing.rotation.x = -Math.PI / 2;
    scene.add(shockwaveRing);

    // Investigation lines array
    const investigationLines: THREE.Line[] = [];

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
      domainMeshes, domainRings, flowParticles, laserLine, shockwaveRing,
      investigationLines, raycaster, clock, animId: 0,
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

    // ANIMATION LOOP
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      controls.update();

      // Core pulse
      const pulse = 1 + Math.sin(elapsed * 2) * 0.04;
      coreMesh.scale.setScalar(pulse);
      coreGlow.scale.setScalar(pulse * 1.15);
      coreMesh.rotation.y += 0.004;

      const sev = getSeverityConfig(severityRef.current);
      (coreMesh.material as THREE.MeshPhongMaterial).color.lerp(sev.color, 0.02);
      (coreMesh.material as THREE.MeshPhongMaterial).emissive.lerp(sev.color, 0.02);
      (coreGlow.material as THREE.MeshBasicMaterial).color.lerp(sev.color, 0.02);
      coreLight.color.lerp(sev.color, 0.02);

      // Domain positions with spring physics + animate extras
      domainMeshes.forEach((mesh, idx) => {
        const orig = domainOrigPosRef.current[idx];
        const displace = domainDisplaceRef.current[idx];

        if (orig && displace) {
          displace.x *= 0.94;
          displace.y *= 0.94;
          displace.z *= 0.94;
          if (displace.length() < 0.001) displace.set(0, 0, 0);
          mesh.position.set(
            orig.x + displace.x,
            orig.y + displace.y + Math.sin(elapsed * 0.7 + idx) * 0.08,
            orig.z + displace.z
          );
        } else {
          mesh.position.y = mesh.userData.baseY + Math.sin(elapsed * 0.7 + idx) * 0.08;
        }

        mesh.rotation.y += 0.006;
        domainRings[idx].position.copy(mesh.position);
        domainRings[idx].lookAt(camera.position);

        // Animate domain extras
        const extras = domainExtras[idx];
        if (extras) {
          // Update shader uniforms
          extras.shells.forEach((shell) => {
            const mat = shell.material as THREE.ShaderMaterial;
            if (mat.uniforms?.uTime) mat.uniforms.uTime.value = elapsed;
          });
          // Spin inner ring
          extras.innerRing.position.copy(mesh.position);
          extras.innerRing.rotation.y += 0.02;
          extras.innerRing.rotation.x += 0.005;
          // Spin outer ring opposite direction
          extras.outerRing.position.copy(mesh.position);
          extras.outerRing.rotation.y -= 0.012;
          extras.outerRing.rotation.z += 0.003;
          // Rotate orbiting particles
          extras.particles.position.copy(mesh.position);
          extras.particles.rotation.y += 0.008;
          // Rotate hex grid slowly
          extras.hexGrid.position.copy(mesh.position);
          extras.hexGrid.rotation.x += 0.003;
          extras.hexGrid.rotation.y += 0.005;
          // Animate holographic disc
          extras.disc.position.copy(mesh.position);
          extras.disc.position.y -= 0.08;
          const discMat = extras.disc.material as THREE.ShaderMaterial;
          if (discMat.uniforms?.uTime) discMat.uniforms.uTime.value = elapsed;
        }
      });

      // Shockwave animation
      if (shockwaveActive) {
        const t = shockwaveTimeRef.current;
        const scale = 1 + t * 12;
        shockwaveRing.scale.setScalar(scale);
        (shockwaveRing.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - t * 0.3);
        shockwaveTimeRef.current += 0.016;

        // Push all domains outward during shockwave
        if (t < 0.5) {
          domainMeshes.forEach((_, idx) => {
            const orig = domainOrigPosRef.current[idx];
            if (orig) {
              const dir = orig.clone().normalize();
              const force = Math.max(0, 0.5 - t) * 0.05;
              const displacement = domainDisplaceRef.current[idx] || new THREE.Vector3();
              displacement.add(dir.multiplyScalar(force));
              domainDisplaceRef.current[idx] = displacement;
            }
          });
        }
      } else {
        (shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0;
        shockwaveRing.scale.setScalar(1);
      }

      // Investigation lines fade
      for (let i = investigationLines.length - 1; i >= 0; i--) {
        const line = investigationLines[i];
        const age = Date.now() - line.userData.createdAt;
        const lifetime = line.userData.lifetime;
        if (age > lifetime) {
          scene.remove(line);
          line.geometry.dispose();
          (line.material as THREE.LineBasicMaterial).dispose();
          investigationLines.splice(i, 1);
        } else {
          const fade = 1 - age / lifetime;
          (line.material as THREE.LineBasicMaterial).opacity = fade * 0.8;
        }
      }

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

      // Flow particles
      flowParticles.forEach((p) => {
        p.userData.progress += 0.004;
        if (p.userData.progress > 1) p.userData.progress = 0;
        p.position.copy(p.userData.curve.getPoint(p.userData.progress));
      });

      // Laser beam pulse
      if (laserLine.visible) {
        (laserLine.material as THREE.LineBasicMaterial).opacity = 0.5 + Math.sin(elapsed * 10) * 0.4;
      }

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

  // Resize on fullscreen
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
      <div ref={containerRef} className="absolute inset-0" />

      {/* Hand Tracking Overlay Canvas */}
      <canvas
        ref={canvasOverlayRef}
        width={960}
        height={720}
        className={`absolute inset-0 w-full h-full pointer-events-none z-20 ${handTrackingOn ? 'opacity-100' : 'opacity-0'}`}
      />

      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Webcam PIP */}
      {handTrackingOn && (
        <div className="absolute bottom-24 right-4 z-30 w-44 h-32 rounded-lg border-2 border-cyan-500/50 overflow-hidden shadow-lg shadow-cyan-500/20">
          <video
            ref={el => {
              if (el && videoRef.current?.srcObject) {
                el.srcObject = videoRef.current.srcObject;
                el.play();
              }
            }}
            className="w-full h-full object-cover transform scale-x-[-1]"
            playsInline muted autoPlay
          />
          <div className="absolute inset-0 border-2 border-cyan-400/20 rounded-lg pointer-events-none" />
          <div className="absolute top-1 left-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[8px] text-cyan-400 font-bold uppercase">LIVE</span>
          </div>
        </div>
      )}

      {/* Gesture Tutorial Overlay */}
      {handTrackingOn && showGestureTutorial && (
        <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
          <div className="bg-slate-900/90 backdrop-blur-lg border border-cyan-500/30 rounded-2xl p-6 max-w-md pointer-events-auto animate-pulse">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Hand className="w-4 h-4" /> Hand Gesture Controls
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-300"><span className="text-white font-bold">Point</span> = Energy Beam</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">&#9994;</span>
                <span className="text-slate-300"><span className="text-white font-bold">Fist</span> = Grab Domain</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">&#9995;</span>
                <span className="text-slate-300"><span className="text-white font-bold">Open</span> = Force Push</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-slate-300"><span className="text-white font-bold">Pinch</span> = Select</span>
              </div>
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-green-400" />
                <span className="text-slate-300"><span className="text-white font-bold">Peace</span> = Link Domains</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">&#128079;</span>
                <span className="text-slate-300"><span className="text-white font-bold">Clap</span> = Shockwave</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 text-center">Use both hands spread/pinch for zoom</p>
          </div>
        </div>
      )}

      {/* Gesture State HUD */}
      {handTrackingOn && handGesture && (
        <div className="absolute top-1/2 left-4 -translate-y-1/2 z-30">
          <div className="px-4 py-3 rounded-xl border border-cyan-500/30 bg-slate-900/80 backdrop-blur-md min-w-[140px]">
            <div className="flex items-center gap-2 mb-1">
              <Hand className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Gesture</span>
            </div>
            <div className="text-sm font-bold text-white">{handGesture}</div>
            {isGrabbing && (
              <div className="mt-1.5 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
                <span className="text-[10px] text-orange-400 font-bold">HOLDING DOMAIN</span>
              </div>
            )}
            {isBeaming && (
              <div className="mt-1.5 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] text-cyan-400 font-bold">BEAM ACTIVE</span>
              </div>
            )}
            {isPinching && (
              <div className="mt-1.5 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                <span className="text-[10px] text-red-400 font-bold">SELECTING</span>
              </div>
            )}
            {twoHandsDetected && (
              <div className="mt-1.5 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[10px] text-green-400 font-bold">2 HANDS</span>
              </div>
            )}
            {shockwaveActive && (
              <div className="mt-1.5 flex items-center gap-1">
                <Zap className="w-3 h-3 text-yellow-400 animate-bounce" />
                <span className="text-[10px] text-yellow-400 font-bold">SHOCKWAVE!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hand Cursor */}
      {handTrackingOn && handPosition && (
        <div
          className="absolute z-25 pointer-events-none transition-all duration-75"
          style={{ left: `${handPosition.x * 100}%`, top: `${handPosition.y * 100}%`, transform: 'translate(-50%, -50%)' }}
        >
          <div className={`w-8 h-8 rounded-full border-2 transition-all duration-150 ${
            isGrabbing ? 'border-orange-400 bg-orange-400/20 scale-50' :
            isBeaming ? 'border-cyan-400 bg-cyan-400/30 scale-110' :
            isPinching ? 'border-red-400 bg-red-400/20 scale-75' :
            'border-cyan-400 bg-cyan-400/10'
          }`} />
          {isBeaming && <div className="absolute inset-0 w-8 h-8 rounded-full border border-cyan-400/30 animate-ping" />}
        </div>
      )}

      {/* Investigation Links Display */}
      {investigationLinks.length > 0 && (
        <div className="absolute top-20 left-4 z-10">
          <div className="px-3 py-2 rounded-lg border border-cyan-500/20 bg-slate-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Link2 className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">Investigation Links</span>
            </div>
            {investigationLinks.slice(-3).map((link, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-300">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DOMAINS[link.fromIdx].color }} />
                <span className="text-white font-medium">{DOMAINS[link.fromIdx].name}</span>
                <span className="text-slate-500">-&gt;</span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DOMAINS[link.toIdx].color }} />
                <span className="text-white font-medium">{DOMAINS[link.toIdx].name}</span>
              </div>
            ))}
          </div>
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
                  Hand Control
                </span>
              )}
              {shockwaveActive && (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 uppercase animate-pulse">
                  Shockwave
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {handTrackingOn
                ? 'Point=Beam | Fist=Grab | Palm=Push | Peace=Link | Pinch=Select | Clap=Shockwave'
                : 'Drag to orbit - Click to inspect - Scroll to zoom - Double-click to focus'}
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
        {handTrackingOn && (
          <button
            onClick={() => setShowGestureTutorial(prev => !prev)}
            className="p-2.5 rounded-lg border border-slate-600/40 bg-slate-900/70 text-slate-400 hover:text-white hover:border-white/20 transition-all backdrop-blur-sm"
            title="Show gesture guide"
          >
            <Hand className="w-4 h-4" />
          </button>
        )}
        {investigationLinks.length > 0 && (
          <button
            onClick={() => setInvestigationLinks([])}
            className="p-2.5 rounded-lg border border-red-500/30 bg-slate-900/70 text-red-400 hover:text-red-300 hover:border-red-400/40 transition-all backdrop-blur-sm"
            title="Clear investigation links"
          >
            <Link2 className="w-4 h-4" />
          </button>
        )}
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
      <div className="absolute bottom-20 right-56 z-10 w-48">
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
