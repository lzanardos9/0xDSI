import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { AlertTriangle, TrendingUp, AlertOctagon, Shield, Crosshair, Zap, Radio, Activity, Skull, Bug, Flame, Wifi, Server, Database, Globe, Lock } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  attackShape: AttackShape;
  mitre: string;
  blocked: boolean;
  killChainStage: string;
  affectedNodes: number[];
}

type AttackShape = 'worm' | 'beam' | 'pulse' | 'swarm' | 'wave' | 'spiral' | 'lightning' | 'nova' | 'plague' | 'vortex';

interface AttackObjects {
  curve: THREE.CatmullRomCurve3;
  objects: THREE.Object3D[];
}

interface Explosion {
  position: THREE.Vector3;
  color: number;
  born: number;
  life: number;
  objects: THREE.Object3D[];
  type: 'ring' | 'burst' | 'shockwave' | 'infection';
}

interface ArcConnection {
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  life: number;
  color: number;
  line: THREE.Line;
  intensity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
  { pos: [-14, 2, -10] as [number, number, number], label: 'APT C2 Server', color: 0xef4444, size: 0.5, type: 'threat' },
  { pos: [12, -3, -12] as [number, number, number], label: 'Botnet Controller', color: 0xef4444, size: 0.5, type: 'threat' },
  { pos: [-12, -2, 10] as [number, number, number], label: 'Ransomware Relay', color: 0xef4444, size: 0.45, type: 'threat' },
  { pos: [0, 5, 10] as [number, number, number], label: 'Insider Threat', color: 0xff6600, size: 0.45, type: 'threat' },
  { pos: [-6, -3, 3] as [number, number, number], label: 'IoT Devices', color: 0x06b6d4, size: 0.5, type: 'iot' },
  { pos: [7, 3, 0] as [number, number, number], label: 'Cloud Workloads', color: 0x3b82f6, size: 0.6, type: 'cloud' },
];

const CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 6], [0, 10],
  [3, 5], [2, 7], [0, 8], [0, 9], [10, 4], [2, 10],
  [7, 10], [8, 2], [9, 3], [1, 5], [0, 16], [0, 17],
  [16, 6], [17, 1], [4, 9], [3, 7], [1, 17], [10, 8],
];

