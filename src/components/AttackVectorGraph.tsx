import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { AlertTriangle, TrendingUp, AlertOctagon, Shield, Crosshair, Zap, Radio, Activity } from 'lucide-react';

interface AttackVector {
  id: string;
  name: string;
  type: string;
  source: { x: number; y: number; z: number; label: string };
  target: { x: number; y: number; z: number; label: string };
  path: { x: number; y: number; z: number }[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  technique: string;
  speed: number;
  attackShape: 'worm' | 'beam' | 'pulse' | 'swarm' | 'wave' | 'spiral';
  mitre: string;
  blocked: boolean;
}

interface AttackObjects {
  curve: THREE.CatmullRomCurve3;
  objects: THREE.Object3D[];
}

const SEVERITY_COLORS = {
  low: 0x22c55e,
  medium: 0xfbbf24,
  high: 0xf97316,
  critical: 0xff1144,
};

const NETWORK_NODES = [
  { pos: [0, 0, 0] as [number, number, number], label: 'Core Server', color: 0x3b82f6, size: 0.9, type: 'core' },
  { pos: [8, 2, 6] as [number, number, number], label: 'Database Cluster', color: 0x10b981, size: 0.7, type: 'db' },
  { pos: [-7, 1.5, -6] as [number, number, number], label: 'Web Server Farm', color: 0x06b6d4, size: 0.7, type: 'web' },
  { pos: [6, -1, -7] as [number, number, number], label: 'API Gateway', color: 0x10b981, size: 0.65, type: 'api' },
  { pos: [-8, 3, 5] as [number, number, number], label: 'Auth Service', color: 0xf59e0b, size: 0.65, type: 'auth' },
  { pos: [9, -2, -5] as [number, number, number], label: 'SCADA / OT', color: 0xf59e0b, size: 0.65, type: 'scada' },
  { pos: [-9, -1, 7] as [number, number, number], label: 'File Server', color: 0x10b981, size: 0.6, type: 'file' },
  { pos: [4, 4, -3] as [number, number, number], label: 'DNS Server', color: 0x06b6d4, size: 0.55, type: 'dns' },
  { pos: [-4, -3, -4] as [number, number, number], label: 'Mail Server', color: 0x06b6d4, size: 0.55, type: 'mail' },
  { pos: [3, -3, 5] as [number, number, number], label: 'VPN Gateway', color: 0xf59e0b, size: 0.55, type: 'vpn' },
  { pos: [-5, 2, -1] as [number, number, number], label: 'AD Controller', color: 0xf59e0b, size: 0.7, type: 'dc' },
  { pos: [14, 1, 10] as [number, number, number], label: 'External Threat', color: 0xef4444, size: 0.6, type: 'threat' },
  { pos: [-14, 2, -10] as [number, number, number], label: 'APT C2', color: 0xef4444, size: 0.5, type: 'threat' },
  { pos: [12, -3, -12] as [number, number, number], label: 'Botnet', color: 0xef4444, size: 0.5, type: 'threat' },
];

const CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 6], [0, 10],
  [3, 5], [2, 7], [0, 8], [0, 9], [10, 4], [2, 10],
  [7, 10], [8, 2], [9, 3], [1, 5],
];

const ATTACK_TEMPLATES = [
  { name: 'APT Lateral Movement', type: 'Advanced Persistent Threat', sourceIdx: 11, targetIdx: 10, waypoints: [2, 0], severity: 'critical' as const, technique: 'Spearphishing -> PowerShell Stager -> Kerberoasting -> DC Compromise', speed: 0.008, attackShape: 'worm' as const, mitre: 'T1566 -> T1059 -> T1558 -> T1078' },
  { name: 'DDoS Amplification', type: 'Volumetric DDoS', sourceIdx: 13, targetIdx: 2, waypoints: [], severity: 'critical' as const, technique: 'DNS Amplification -> SYN Flood -> HTTP/2 Rapid Reset', speed: 0.025, attackShape: 'wave' as const, mitre: 'T1498.002' },
  { name: 'Ransomware Deployment', type: 'Ransomware', sourceIdx: 11, targetIdx: 6, waypoints: [0], severity: 'critical' as const, technique: 'RDP Brute Force -> Cobalt Strike -> SMB Lateral -> AES-256 Encryption', speed: 0.012, attackShape: 'swarm' as const, mitre: 'T1110 -> T1570 -> T1486' },
  { name: 'SQL Injection Chain', type: 'Web Application Attack', sourceIdx: 12, targetIdx: 1, waypoints: [2, 3], severity: 'high' as const, technique: 'SQLi -> WAF Bypass -> UNION SELECT -> Data Exfil via DNS', speed: 0.018, attackShape: 'beam' as const, mitre: 'T1190 -> T1048' },
  { name: 'Zero-Day SCADA Exploit', type: 'ICS/OT Attack', sourceIdx: 12, targetIdx: 5, waypoints: [3], severity: 'critical' as const, technique: 'CVE-2024-XXXX -> PLC Firmware Overwrite -> Safety System Bypass', speed: 0.01, attackShape: 'spiral' as const, mitre: 'T0866 -> T0839' },
  { name: 'Credential Stuffing', type: 'Brute Force', sourceIdx: 13, targetIdx: 4, waypoints: [], severity: 'high' as const, technique: 'Credential Dump -> Proxy Rotation -> MFA Fatigue -> Account Takeover', speed: 0.02, attackShape: 'pulse' as const, mitre: 'T1110.004 -> T1621' },
  { name: 'DNS Tunneling Exfil', type: 'Data Exfiltration', sourceIdx: 11, targetIdx: 7, waypoints: [0], severity: 'high' as const, technique: 'Iodine Tunnel -> Base64 Encoding -> Slow Drip Exfiltration', speed: 0.015, attackShape: 'beam' as const, mitre: 'T1048.001' },
  { name: 'Supply Chain Backdoor', type: 'Supply Chain', sourceIdx: 12, targetIdx: 0, waypoints: [8], severity: 'critical' as const, technique: 'Trojanized Update -> Signed Binary -> Kernel Rootkit', speed: 0.006, attackShape: 'spiral' as const, mitre: 'T1195.002 -> T1014' },
];