const ATTACK_TEMPLATES = [
  { name: 'APT Lateral Movement', type: 'Advanced Persistent Threat', sourceIdx: 12, targetIdx: 10, waypoints: [2, 0], severity: 'critical' as const, technique: 'Spearphishing -> PowerShell Stager -> Kerberoasting -> DC Golden Ticket', speed: 0.007, attackShape: 'worm' as const, mitre: 'T1566 -> T1059 -> T1558 -> T1078', killChainStage: 'Lateral Movement', affectedNodes: [2, 0, 10] },
  { name: 'DDoS Amplification Wave', type: 'Volumetric DDoS', sourceIdx: 13, targetIdx: 2, waypoints: [7], severity: 'critical' as const, technique: 'DNS Amplification -> SYN Flood -> HTTP/2 Rapid Reset -> Slowloris', speed: 0.022, attackShape: 'wave' as const, mitre: 'T1498.002', killChainStage: 'Impact', affectedNodes: [7, 2] },
  { name: 'Ransomware Outbreak', type: 'Ransomware', sourceIdx: 14, targetIdx: 6, waypoints: [16, 0], severity: 'critical' as const, technique: 'RDP Brute -> Cobalt Strike -> SMB Spread -> AES-256 Encrypt All Volumes', speed: 0.01, attackShape: 'plague' as const, mitre: 'T1110 -> T1570 -> T1486', killChainStage: 'Actions on Objectives', affectedNodes: [16, 0, 6, 1, 8] },
  { name: 'SQL Injection Chain', type: 'Web Application Attack', sourceIdx: 13, targetIdx: 1, waypoints: [2, 3], severity: 'high' as const, technique: 'SQLi -> WAF Bypass -> UNION SELECT -> Data Exfil via DNS', speed: 0.015, attackShape: 'beam' as const, mitre: 'T1190 -> T1048', killChainStage: 'Exploitation', affectedNodes: [2, 3, 1] },
  { name: 'Zero-Day SCADA Exploit', type: 'ICS/OT Critical', sourceIdx: 13, targetIdx: 5, waypoints: [3], severity: 'critical' as const, technique: 'CVE-2026-XXXX -> PLC Firmware Overwrite -> Safety System Bypass -> Physical Damage', speed: 0.008, attackShape: 'spiral' as const, mitre: 'T0866 -> T0839', killChainStage: 'Actions on Objectives', affectedNodes: [3, 5] },
  { name: 'Credential Stuffing Blitz', type: 'Brute Force', sourceIdx: 11, targetIdx: 4, waypoints: [9], severity: 'high' as const, technique: 'Credential Dump -> Proxy Rotation -> MFA Fatigue -> Account Takeover', speed: 0.02, attackShape: 'pulse' as const, mitre: 'T1110.004 -> T1621', killChainStage: 'Initial Access', affectedNodes: [9, 4] },
  { name: 'DNS Tunneling Exfiltration', type: 'Data Exfiltration', sourceIdx: 12, targetIdx: 7, waypoints: [0], severity: 'high' as const, technique: 'Iodine Tunnel -> Base64 Encoding -> Slow Drip 50KB/min Exfil', speed: 0.012, attackShape: 'beam' as const, mitre: 'T1048.001', killChainStage: 'Exfiltration', affectedNodes: [0, 7] },
  { name: 'Supply Chain Backdoor', type: 'Supply Chain Attack', sourceIdx: 13, targetIdx: 0, waypoints: [17, 8], severity: 'critical' as const, technique: 'Trojanized NPM Package -> Signed Binary Proxy -> Kernel Rootkit -> Persistence', speed: 0.005, attackShape: 'spiral' as const, mitre: 'T1195.002 -> T1014', killChainStage: 'Persistence', affectedNodes: [17, 8, 0] },
  { name: 'Worm Outbreak - WannaCry Variant', type: 'Self-Propagating Worm', sourceIdx: 14, targetIdx: 0, waypoints: [6], severity: 'critical' as const, technique: 'EternalBlue SMBv1 -> Self-Replication -> Network Propagation -> Encrypt + Ransom', speed: 0.018, attackShape: 'plague' as const, mitre: 'T1210 -> T1486', killChainStage: 'Propagation', affectedNodes: [6, 16, 0, 8, 1, 2] },
  { name: 'Insider Data Theft', type: 'Insider Threat', sourceIdx: 15, targetIdx: 1, waypoints: [0], severity: 'high' as const, technique: 'Privileged Access Abuse -> Bulk DB Query -> Encrypted Exfil to Personal Cloud', speed: 0.014, attackShape: 'lightning' as const, mitre: 'T1078 -> T1567', killChainStage: 'Exfiltration', affectedNodes: [0, 1] },
  { name: 'IoT Botnet Recruitment', type: 'IoT Compromise', sourceIdx: 11, targetIdx: 16, waypoints: [], severity: 'medium' as const, technique: 'Mirai Variant -> Default Creds -> Telnet Brute -> C2 Registration', speed: 0.025, attackShape: 'swarm' as const, mitre: 'T1110 -> T1583', killChainStage: 'Resource Development', affectedNodes: [16] },
  { name: 'Cloud Cryptojacking', type: 'Resource Hijacking', sourceIdx: 12, targetIdx: 17, waypoints: [3], severity: 'medium' as const, technique: 'Stolen API Key -> EC2 Instance Spin-Up -> XMRig Miner Deploy -> Profit', speed: 0.016, attackShape: 'vortex' as const, mitre: 'T1496', killChainStage: 'Impact', affectedNodes: [3, 17] },
  { name: 'Phishing -> AD Compromise', type: 'Credential Phishing', sourceIdx: 11, targetIdx: 10, waypoints: [8, 0], severity: 'critical' as const, technique: 'HTML Smuggling -> Macro Dropper -> Mimikatz -> DCSync -> Domain Admin', speed: 0.009, attackShape: 'worm' as const, mitre: 'T1566.001 -> T1003 -> T1078.002', killChainStage: 'Privilege Escalation', affectedNodes: [8, 0, 10] },
  { name: 'Zero-Day Browser RCE', type: 'Watering Hole', sourceIdx: 11, targetIdx: 2, waypoints: [], severity: 'critical' as const, technique: 'Compromised CDN -> V8 Type Confusion -> Sandbox Escape -> Reverse Shell', speed: 0.02, attackShape: 'lightning' as const, mitre: 'T1189 -> T1203', killChainStage: 'Exploitation', affectedNodes: [2] },
  { name: 'MitM VPN Intercept', type: 'Man-in-the-Middle', sourceIdx: 14, targetIdx: 9, waypoints: [], severity: 'high' as const, technique: 'ARP Poison -> SSL Strip -> Session Token Harvest -> Replay Attack', speed: 0.018, attackShape: 'nova' as const, mitre: 'T1557 -> T1539', killChainStage: 'Collection', affectedNodes: [9] },
  { name: 'Living-off-the-Land Stealth', type: 'Fileless Malware', sourceIdx: 12, targetIdx: 0, waypoints: [2, 10], severity: 'critical' as const, technique: 'WMI Persistence -> PowerShell IEX -> Scheduled Tasks -> Registry Run Keys', speed: 0.006, attackShape: 'spiral' as const, mitre: 'T1047 -> T1059.001 -> T1053', killChainStage: 'Persistence', affectedNodes: [2, 10, 0] },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const nodeMeshesRef = useRef<THREE.Mesh[]>([]);
  const shieldRef = useRef<THREE.Mesh | null>(null);
  const particleFieldRef = useRef<THREE.Points | null>(null);
  const connectionLinesRef = useRef<THREE.Line[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const arcsRef = useRef<ArcConnection[]>([]);
  const infectedNodesRef = useRef<Set<number>>(new Set());
  const timeRef = useRef(0);
  const frameRef = useRef<number>(0);
  const alertFlashRef = useRef(0);

  // -------------------------------------------------------------------------
  // Scene setup
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010209);
    scene.fog = new THREE.FogExp2(0x010209, 0.01);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(22, 18, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x1a2a4a, 0.4));
    const dirLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0x0066ff, 0.8, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);
    const redLight = new THREE.PointLight(0xff2200, 0, 40);
    redLight.position.set(0, 3, 0);
    scene.add(redLight);
    scene.userData.redLight = redLight;

    buildGrid(scene);
    buildNodes(scene);
    buildConnections(scene);
    buildShield(scene);
    buildParticleField(scene);

    let angle = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.016;
      angle += 0.0012;

      camera.position.x = Math.cos(angle) * 26;
      camera.position.z = Math.sin(angle) * 26;
      camera.position.y = 16 + Math.sin(timeRef.current * 0.15) * 3;
      camera.lookAt(0, 0, 0);

      // Red alert flash
      if (alertFlashRef.current > 0) {
        redLight.intensity = alertFlashRef.current * 3;
        alertFlashRef.current *= 0.96;
        if (alertFlashRef.current < 0.01) alertFlashRef.current = 0;
      } else {
        redLight.intensity = 0;
      }

      tickNodes();
      tickShield();
      tickParticles();
      tickConnections();
      tickExplosions();
      tickArcs();
      tickAttacks();
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

  // -------------------------------------------------------------------------
  // Build functions
  // -------------------------------------------------------------------------

  const buildGrid = (scene: THREE.Scene) => {
    const grid = new THREE.GridHelper(60, 60, 0x0a1830, 0x060d1a);
    grid.position.y = -0.5;
    scene.add(grid);

    for (const r of [10, 15, 20]) {
      const geo = new THREE.RingGeometry(r - 0.15, r, 64);
      const mat = new THREE.MeshBasicMaterial({ color: 0x0a3060, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.45;
      scene.add(ring);
    }
  };

  const buildNodes = (scene: THREE.Scene) => {
    NETWORK_NODES.forEach((node) => {
      const geo = new THREE.IcosahedronGeometry(node.size, 2);
      const mat = new THREE.MeshPhongMaterial({
        color: node.color, emissive: node.color, emissiveIntensity: 0.5,
        shininess: 100, specular: 0x444444,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...node.pos);
      scene.add(mesh);
      nodeMeshesRef.current.push(mesh);

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

      const glowGeo = new THREE.SphereGeometry(node.size * 2.5, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.04 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(...node.pos);
      scene.add(glow);
      nodeGlowsRef.current.push(glow);

      if (node.type === 'threat') {
        const dangerGeo = new THREE.OctahedronGeometry(node.size * 0.5, 0);
        const dangerMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
        const danger = new THREE.Mesh(dangerGeo, dangerMat);
        danger.position.set(node.pos[0], node.pos[1] + node.size + 0.6, node.pos[2]);
        scene.add(danger);
        nodeGlowsRef.current.push(danger);
      }
    });
  };

  const buildConnections = (scene: THREE.Scene) => {
    CONNECTIONS.forEach(([fi, ti]) => {
      const from = NETWORK_NODES[fi];
      const to = NETWORK_NODES[ti];
      const midY = Math.max(from.pos[1], to.pos[1]) + 0.8;
      const midX = (from.pos[0] + to.pos[0]) / 2;
      const midZ = (from.pos[2] + to.pos[2]) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...from.pos),
        new THREE.Vector3(midX, midY, midZ),
        new THREE.Vector3(...to.pos),
      ]);
      const points = curve.getPoints(40);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0x0a2a50, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      connectionLinesRef.current.push(line);
    });
  };

  const buildShield = (scene: THREE.Scene) => {
    const geo = new THREE.IcosahedronGeometry(13, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.025, wireframe: true, side: THREE.DoubleSide });
    const shield = new THREE.Mesh(geo, mat);
    shield.position.y = 1;
    scene.add(shield);
    shieldRef.current = shield;
  };

  const buildParticleField = (scene: THREE.Scene) => {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 14 + Math.random() * 35;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = new THREE.Color(Math.random() > 0.8 ? 0x0066ff : Math.random() > 0.5 ? 0x112244 : 0x001122);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sizes[i] = 0.06 + Math.random() * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.12, transparent: true, opacity: 0.35, vertexColors: true, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    particleFieldRef.current = pts;
  };

  // -------------------------------------------------------------------------
  // Animation ticks
  // -------------------------------------------------------------------------

  const tickNodes = () => {
    const t = timeRef.current;
    const infected = infectedNodesRef.current;

    nodeRingsRef.current.forEach((ring, i) => {
      ring.rotation.z = t * 0.3 + i * 0.5;
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 2 + i) * 0.08;
    });

    nodeMeshesRef.current.forEach((mesh, i) => {
      const node = NETWORK_NODES[i];
      if (!node) return;
      if (infected.has(i)) {
        const flashRate = 4 + Math.sin(t + i) * 2;
        const flash = Math.sin(t * flashRate) * 0.5 + 0.5;
        (mesh.material as THREE.MeshPhongMaterial).emissive.setHex(
          flash > 0.5 ? 0xff2200 : node.color
        );
        (mesh.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.5 + flash * 1.5;
        mesh.scale.setScalar(1 + Math.sin(t * 6 + i) * 0.08);
      } else {
        (mesh.material as THREE.MeshPhongMaterial).emissive.setHex(node.color);
        (mesh.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.5;
        mesh.scale.setScalar(1);
      }
    });

    nodeGlowsRef.current.forEach((glow, i) => {
      glow.scale.setScalar(1 + Math.sin(t * 1.5 + i * 0.7) * 0.15);
      if (glow.geometry.type === 'OctahedronGeometry') {
        glow.rotation.y = t * 2.5;
        glow.rotation.x = t * 1.8;
        const mat = glow.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.4 + Math.sin(t * 4) * 0.3;
      }
    });
  };

  const tickShield = () => {
    if (!shieldRef.current) return;
    const t = timeRef.current;
    shieldRef.current.rotation.y = t * 0.04;
    shieldRef.current.rotation.x = Math.sin(t * 0.08) * 0.08;
    const mat = shieldRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.015 + Math.sin(t * 0.5) * 0.01;
    if (alertFlashRef.current > 0.1) {
      mat.color.setHex(0xff2200);
      mat.opacity = 0.03 + alertFlashRef.current * 0.04;
    } else {
      mat.color.setHex(0x0066ff);
    }
  };

  const tickParticles = () => {
    if (!particleFieldRef.current) return;
    particleFieldRef.current.rotation.y = timeRef.current * 0.008;
    const positions = particleFieldRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] += Math.sin(timeRef.current + i * 0.1) * 0.002;
    }
    particleFieldRef.current.geometry.attributes.position.needsUpdate = true;
  };

  const tickConnections = () => {
    const t = timeRef.current;
    connectionLinesRef.current.forEach((line, i) => {
      const mat = line.material as THREE.LineBasicMaterial;
      const base = 0.15 + Math.sin(t * 1.5 + i * 0.8) * 0.08;
      mat.opacity = base;
    });
  };

  // -------------------------------------------------------------------------
  // Explosions, arcs, infection
  // -------------------------------------------------------------------------

  const spawnExplosion = useCallback((position: THREE.Vector3, color: number, type: Explosion['type'] = 'ring') => {
    if (!sceneRef.current) return;
    const objects: THREE.Object3D[] = [];

    if (type === 'shockwave' || type === 'ring') {
      for (let r = 0; r < 3; r++) {
        const geo = new THREE.RingGeometry(0.1, 0.3, 32);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(position);
        ring.lookAt(position.x, position.y + 10, position.z);
        ring.userData = { delay: r * 0.15 };
        sceneRef.current.add(ring);
        objects.push(ring);
      }
    }

    if (type === 'burst' || type === 'shockwave') {
      const count = type === 'shockwave' ? 60 : 30;
      const positions = new Float32Array(count * 3);
      const velocities: number[] = [];
      for (let i = 0; i < count; i++) {
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
        const angle = Math.random() * Math.PI * 2;
        const elev = (Math.random() - 0.5) * Math.PI;
        const spd = 0.1 + Math.random() * 0.3;
        velocities.push(Math.cos(angle) * Math.cos(elev) * spd, Math.sin(elev) * spd, Math.sin(angle) * Math.cos(elev) * spd);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color, size: 0.15, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat);
      pts.userData = { velocities };
      sceneRef.current.add(pts);
      objects.push(pts);
    }

    if (type === 'infection') {
      const geo = new THREE.SphereGeometry(0.5, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, wireframe: true });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.copy(position);
      sceneRef.current.add(sphere);
      objects.push(sphere);
    }

    explosionsRef.current.push({
      position: position.clone(), color, born: timeRef.current,
      life: type === 'shockwave' ? 3.0 : type === 'infection' ? 4.0 : 2.0, objects, type,
    });

    alertFlashRef.current = Math.min(1, alertFlashRef.current + 0.5);
  }, []);

  const spawnArc = useCallback((from: THREE.Vector3, to: THREE.Vector3, color: number) => {
    if (!sceneRef.current) return;
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
    mid.y += 2 + Math.random() * 2;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const pts = curve.getPoints(30);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    sceneRef.current.add(line);
    arcsRef.current.push({ from: from.clone(), to: to.clone(), born: timeRef.current, life: 1.5, color, line, intensity: 1 });
  }, []);

  const tickExplosions = () => {
    const t = timeRef.current;
    const toRemove: number[] = [];
    explosionsRef.current.forEach((exp, idx) => {
      const age = t - exp.born;
      if (age > exp.life) { toRemove.push(idx); return; }
      const norm = age / exp.life;

      exp.objects.forEach(obj => {
        if ((obj as THREE.Mesh).geometry?.type === 'RingGeometry') {
          const delay = obj.userData.delay || 0;
          const localAge = Math.max(0, age - delay);
          const localNorm = Math.min(1, localAge / (exp.life - delay));
          const scale = 1 + localNorm * (exp.type === 'shockwave' ? 14 : 8);
          obj.scale.setScalar(scale);
          (obj.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - localNorm);
        } else if ((obj as THREE.Points).isPoints) {
          const positions = (obj as THREE.Points).geometry.attributes.position.array as Float32Array;
          const vel = obj.userData.velocities;
          const count = positions.length / 3;
          for (let i = 0; i < count; i++) {
            positions[i * 3] += vel[i * 3] * (1 - norm * 0.5);
            positions[i * 3 + 1] += vel[i * 3 + 1] * (1 - norm * 0.5);
            positions[i * 3 + 2] += vel[i * 3 + 2] * (1 - norm * 0.5);
          }
          (obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
          ((obj as THREE.Points).material as THREE.PointsMaterial).opacity = 1 - norm;
        } else if ((obj as THREE.Mesh).geometry?.type === 'SphereGeometry') {
          const scale = 0.5 + norm * 8;
          obj.scale.setScalar(scale);
          obj.rotation.y = t * 2;
          obj.rotation.x = t * 1.5;
          (obj.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - norm);
        }
      });
    });

    toRemove.reverse().forEach(i => {
      const exp = explosionsRef.current[i];
      exp.objects.forEach(obj => {
        sceneRef.current?.remove(obj);
        if ((obj as any).geometry) (obj as any).geometry.dispose();
        if ((obj as any).material) (obj as any).material.dispose();
      });
      explosionsRef.current.splice(i, 1);
    });
  };

  const tickArcs = () => {
    const t = timeRef.current;
    const toRemove: number[] = [];
    arcsRef.current.forEach((arc, idx) => {
      const age = t - arc.born;
      if (age > arc.life) { toRemove.push(idx); return; }
      const norm = age / arc.life;

      // Re-jitter the arc points for electric effect
      const from = arc.from;
      const to = arc.to;
      const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
      mid.y += 2;
      const curve = new THREE.CatmullRomCurve3([from, mid, to]);
      const pts = curve.getPoints(30).map((p, i) => {
        if (i > 0 && i < 29) {
          p.x += (Math.random() - 0.5) * 0.6 * (1 - norm);
          p.y += (Math.random() - 0.5) * 0.4 * (1 - norm);
          p.z += (Math.random() - 0.5) * 0.6 * (1 - norm);
        }
        return p;
      });
      arc.line.geometry.dispose();
      arc.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      (arc.line.material as THREE.LineBasicMaterial).opacity = (1 - norm) * arc.intensity;
    });
    toRemove.reverse().forEach(i => {
      const arc = arcsRef.current[i];
      sceneRef.current?.remove(arc.line);
      arc.line.geometry.dispose();
      (arc.line.material as THREE.Material).dispose();
      arcsRef.current.splice(i, 1);
    });
  };

  // -------------------------------------------------------------------------
  // Attack shape creators
  // -------------------------------------------------------------------------

  const createAttackVisualization = useCallback((attack: AttackVector) => {
    if (!sceneRef.current) return;
    const points = attack.path.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(points);
    const color = SEVERITY_COLORS[attack.severity];
    const objects: THREE.Object3D[] = [];

    const trailPoints = curve.getPoints(120);
    const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.12 });
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.userData = { type: 'trail' };
    objects.push(trail);

    switch (attack.attackShape) {
      case 'worm': buildWorm(color, objects); break;
      case 'wave': buildWave(color, objects); break;
      case 'swarm': buildSwarm(color, objects); break;
      case 'spiral': buildSpiral(color, objects); break;
      case 'pulse': buildPulse(color, objects); break;
      case 'lightning': buildLightning(curve, color, objects); break;
      case 'nova': buildNova(color, objects); break;
      case 'plague': buildPlague(color, objects); break;
      case 'vortex': buildVortex(color, objects); break;
      default: buildBeam(color, objects);
    }

    objects.forEach(o => sceneRef.current?.add(o));
    attackObjectsRef.current.set(attack.id, { curve, objects });
  }, []);

  const buildWorm = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 50; i++) {
      const size = 0.14 + (1 - i / 50) * 0.1;
      const geo = new THREE.SphereGeometry(size, 8, 8);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.8 - (i / 50), transparent: true, opacity: 0.95 - (i / 50) * 0.5 });
      const s = new THREE.Mesh(geo, mat);
      s.userData = { index: i, type: 'worm' };
      objects.push(s);
    }
  };

  const buildWave = (color: number, objects: THREE.Object3D[]) => {
    const count = 400;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.userData = { type: 'wave' };
    objects.push(pts);
  };

  const buildSwarm = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 100; i++) {
      const geo = new THREE.TetrahedronGeometry(0.06 + Math.random() * 0.05, 0);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'swarm', offset: { x: (Math.random() - 0.5) * 2.5, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2.5 } };
      objects.push(p);
    }
  };

  const buildSpiral = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.OctahedronGeometry(0.09, 0);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 2.0, transparent: true, opacity: 0.9 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'spiral' };
      objects.push(p);
    }
  };

  const buildPulse = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.25, 16, 16);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 2.5, transparent: true, opacity: 0.85 });
      const s = new THREE.Mesh(geo, mat);
      s.userData = { index: i, type: 'pulse' };
      objects.push(s);
    }
  };

  const buildLightning = (curve: THREE.CatmullRomCurve3, color: number, objects: THREE.Object3D[]) => {
    for (let b = 0; b < 4; b++) {
      const pts = curve.getPoints(25).map((p, i) => {
        if (i > 0 && i < 24) {
          p.x += (Math.random() - 0.5) * 1.5;
          p.y += (Math.random() - 0.5) * 0.8;
          p.z += (Math.random() - 0.5) * 1.5;
        }
        return p;
      });
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(geo, mat);
      line.userData = { type: 'lightning', branch: b };
      objects.push(line);
    }
    const coreGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const coreMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.userData = { type: 'lightningCore' };
    objects.push(core);
  };

  const buildNova = (color: number, objects: THREE.Object3D[]) => {
    const geo = new THREE.SphereGeometry(0.4, 16, 16);
    const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(geo, mat);
    core.userData = { type: 'novaCore' };
    objects.push(core);
    for (let r = 0; r < 3; r++) {
      const rGeo = new THREE.RingGeometry(0.3, 0.5, 32);
      const rMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.userData = { type: 'novaRing', index: r };
      objects.push(ring);
    }
  };

  const buildPlague = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 70; i++) {
      const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.06, 6, 6);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'plague', drift: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 1.5, z: (Math.random() - 0.5) * 3 }, spreadPhase: Math.random() };
      objects.push(p);
    }
  };

  const buildVortex = (color: number, objects: THREE.Object3D[]) => {
    for (let i = 0; i < 60; i++) {
      const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
      const p = new THREE.Mesh(geo, mat);
      p.userData = { index: i, type: 'vortex', angleOff: (i / 60) * Math.PI * 2, radiusOff: 0.3 + Math.random() * 1.5 };
      objects.push(p);
    }
  };

  const buildBeam = (color: number, objects: THREE.Object3D[]) => {
    const count = 100;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.18, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.userData = { type: 'beamParticles' };
    objects.push(pts);
    const coreGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const coreMat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 2.5, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.userData = { type: 'beamCore' };
    objects.push(core);
  };

  // -------------------------------------------------------------------------
  // Main attack animation
  // -------------------------------------------------------------------------

  const tickAttacks = useCallback(() => {
    const t = timeRef.current;
    attacks.forEach((attack) => {
      const data = attackObjectsRef.current.get(attack.id);
      if (!data) return;
      const { curve, objects } = data;
      const prog = Math.min(attack.progress, 0.99);

      objects.forEach((obj) => {
        const tp = obj.userData.type;
        if (tp === 'trail') {
          (obj as THREE.Line).material && ((obj as THREE.Line).material as THREE.LineBasicMaterial).opacity;
          const mat = (obj as THREE.Line).material as THREE.LineBasicMaterial;
          mat.opacity = 0.08 + Math.sin(t * 3) * 0.04;
          return;
        }
        if (tp === 'worm') {
          const idx = obj.userData.index;
          const segT = Math.max(0, Math.min(0.99, prog - (idx / 50) * 0.18));
          const pos = curve.getPointAt(segT);
          obj.position.copy(pos);
          const wobble = Math.sin(t * 8 + idx * 0.4) * 0.2;
          const wobbleZ = Math.cos(t * 6 + idx * 0.5) * 0.15;
          obj.position.y += wobble;
          obj.position.x += wobbleZ;
          obj.scale.setScalar(0.6 + Math.sin(t * 7 + idx) * 0.4);
        } else if (tp === 'wave') {
          const positions = (obj as THREE.Points).geometry.attributes.position.array as Float32Array;
          const count = positions.length / 3;
          for (let i = 0; i < count; i++) {
            const pT = Math.max(0, Math.min(0.99, prog + (Math.random() - 0.5) * 0.2));
            const pos = curve.getPointAt(pT);
            const spread = 1.5 + prog * 3;
            positions[i * 3] = pos.x + (Math.random() - 0.5) * spread;
            positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread * 0.6;
            positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
          }
          (obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
          ((obj as THREE.Points).material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(t * 4) * 0.2;
        } else if (tp === 'swarm') {
          const idx = obj.userData.index;
          const off = obj.userData.offset;
          const segT = Math.max(0, Math.min(0.99, prog + (idx / 100) * 0.25 - 0.12));
          const pos = curve.getPointAt(segT);
          const swirl = t * 4 + idx;
          obj.position.set(
            pos.x + off.x * Math.sin(swirl) * 0.6,
            pos.y + off.y * Math.cos(swirl * 0.7) * 0.5,
            pos.z + off.z * Math.cos(swirl) * 0.6
          );
          obj.rotation.y = t * 5 + idx;
          obj.rotation.x = t * 3.5;
        } else if (tp === 'spiral') {
          const idx = obj.userData.index;
          const segT = Math.max(0, Math.min(0.99, prog * 0.85 + (idx / 40) * 0.15));
          const pos = curve.getPointAt(segT);
          const angle = (idx / 40) * Math.PI * 10 + t * 3;
          const radius = 0.5 + Math.sin(t * 1.5 + idx * 0.3) * 0.3;
          obj.position.set(pos.x + Math.cos(angle) * radius, pos.y + Math.sin(angle * 0.5) * 0.4, pos.z + Math.sin(angle) * radius);
          obj.rotation.y = t * 4;
        } else if (tp === 'pulse') {
          const idx = obj.userData.index;
          const pulseT = Math.max(0, Math.min(0.99, prog - idx * 0.06));
          if (pulseT > 0) {
            const pos = curve.getPointAt(pulseT);
            obj.position.copy(pos);
            const scale = 0.6 + Math.abs(Math.sin(t * 10 + idx * 2.5)) * 0.8;
            obj.scale.setScalar(scale);
            obj.visible = true;
          } else { obj.visible = false; }
        } else if (tp === 'lightning') {
          const branch = obj.userData.branch;
          const pts = curve.getPoints(25).map((p, i) => {
            if (i > 0 && i < 24) {
              const jitter = Math.sin(t * 20 + branch * 5 + i) * 0.8;
              p.x += jitter * (Math.random() - 0.5);
              p.y += jitter * (Math.random() - 0.5) * 0.5;
              p.z += jitter * (Math.random() - 0.5);
            }
            const lineT = i / 24;
            if (lineT > prog + 0.05) { p.set(0, -100, 0); }
            return p;
          });
          (obj as THREE.Line).geometry.dispose();
          (obj as THREE.Line).geometry = new THREE.BufferGeometry().setFromPoints(pts);
          ((obj as THREE.Line).material as THREE.LineBasicMaterial).opacity = 0.4 + Math.random() * 0.5;
        } else if (tp === 'lightningCore') {
          const pos = curve.getPointAt(Math.min(prog, 0.99));
          obj.position.copy(pos);
          obj.scale.setScalar(0.5 + Math.random() * 0.5);
        } else if (tp === 'novaCore') {
          const pos = curve.getPointAt(Math.min(prog, 0.99));
          obj.position.copy(pos);
          obj.scale.setScalar(0.8 + Math.sin(t * 8) * 0.4);
        } else if (tp === 'novaRing') {
          const pos = curve.getPointAt(Math.min(prog, 0.99));
          obj.position.copy(pos);
          const idx = obj.userData.index;
          const ringScale = 1 + Math.sin(t * 4 + idx * 2) * 0.5 + prog * 2;
          obj.scale.setScalar(ringScale);
          obj.rotation.x = t * (1 + idx * 0.5);
          obj.rotation.y = t * (0.5 + idx * 0.3);
          (obj.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - prog * 0.5);
        } else if (tp === 'plague') {
          const idx = obj.userData.index;
          const drift = obj.userData.drift;
          const sp = obj.userData.spreadPhase;
          const segT = Math.max(0, Math.min(0.99, prog + sp * 0.15 - 0.07));
          const pos = curve.getPointAt(segT);
          const spreadFactor = Math.min(1, prog * 2);
          obj.position.set(
            pos.x + drift.x * spreadFactor * (1 + Math.sin(t * 2 + idx)),
            pos.y + drift.y * spreadFactor * Math.cos(t * 1.5 + idx),
            pos.z + drift.z * spreadFactor * (1 + Math.cos(t * 2.5 + idx))
          );
          obj.scale.setScalar(0.7 + Math.sin(t * 5 + idx * 0.8) * 0.4);
        } else if (tp === 'vortex') {
          const idx = obj.userData.index;
          const angleOff = obj.userData.angleOff;
          const radiusOff = obj.userData.radiusOff;
          const pos = curve.getPointAt(Math.min(prog, 0.99));
          const angle = angleOff + t * 5;
          const r = radiusOff * (0.5 + prog);
          obj.position.set(pos.x + Math.cos(angle) * r, pos.y + (idx / 60 - 0.5) * 2, pos.z + Math.sin(angle) * r);
          obj.rotation.y = t * 6;
          obj.rotation.z = t * 4;
        } else if (tp === 'beamParticles') {
          const positions = (obj as THREE.Points).geometry.attributes.position.array as Float32Array;
          const count = positions.length / 3;
          const visible = Math.floor(prog * count);
          for (let i = 0; i < visible; i++) {
            const pT = Math.max(0, Math.min(0.99, (i / count) * prog));
            const pos = curve.getPointAt(pT);
            positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.3;
            positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
          }
          (obj as THREE.Points).geometry.attributes.position.needsUpdate = true;
        } else if (tp === 'beamCore') {
          const pos = curve.getPointAt(Math.min(prog, 0.99));
          obj.position.copy(pos);
          obj.scale.setScalar(0.7 + Math.sin(t * 12) * 0.35);
        }
      });
    });
  }, [attacks]);

  // -------------------------------------------------------------------------
  // Attack lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    attacks.forEach((attack) => {
      if (attack.progress < 1 && !attackObjectsRef.current.has(attack.id)) {
        createAttackVisualization(attack);
      }

      // Spawn infection / connections at progress milestones
      if (attack.progress > 0.3 && attack.progress < 0.35 && attack.affectedNodes.length > 0) {
        const nodeIdx = attack.affectedNodes[0];
        const node = NETWORK_NODES[nodeIdx];
        if (node && !infectedNodesRef.current.has(nodeIdx)) {
          infectedNodesRef.current.add(nodeIdx);
          spawnExplosion(new THREE.Vector3(...node.pos), SEVERITY_COLORS[attack.severity], 'infection');
        }
      }

      if (attack.progress > 0.6 && attack.progress < 0.65 && attack.affectedNodes.length > 1) {
        for (let i = 1; i < Math.min(3, attack.affectedNodes.length); i++) {
          const ni = attack.affectedNodes[i];
          const node = NETWORK_NODES[ni];
          if (node && !infectedNodesRef.current.has(ni)) {
            infectedNodesRef.current.add(ni);
            spawnExplosion(new THREE.Vector3(...node.pos), SEVERITY_COLORS[attack.severity], 'burst');
          }
        }
        // Electric arc between infected nodes
        if (attack.affectedNodes.length >= 2) {
          const n1 = NETWORK_NODES[attack.affectedNodes[0]];
          const n2 = NETWORK_NODES[attack.affectedNodes[1]];
          if (n1 && n2) {
            spawnArc(new THREE.Vector3(...n1.pos), new THREE.Vector3(...n2.pos), SEVERITY_COLORS[attack.severity]);
          }
        }
      }

      if (attack.progress >= 1) {
        const data = attackObjectsRef.current.get(attack.id);
        if (data) {
          const last = attack.path[attack.path.length - 1];
          const pos = new THREE.Vector3(last.x, last.y, last.z);
          spawnExplosion(pos, SEVERITY_COLORS[attack.severity], 'shockwave');

          // Chain-react arcs on completion
          for (let i = 0; i < attack.affectedNodes.length - 1; i++) {
            const na = NETWORK_NODES[attack.affectedNodes[i]];
            const nb = NETWORK_NODES[attack.affectedNodes[i + 1]];
            if (na && nb) spawnArc(new THREE.Vector3(...na.pos), new THREE.Vector3(...nb.pos), SEVERITY_COLORS[attack.severity]);
          }

          // Cleanup infected nodes after a delay
          setTimeout(() => {
            attack.affectedNodes.forEach(ni => infectedNodesRef.current.delete(ni));
          }, 4000);

          data.objects.forEach((obj) => {
            sceneRef.current?.remove(obj);
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) {
              const m = (obj as any).material;
              if (Array.isArray(m)) m.forEach((mm: THREE.Material) => mm.dispose());
              else m.dispose();
            }
          });
          attackObjectsRef.current.delete(attack.id);
        }
      }
    });
    setAttacks(prev => prev.filter(a => a.progress < 1.5));
  }, [attacks, createAttackVisualization, spawnExplosion, spawnArc]);

  // Stats
  useEffect(() => {
    const inProgress = attacks.filter(a => a.progress < 1).length;
    const completed = attacks.filter(a => a.progress >= 1).length;
    setStats(prev => ({
      total: attacks.length,
      blocked: Math.floor(completed * 0.45),
      inProgress,
      totalBlocked: prev.totalBlocked + (completed > 0 ? Math.floor(completed * 0.45) : 0),
    }));
  }, [attacks]);

  // Spawn new attacks
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
        name: template.name, type: template.type,
        source: { x: source.pos[0], y: source.pos[1], z: source.pos[2], label: source.label },
        target: { x: target.pos[0], y: target.pos[1], z: target.pos[2], label: target.label },
        path, severity: template.severity, technique: template.technique,
        speed: template.speed, attackShape: template.attackShape, mitre: template.mitre,
        blocked: Math.random() > 0.55, progress: 0,
        killChainStage: template.killChainStage, affectedNodes: template.affectedNodes,
      };
      setAttacks(prev => [...prev.filter(a => a.progress < 1), newAttack]);
    };
    generate();
    const interval = setInterval(generate, 4500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Progress tick
  useEffect(() => {
    const interval = setInterval(() => {
      setAttacks(prev => prev.map(a =>
        a.progress < 1 ? { ...a, progress: Math.min(1, a.progress + a.speed) } : a
      ));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const sevColor = (sev: string) => `#${(SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] || 0xffffff).toString(16).padStart(6, '0')}`;

  const SHAPE_ICON: Record<string, typeof Skull> = {
    worm: Bug, plague: Skull, wave: Wifi, swarm: Bug, lightning: Zap,
    nova: Flame, spiral: Activity, pulse: Radio, vortex: Activity, beam: Zap,
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Top-right stats */}
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

      {/* Left panel: Live attack list */}
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
          <div className="max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b #0f172a' }}>
            {attacks.length === 0 ? (
              <div className="p-6 text-center">
                <Crosshair className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-xs">Scanning perimeter...</p>
              </div>
            ) : (
              attacks.map((attack) => {
                const ShapeIcon = SHAPE_ICON[attack.attackShape] || Zap;
                return (
                  <div
                    key={attack.id}
                    onClick={() => setSelectedAttack(attack)}
                    className={`px-4 py-3 border-b border-slate-800/50 cursor-pointer transition-all hover:bg-slate-800/40 ${
                      selectedAttack?.id === attack.id ? 'bg-slate-800/60 border-l-2' : ''
                    }`}
                    style={selectedAttack?.id === attack.id ? { borderLeftColor: sevColor(attack.severity) } : undefined}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-white font-bold text-xs flex items-center gap-1.5">
                        <ShapeIcon className="w-3 h-3" style={{ color: sevColor(attack.severity) }} />
                        {attack.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {attack.blocked && <Shield className="w-3 h-3 text-emerald-400" />}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black`}
                          style={{ backgroundColor: sevColor(attack.severity) + '20', color: sevColor(attack.severity) }}
                        >
                          {attack.severity.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">
                      <span>{attack.source.label}</span>
                      <Zap className="w-2.5 h-2.5 text-red-500" />
                      <span>{attack.target.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-800 text-slate-400 border border-slate-700">{attack.killChainStage}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-800 text-slate-500 border border-slate-700">{attack.attackShape.toUpperCase()}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-100" style={{
                        width: `${attack.progress * 100}%`,
                        backgroundColor: sevColor(attack.severity),
                        boxShadow: `0 0 10px ${sevColor(attack.severity)}60`,
                      }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-slate-600 font-mono">{attack.mitre.split(' -> ')[0]}</span>
                      <span className="text-[9px] font-bold" style={{ color: sevColor(attack.severity) }}>{Math.round(attack.progress * 100)}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedAttack && (
        <div className="absolute bottom-4 right-4 w-96">
          <div className="bg-slate-900/95 backdrop-blur-md rounded-xl border overflow-hidden" style={{ borderColor: sevColor(selectedAttack.severity) + '40' }}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" style={{ color: sevColor(selectedAttack.severity) }} />
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
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/60 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 font-bold tracking-wider">KILL CHAIN</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: sevColor(selectedAttack.severity) }}>{selectedAttack.killChainStage}</p>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-500 font-bold tracking-wider">SHAPE</p>
                  <p className="text-xs text-white font-medium mt-0.5 uppercase">{selectedAttack.attackShape}</p>
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
                  {selectedAttack.mitre.split(' -> ').map(t => (
                    <span key={t} className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider mb-1">AFFECTED NODES</p>
                <div className="flex flex-wrap gap-1">
                  {selectedAttack.affectedNodes.map(ni => (
                    <span key={ni} className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                      {NETWORK_NODES[ni]?.label || `Node ${ni}`}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider mb-1.5">PROGRESS</p>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${selectedAttack.progress * 100}%`,
                    backgroundColor: sevColor(selectedAttack.severity),
                    boxShadow: `0 0 12px ${sevColor(selectedAttack.severity)}40`,
                  }} />
                </div>
                <p className="text-right text-[10px] text-slate-500 mt-0.5 font-bold">{Math.round(selectedAttack.progress * 100)}%</p>
              </div>
              {selectedAttack.severity === 'critical' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
                  <Skull className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-[10px] text-red-400 font-bold">CRITICAL: Immediate containment required - isolate affected segments</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