export default function AttackVectorGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [attacks, setAttacks] = useState<AttackVector[]>([]);
  const [selectedAttack, setSelectedAttack] = useState<AttackVector | null>(null);
  const [stats, setStats] = useState({ total: 0, blocked: 0, inProgress: 0, totalBlocked: 0 });
  const attackObjectsRef = useRef<Map<string, AttackObjects>>(new Map());
  const nodeRingsRef = useRef<THREE.Mesh[]>([]);
  const nodeGlowsRef = useRef<THREE.Mesh[]>([]);
  const shieldRef = useRef<THREE.Mesh | null>(null);
  const particleFieldRef = useRef<THREE.Points | null>(null);
  const connectionLinesRef = useRef<THREE.Line[]>([]);
  const impactRingsRef = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010209);
    scene.fog = new THREE.FogExp2(0x010209, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(22, 18, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x1a2a4a, 0.4));
    const dirLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0x0066ff, 0.8, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    createGridFloor(scene);
    createNetworkNodes(scene);
    createConnectionLines(scene);
    createDefenseShield(scene);
    createParticleField(scene);

    let angle = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.016;
      angle += 0.0015;

      camera.position.x = Math.cos(angle) * 24;
      camera.position.z = Math.sin(angle) * 24;
      camera.position.y = 18 + Math.sin(timeRef.current * 0.2) * 2;
      camera.lookAt(0, 0, 0);

      animateNodes();
      animateShield();
      animateParticleField();
      animateConnectionLines();
      animateImpactRings();
      animateAttacks();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  const createGridFloor = (scene: THREE.Scene) => {
    const grid = new THREE.GridHelper(60, 60, 0x0a1830, 0x060d1a);
    grid.position.y = -0.5;
    scene.add(grid);

    const ringGeo = new THREE.RingGeometry(14.5, 15, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0a3060, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.4;
    scene.add(ring);

    const ring2Geo = new THREE.RingGeometry(9.8, 10, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x0a4080, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = -0.4;
    scene.add(ring2);
  };

  const createNetworkNodes = (scene: THREE.Scene) => {
    NETWORK_NODES.forEach((node) => {
      const geo = new THREE.IcosahedronGeometry(node.size, 2);
      const mat = new THREE.MeshPhongMaterial({
        color: node.color, emissive: node.color, emissiveIntensity: 0.5,
        shininess: 100, specular: 0x444444,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...node.pos);
      scene.add(mesh);

      const wireGeo = new THREE.IcosahedronGeometry(node.size + 0.15, 1);
      const wireMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.12, wireframe: true });
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(...node.pos);
      scene.add(wire);

      const ringGeo = new THREE.RingGeometry(node.size + 0.3, node.size + 0.45, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(...node.pos);
      ring.lookAt(0, 100, 0);
      scene.add(ring);
      nodeRingsRef.current.push(ring);

      const glowGeo = new THREE.SphereGeometry(node.size * 2, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.04 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(...node.pos);
      scene.add(glow);
      nodeGlowsRef.current.push(glow);

      if (node.type === 'threat') {
        const dangerGeo = new THREE.OctahedronGeometry(node.size * 0.4, 0);
        const dangerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
        const danger = new THREE.Mesh(dangerGeo, dangerMat);
        danger.position.set(node.pos[0], node.pos[1] + node.size + 0.5, node.pos[2]);
        scene.add(danger);
        nodeGlowsRef.current.push(danger);
      }
    });
  };

  const createConnectionLines = (scene: THREE.Scene) => {
    CONNECTIONS.forEach(([fromIdx, toIdx]) => {
      const from = NETWORK_NODES[fromIdx];
      const to = NETWORK_NODES[toIdx];
      const midY = Math.max(from.pos[1], to.pos[1]) + 1;
      const midX = (from.pos[0] + to.pos[0]) / 2;
      const midZ = (from.pos[2] + to.pos[2]) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...from.pos),
        new THREE.Vector3(midX, midY, midZ),
        new THREE.Vector3(...to.pos),
      ]);
      const points = curve.getPoints(40);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0x0a2a50, transparent: true, opacity: 0.3 });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      connectionLinesRef.current.push(line);
    });
  };

  const createDefenseShield = (scene: THREE.Scene) => {
    const geo = new THREE.SphereGeometry(12, 32, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0066ff, transparent: true, opacity: 0.03,
      wireframe: true, side: THREE.DoubleSide,
    });
    const shield = new THREE.Mesh(geo, mat);
    shield.position.y = 1;
    scene.add(shield);
    shieldRef.current = shield;
  };

  const createParticleField = (scene: THREE.Scene) => {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 15 + Math.random() * 30;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = new THREE.Color(Math.random() > 0.7 ? 0x0066ff : 0x112244);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.12, transparent: true, opacity: 0.4, vertexColors: true, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    particleFieldRef.current = points;
  };

  const animateNodes = () => {
    const t = timeRef.current;
    nodeRingsRef.current.forEach((ring, i) => {
      ring.rotation.z = t * 0.3 + i * 0.5;
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 2 + i) * 0.08;
    });
    nodeGlowsRef.current.forEach((glow, i) => {
      glow.scale.setScalar(1 + Math.sin(t * 1.5 + i * 0.7) * 0.15);
      if (glow.geometry.type === 'OctahedronGeometry') {
        glow.rotation.y = t * 2;
        glow.rotation.x = t * 1.5;
      }
    });
  };

  const animateShield = () => {
    if (!shieldRef.current) return;
    shieldRef.current.rotation.y = timeRef.current * 0.05;
    shieldRef.current.rotation.x = Math.sin(timeRef.current * 0.1) * 0.1;
    const mat = shieldRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.02 + Math.sin(timeRef.current * 0.5) * 0.01;
  };

  const animateParticleField = () => {
    if (!particleFieldRef.current) return;
    particleFieldRef.current.rotation.y = timeRef.current * 0.01;
    const positions = particleFieldRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] += Math.sin(timeRef.current + i * 0.1) * 0.003;
    }
    particleFieldRef.current.geometry.attributes.position.needsUpdate = true;
  };

  const animateConnectionLines = () => {
    const t = timeRef.current;
    connectionLinesRef.current.forEach((line, i) => {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 1.5 + i * 0.8) * 0.1;
    });
  };

  const spawnImpactRing = useCallback((position: THREE.Vector3, color: number) => {
    if (!sceneRef.current) return;
    const geo = new THREE.RingGeometry(0.1, 0.3, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(position);
    ring.lookAt(0, 100, 0);
    ring.userData = { born: timeRef.current, maxLife: 2.0 };
    sceneRef.current.add(ring);
    impactRingsRef.current.push(ring);
  }, []);

  const animateImpactRings = () => {
    const toRemove: number[] = [];
    impactRingsRef.current.forEach((ring, i) => {
      const age = timeRef.current - ring.userData.born;
      const life = ring.userData.maxLife;
      if (age > life) { toRemove.push(i); return; }
      const t = age / life;
      const scale = 1 + t * 8;
      ring.scale.setScalar(scale);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.8 * (1 - t);
    });
    toRemove.reverse().forEach(i => {
      const ring = impactRingsRef.current[i];
      sceneRef.current?.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      impactRingsRef.current.splice(i, 1);
    });
  };

  const createAttackVisualization = useCallback((attack: AttackVector) => {
    if (!sceneRef.current) return;
    const points = attack.path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(points);
    const color = SEVERITY_COLORS[attack.severity];
    const objects: THREE.Object3D[] = [];

    const trailPoints = curve.getPoints(120);
    const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.15 });
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.userData = { type: 'trail' };
    objects.push(trail);

    switch (attack.attackShape) {
      case 'worm': createWormAttack(curve, color, objects); break;
      case 'wave': createWaveAttack(curve, color, objects); break;
      case 'swarm': createSwarmAttack(curve, color, objects); break;
      case 'spiral': createSpiralAttack(curve, color, objects); break;
      case 'pulse': createPulseAttack(curve, color, objects); break;
      default: createBeamAttack(curve, color, objects);
    }

    objects.forEach(obj => sceneRef.current?.add(obj));
    attackObjectsRef.current.set(attack.id, { curve, objects });
  }, []);

  const createWormAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const size = 0.12 + (1 - i / count) * 0.08;
      const geo = new THREE.SphereGeometry(size, 8, 8);
      const mat = new THREE.MeshPhongMaterial({
        color, emissive: color, emissiveIntensity: 1.5 - (i / count),
        transparent: true, opacity: 0.9 - (i / count) * 0.5,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData = { index: i, type: 'worm' };
      objects.push(sphere);
    }
  };

  const createWaveAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);
    const startPos = curve.getPointAt(0);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = startPos.x;
      positions[i * 3 + 1] = startPos.y;
      positions[i * 3 + 2] = startPos.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.25, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(geo, mat);
    particles.userData = { type: 'wave' };
    objects.push(particles);
  };

  const createSwarmAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    const count = 80;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.04, 0);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.8 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'swarm', offset: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 1.5, z: (Math.random() - 0.5) * 2 } };
      objects.push(p);
    }
  };

  const createSpiralAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    const count = 35;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.OctahedronGeometry(0.08, 0);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.8, transparent: true, opacity: 0.9 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'spiral' };
      objects.push(p);
    }
  };

  const createPulseAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(0.3, 16, 16);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 2.0, transparent: true, opacity: 0.8 });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData = { index: i, type: 'pulse' };
      objects.push(sphere);
    }
  };

  const createBeamAttack = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    const particleCount = 80;
    const positions = new Float32Array(particleCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(geo, mat);
    particles.userData = { type: 'beamParticles' };
    objects.push(particles);

    const coreGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const coreMat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 2.0, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.userData = { type: 'beamCore' };
    objects.push(core);
  };

  const animateAttacks = useCallback(() => {
    const t = timeRef.current;
    attacks.forEach((attack) => {
      const data = attackObjectsRef.current.get(attack.id);
      if (!data) return;
      const { curve, objects } = data;
      const progress = Math.min(attack.progress, 0.99);

      objects.forEach((obj) => {
        const type = obj.userData.type;
        if (type === 'trail') {
          const mat = (obj as THREE.Line).material as THREE.LineBasicMaterial;
          mat.opacity = 0.1 + Math.sin(t * 3) * 0.05;
          return;
        }
        if (type === 'worm') {
          const idx = obj.userData.index;
          const segT = Math.max(0, Math.min(0.99, progress - (idx / 40) * 0.15));
          const pos = curve.getPointAt(segT);
          obj.position.copy(pos);
          const wobble = Math.sin(t * 8 + idx * 0.4) * 0.15;
          obj.position.y += wobble;
          obj.scale.setScalar(0.7 + Math.sin(t * 6 + idx) * 0.3);
        } else if (type === 'wave') {
          const positions = (obj as THREE.Points).geometry.attributes.position.array as Float32Array;
          const count = positions.length / 3;
          for (let i = 0; i < count; i++) {
            const pT = Math.max(0, Math.min(0.99, progress + (Math.random() - 0.5) * 0.15));
            const pos = curve.getPointAt(pT);
            positions[i * 3] = pos.x + (Math.random() - 0.5) * 3;
            positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 2;
            positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 3;
          }
          (obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
        } else if (type === 'swarm') {
          const idx = obj.userData.index;
          const off = obj.userData.offset;
          const segT = Math.max(0, Math.min(0.99, progress + (idx / 80) * 0.2 - 0.1));
          const pos = curve.getPointAt(segT);
          const swirl = t * 3 + idx;
          obj.position.set(
            pos.x + off.x * Math.sin(swirl) * 0.5,
            pos.y + off.y * Math.cos(swirl * 0.7),
            pos.z + off.z * Math.cos(swirl) * 0.5
          );
          obj.rotation.y = t * 4 + idx;
          obj.rotation.x = t * 3;
        } else if (type === 'spiral') {
          const idx = obj.userData.index;
          const segT = Math.max(0, Math.min(0.99, progress * 0.85 + (idx / 35) * 0.15));
          const pos = curve.getPointAt(segT);
          const angle = (idx / 35) * Math.PI * 8 + t * 2;
          const radius = 0.6 + Math.sin(t + idx * 0.3) * 0.2;
          obj.position.set(
            pos.x + Math.cos(angle) * radius,
            pos.y + Math.sin(angle * 0.5) * 0.3,
            pos.z + Math.sin(angle) * radius
          );
          obj.rotation.y = t * 3;
        } else if (type === 'pulse') {
          const idx = obj.userData.index;
          const pulseT = Math.max(0, Math.min(0.99, progress - idx * 0.08));
          if (pulseT > 0) {
            const pos = curve.getPointAt(pulseT);
            obj.position.copy(pos);
            const pulseScale = 0.8 + Math.sin(t * 8 + idx * 2) * 0.4;
            obj.scale.setScalar(pulseScale);
            obj.visible = true;
          } else {
            obj.visible = false;
          }
        } else if (type === 'beamParticles') {
          const positions = (obj as THREE.Points).geometry.attributes.position.array as Float32Array;
          const count = positions.length / 3;
          const visibleCount = Math.floor(progress * count);
          for (let i = 0; i < visibleCount; i++) {
            const pT = Math.max(0, Math.min(0.99, (i / count) * progress));
            const pos = curve.getPointAt(pT);
            positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
          }
          (obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
        } else if (type === 'beamCore') {
          const pos = curve.getPointAt(Math.min(progress, 0.99));
          obj.position.copy(pos);
          obj.scale.setScalar(0.8 + Math.sin(t * 10) * 0.3);
        }
      });
    });
  }, [attacks]);

  useEffect(() => {
    attacks.forEach((attack) => {
      if (attack.progress < 1 && !attackObjectsRef.current.has(attack.id)) {
        createAttackVisualization(attack);
      } else if (attack.progress >= 1) {
        const data = attackObjectsRef.current.get(attack.id);
        if (data) {
          const lastPoint = attack.path[attack.path.length - 1];
          spawnImpactRing(new THREE.Vector3(lastPoint.x, lastPoint.y, lastPoint.z), SEVERITY_COLORS[attack.severity]);
          data.objects.forEach((obj) => {
            sceneRef.current?.remove(obj);
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) {
              const mat = (obj as any).material;
              if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
              else mat.dispose();
            }
          });
          attackObjectsRef.current.delete(attack.id);
        }
      }
    });
    setAttacks((prev) => prev.filter((a) => a.progress < 1.5));
  }, [attacks, createAttackVisualization, spawnImpactRing]);

  useEffect(() => {
    const inProgress = attacks.filter((a) => a.progress < 1).length;
    const completed = attacks.filter((a) => a.progress >= 1).length;
    setStats(prev => ({
      total: attacks.length,
      blocked: Math.floor(completed * 0.45),
      inProgress,
      totalBlocked: prev.totalBlocked + (completed > 0 ? Math.floor(completed * 0.45) : 0),
    }));
  }, [attacks]);

  useEffect(() => {
    const generate = () => {
      const template = ATTACK_TEMPLATES[Math.floor(Math.random() * ATTACK_TEMPLATES.length)];
      const source = NETWORK_NODES[template.sourceIdx];
      const target = NETWORK_NODES[template.targetIdx];
      const path = [
        { x: source.pos[0], y: source.pos[1], z: source.pos[2] },
        ...template.waypoints.map(idx => ({ x: NETWORK_NODES[idx].pos[0], y: NETWORK_NODES[idx].pos[1] + 1, z: NETWORK_NODES[idx].pos[2] })),
        { x: target.pos[0], y: target.pos[1], z: target.pos[2] },
      ];

      const newAttack: AttackVector = {
        id: Math.random().toString(36).substr(2, 9),
        name: template.name,
        type: template.type,
        source: { ...source.pos.reduce((a, v, i) => ({ ...a, [['x', 'y', 'z'][i]]: v }), {} as any), label: source.label },
        target: { ...target.pos.reduce((a, v, i) => ({ ...a, [['x', 'y', 'z'][i]]: v }), {} as any), label: target.label },
        path,
        severity: template.severity,
        technique: template.technique,
        speed: template.speed,
        attackShape: template.attackShape,
        mitre: template.mitre,
        blocked: Math.random() > 0.55,
        progress: 0,
      };
      setAttacks((prev) => [...prev.filter((a) => a.progress < 1), newAttack]);
    };
    generate();
    const interval = setInterval(generate, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setAttacks((prev) => prev.map((a) =>
        a.progress < 1 ? { ...a, progress: Math.min(1, a.progress + a.speed) } : a
      ));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-4 right-4 flex gap-2">
        {[
          { label: 'ACTIVE', value: stats.inProgress, icon: Radio, color: 'border-red-500/40 text-red-400', valueCls: 'text-red-400', pulse: true },
          { label: 'BLOCKED', value: stats.blocked, icon: Shield, color: 'border-emerald-500/40 text-emerald-400', valueCls: 'text-emerald-400' },
          { label: 'TOTAL', value: stats.total, icon: Activity, color: 'border-slate-600 text-slate-400', valueCls: 'text-white' },
        ].map(s => (
          <div key={s.label} className={`bg-slate-900/95 backdrop-blur-md rounded-xl border ${s.color} p-3 min-w-[80px] text-center`}>
            <s.icon className={`w-3.5 h-3.5 mx-auto mb-1 ${s.color.split(' ')[1]}`} />
            <p className={`text-xl font-black ${s.valueCls}`}>{s.value}</p>
            <div className="flex items-center justify-center gap-1">
              {s.pulse && s.value > 0 && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              <p className={`text-[9px] font-bold tracking-widest ${s.color.split(' ')[1]}`}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute top-4 left-4 w-80">
        <div className="bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-red-500" />
              Live Attack Vectors
            </h3>
            {stats.inProgress > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {stats.inProgress} LIVE
              </span>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {attacks.length === 0 ? (
              <div className="p-6 text-center">
                <Crosshair className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">Scanning perimeter...</p>
              </div>
            ) : (
              attacks.map((attack) => (
                <div
                  key={attack.id}
                  onClick={() => setSelectedAttack(attack)}
                  className={`px-4 py-3 border-b border-slate-800/50 cursor-pointer transition-all hover:bg-slate-800/40 ${
                    selectedAttack?.id === attack.id ? 'bg-slate-800/60 border-l-2' : ''
                  }`}
                  style={selectedAttack?.id === attack.id ? { borderLeftColor: `#${SEVERITY_COLORS[attack.severity].toString(16)}` } : undefined}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white font-bold text-xs">{attack.name}</span>
                    <div className="flex items-center gap-1.5">
                      {attack.blocked && <Shield className="w-3 h-3 text-emerald-400" />}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                        attack.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        attack.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {attack.severity.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-2">
                    <span>{attack.source.label}</span>
                    <Zap className="w-2.5 h-2.5 text-red-500" />
                    <span>{attack.target.label}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${attack.progress * 100}%`,
                      backgroundColor: `#${SEVERITY_COLORS[attack.severity].toString(16).padStart(6, '0')}`,
                      boxShadow: `0 0 8px #${SEVERITY_COLORS[attack.severity].toString(16).padStart(6, '0')}60`,
                    }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-slate-600 font-mono">{attack.mitre}</span>
                    <span className="text-[9px] text-slate-500 font-bold">{Math.round(attack.progress * 100)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedAttack && (
        <div className="absolute bottom-4 right-4 w-96">
          <div className="bg-slate-900/95 backdrop-blur-md rounded-xl border overflow-hidden" style={{ borderColor: `#${SEVERITY_COLORS[selectedAttack.severity].toString(16).padStart(6, '0')}40` }}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: `#${SEVERITY_COLORS[selectedAttack.severity].toString(16).padStart(6, '0')}` }} />
                Attack Intelligence
              </h3>
              <button onClick={() => setSelectedAttack(null)} className="text-slate-500 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold">{selectedAttack.name}</p>
                  <p className="text-slate-500 text-xs">{selectedAttack.type}</p>
                </div>
                <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                  selectedAttack.progress < 1 ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {selectedAttack.progress < 1 ? 'IN PROGRESS' : selectedAttack.blocked ? 'BLOCKED' : 'REACHED TARGET'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/60 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 font-bold tracking-wider">SOURCE</p>
                  <p className="text-xs text-white font-medium mt-0.5">{selectedAttack.source.label}</p>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 font-bold tracking-wider">TARGET</p>
                  <p className="text-xs text-white font-medium mt-0.5">{selectedAttack.target.label}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider mb-1">ATTACK CHAIN</p>
                <div className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/30">
                  <p className="text-[10px] text-slate-300 leading-relaxed font-mono">{selectedAttack.technique}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider mb-1">MITRE ATT&CK</p>
                <div className="flex flex-wrap gap-1">
                  {selectedAttack.mitre.split(' -> ').map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider mb-1.5">PROGRESS</p>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${selectedAttack.progress * 100}%`,
                    backgroundColor: `#${SEVERITY_COLORS[selectedAttack.severity].toString(16).padStart(6, '0')}`,
                    boxShadow: `0 0 12px #${SEVERITY_COLORS[selectedAttack.severity].toString(16).padStart(6, '0')}40`,
                  }} />
                </div>
                <p className="text-right text-[10px] text-slate-500 mt-0.5 font-bold">{Math.round(selectedAttack.progress * 100)}%</p>
              </div>
              {selectedAttack.severity === 'critical' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-[10px] text-red-400 font-bold">CRITICAL: Immediate containment recommended</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
