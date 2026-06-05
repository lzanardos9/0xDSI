import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { AlertTriangle, Crosshair, Shield } from 'lucide-react';

interface DomainData {
  id: string;
  name: string;
  health: number;
  pressure: number;
  active: boolean;
  color: string;
  attacks: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitTilt: number;
}

type SeverityLevel = 'normal' | 'elevated' | 'high' | 'critical';

const DOMAINS: DomainData[] = [
  { id: 'identity', name: 'Identity', health: 72, pressure: 68, active: true, color: '#06b6d4', attacks: 14, orbitAngle: 0, orbitSpeed: 0.15, orbitTilt: 0.1 },
  { id: 'endpoint', name: 'Endpoint', health: 58, pressure: 82, active: true, color: '#f59e0b', attacks: 23, orbitAngle: 0.898, orbitSpeed: 0.12, orbitTilt: -0.15 },
  { id: 'network', name: 'Network', health: 85, pressure: 45, active: true, color: '#10b981', attacks: 7, orbitAngle: 1.795, orbitSpeed: 0.18, orbitTilt: 0.2 },
  { id: 'application', name: 'Application', health: 91, pressure: 22, active: false, color: '#3b82f6', attacks: 3, orbitAngle: 2.693, orbitSpeed: 0.14, orbitTilt: -0.08 },
  { id: 'cloud', name: 'Cloud', health: 64, pressure: 71, active: true, color: '#0ea5e9', attacks: 18, orbitAngle: 3.59, orbitSpeed: 0.16, orbitTilt: 0.12 },
  { id: 'data', name: 'Data', health: 44, pressure: 89, active: true, color: '#ef4444', attacks: 31, orbitAngle: 4.488, orbitSpeed: 0.11, orbitTilt: -0.18 },
  { id: 'physical', name: 'Physical', health: 96, pressure: 12, active: false, color: '#22c55e', attacks: 1, orbitAngle: 5.385, orbitSpeed: 0.13, orbitTilt: 0.05 },
];

const MEMORY_TRAIL = [
  { id: '1', label: 'SUNBURST Supply Chain', type: 'campaign' },
  { id: '2', label: 'Lateral Movement #7', type: 'incident' },
  { id: '3', label: 'Cobalt Strike Beacon', type: 'malware' },
  { id: '4', label: 'DC-PROD-01', type: 'asset' },
  { id: '5', label: 'svc_backup@corp', type: 'identity' },
  { id: '6', label: 'Golden Ticket Forge', type: 'incident' },
];

const NEGATIVE_CORRELATIONS = [
  { domain: 'identity', expected: 'MFA Challenge', severity: 'critical' },
  { domain: 'endpoint', expected: 'EDR Heartbeat', severity: 'high' },
  { domain: 'data', expected: 'DLP Scan Confirmation', severity: 'critical' },
];

function getSeverityColors(severity: SeverityLevel) {
  switch (severity) {
    case 'normal': return { primary: new THREE.Color('#10b981'), hex: '#10b981' };
    case 'elevated': return { primary: new THREE.Color('#f59e0b'), hex: '#f59e0b' };
    case 'high': return { primary: new THREE.Color('#f97316'), hex: '#f97316' };
    case 'critical': return { primary: new THREE.Color('#ef4444'), hex: '#ef4444' };
  }
}

const vertexShaderCore = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPulse;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vUv = uv;

    float displacement = sin(position.x * 4.0 + uTime * 2.0) * 0.02 +
                         sin(position.y * 3.0 + uTime * 1.5) * 0.02 +
                         sin(position.z * 5.0 + uTime * 2.5) * 0.015;
    displacement *= uPulse;

    vec3 newPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

const fragmentShaderCore = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uEnergy;

  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);

    vec3 baseColor = uColor * 0.3;
    vec3 glowColor = uColor * (1.0 + fresnel * 2.0);

    float pulse = sin(uTime * 2.0) * 0.15 + 0.85;
    float energyGlow = sin(vPosition.y * 8.0 + uTime * 3.0) * 0.1 + 0.9;

    vec3 finalColor = mix(baseColor, glowColor, fresnel * uEnergy * pulse * energyGlow);
    float alpha = 0.6 + fresnel * 0.4 * uEnergy;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const vertexShaderAtmosphere = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShaderAtmosphere = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;

  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    float pulse = sin(uTime * 1.5) * 0.1 + 0.9;
    vec3 glow = uColor * intensity * uIntensity * pulse;
    float alpha = intensity * 0.6 * uIntensity;
    gl_FragColor = vec4(glow, alpha);
  }
`;

const AttackUniverse = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    coreMesh: THREE.Mesh;
    atmosphereMesh: THREE.Mesh;
    domainNodes: THREE.Group[];
    domainLabels: HTMLDivElement[];
    particleSystems: THREE.Points[];
    orbitLines: THREE.Line[];
    flowLines: THREE.Line[];
    clock: THREE.Clock;
    animId: number;
    mouse: { x: number; y: number };
    targetRotation: { x: number; y: number };
  } | null>(null);

  const [severity, setSeverity] = useState<SeverityLevel>('critical');
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const [coreEnergy, setCoreEnergy] = useState(0.85);
  const [totalAttacks, setTotalAttacks] = useState(97);
  const [threatActor] = useState({ name: 'APT-29 (Cozy Bear)', confidence: 92, objective: 'Data Exfiltration' });
  const severityRef = useRef(severity);
  const energyRef = useRef(coreEnergy);

  useEffect(() => { severityRef.current = severity; }, [severity]);
  useEffect(() => { energyRef.current = coreEnergy; }, [coreEnergy]);

  const createParticleSystem = useCallback((count: number, radius: number, color: THREE.Color) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius * (0.8 + Math.random() * 0.4);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
      sizes[i] = Math.random() * 2 + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.03,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    return new THREE.Points(geometry, material);
  }, []);

  const createEnergyFlow = useCallback((from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color) => {
    const curve = new THREE.QuadraticBezierCurve3(
      from,
      new THREE.Vector3(
        (from.x + to.x) / 2 + (Math.random() - 0.5) * 0.5,
        (from.y + to.y) / 2 + (Math.random() - 0.5) * 0.5,
        (from.z + to.z) / 2 + (Math.random() - 0.5) * 0.5
      ),
      to
    );
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Line(geometry, material);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030712, 0.15);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const colors = getSeverityColors(severityRef.current);

    // Attack Core sphere
    const coreGeometry = new THREE.IcosahedronGeometry(0.6, 5);
    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader: vertexShaderCore,
      fragmentShader: fragmentShaderCore,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: colors.primary.clone() },
        uEnergy: { value: energyRef.current },
        uPulse: { value: 1.0 },
      },
      transparent: true,
      side: THREE.FrontSide,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(coreMesh);

    // Atmosphere glow
    const atmosphereGeometry = new THREE.IcosahedronGeometry(0.75, 4);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: vertexShaderAtmosphere,
      fragmentShader: fragmentShaderAtmosphere,
      uniforms: {
        uColor: { value: colors.primary.clone() },
        uTime: { value: 0 },
        uIntensity: { value: 1.5 },
      },
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphereMesh);

    // Inner glow point light
    const coreLight = new THREE.PointLight(colors.primary.getHex(), 2, 4);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.3);
    scene.add(ambient);

    // Domain nodes (orbital planets)
    const domainNodes: THREE.Group[] = [];
    const domainLabels: HTMLDivElement[] = [];
    const orbitLines: THREE.Line[] = [];

    DOMAINS.forEach((domain) => {
      const group = new THREE.Group();
      group.userData = { ...domain, currentAngle: domain.orbitAngle };

      // Orbit ring
      const orbitRadius = 2.0 + Math.random() * 0.3;
      group.userData.orbitRadius = orbitRadius;

      const orbitCurve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius * (0.85 + Math.random() * 0.15), 0, Math.PI * 2, false, 0);
      const orbitPoints = orbitCurve.getPoints(100);
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
        orbitPoints.map(p => new THREE.Vector3(p.x, 0, p.y))
      );
      const orbitMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color(domain.color),
        transparent: true,
        opacity: 0.08,
      });
      const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
      orbitLine.rotation.x = domain.orbitTilt;
      scene.add(orbitLine);
      orbitLines.push(orbitLine);

      // Domain sphere
      const nodeSize = domain.active ? 0.15 + (domain.pressure / 400) : 0.1;
      const nodeGeometry = new THREE.IcosahedronGeometry(nodeSize, 2);
      const nodeMaterial = new THREE.MeshPhongMaterial({
        color: new THREE.Color(domain.color),
        emissive: new THREE.Color(domain.color),
        emissiveIntensity: domain.active ? 0.4 : 0.1,
        transparent: true,
        opacity: domain.active ? 0.9 : 0.5,
        shininess: 80,
      });
      const nodeMesh = new THREE.Mesh(nodeGeometry, nodeMaterial);
      group.add(nodeMesh);

      // Node glow ring
      const ringGeometry = new THREE.RingGeometry(nodeSize * 1.3, nodeSize * 1.6, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(domain.color),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.lookAt(camera.position);
      group.add(ring);

      // Point light for each active domain
      if (domain.active) {
        const light = new THREE.PointLight(new THREE.Color(domain.color).getHex(), 0.3, 1.5);
        group.add(light);
      }

      // Position on orbit
      const angle = domain.orbitAngle;
      group.position.set(
        Math.cos(angle) * orbitRadius,
        Math.sin(domain.orbitTilt) * Math.sin(angle) * orbitRadius * 0.3,
        Math.sin(angle) * orbitRadius
      );

      scene.add(group);
      domainNodes.push(group);

      // HTML label overlay
      const label = document.createElement('div');
      label.className = 'domain-label';
      label.innerHTML = `<span class="name">${domain.name}</span><span class="metric">${domain.attacks}</span>`;
      label.style.cssText = `
        position: absolute;
        pointer-events: none;
        font-size: 10px;
        font-weight: 600;
        color: ${domain.color};
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 0 8px ${domain.color}60;
        opacity: 0.85;
        transform: translate(-50%, -50%);
        white-space: nowrap;
      `;
      container.appendChild(label);
      domainLabels.push(label);
    });

    // Particle systems
    const particleSystems: THREE.Points[] = [];

    // Core ambient particles
    const coreParticles = createParticleSystem(200, 1.0, colors.primary);
    scene.add(coreParticles);
    particleSystems.push(coreParticles);

    // Outer field particles
    const fieldParticles = createParticleSystem(400, 3.5, new THREE.Color('#1e3a5f'));
    scene.add(fieldParticles);
    particleSystems.push(fieldParticles);

    // Energy flow particles along attack paths
    const flowLines: THREE.Line[] = [];
    const flowConnections = [
      [0, 1], [1, 4], [4, 5], [0, 4], [2, 1],
    ];
    flowConnections.forEach(([fromIdx, toIdx]) => {
      const fromDomain = domainNodes[fromIdx];
      const toDomain = domainNodes[toIdx];
      if (fromDomain && toDomain) {
        const flow = createEnergyFlow(
          fromDomain.position.clone(),
          toDomain.position.clone(),
          new THREE.Color(DOMAINS[fromIdx].color)
        );
        scene.add(flow);
        flowLines.push(flow);
      }
    });

    // Starfield background
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 40;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0x445566,
      size: 0.02,
      transparent: true,
      opacity: 0.5,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const clock = new THREE.Clock();
    const mouse = { x: 0, y: 0 };
    const targetRotation = { x: 0, y: 0 };

    sceneRef.current = {
      scene, camera, renderer, coreMesh, atmosphereMesh,
      domainNodes, domainLabels, particleSystems, orbitLines, flowLines,
      clock, animId: 0, mouse, targetRotation,
    };

    // Mouse interaction
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;
      targetRotation.x = mouse.y * 0.3;
      targetRotation.y = mouse.x * 0.3;
    };
    container.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const deltaTime = clock.getDelta();

      // Update core shader
      const cMat = coreMesh.material as THREE.ShaderMaterial;
      cMat.uniforms.uTime.value = elapsed;
      cMat.uniforms.uEnergy.value = energyRef.current;
      cMat.uniforms.uPulse.value = 0.8 + Math.sin(elapsed * 1.5) * 0.2;

      const sevColors = getSeverityColors(severityRef.current);
      cMat.uniforms.uColor.value.lerp(sevColors.primary, 0.02);

      const aMat = atmosphereMesh.material as THREE.ShaderMaterial;
      aMat.uniforms.uTime.value = elapsed;
      aMat.uniforms.uColor.value.lerp(sevColors.primary, 0.02);
      aMat.uniforms.uIntensity.value = 1.0 + Math.sin(elapsed * 0.8) * 0.3;

      // Rotate core
      coreMesh.rotation.y += 0.003;
      coreMesh.rotation.x = Math.sin(elapsed * 0.5) * 0.1;

      // Update core light
      coreLight.color.lerp(sevColors.primary, 0.02);
      coreLight.intensity = 1.5 + Math.sin(elapsed * 2) * 0.5;

      // Orbit domain nodes
      domainNodes.forEach((group, idx) => {
        const data = group.userData;
        data.currentAngle += data.orbitSpeed * 0.01;
        const angle = data.currentAngle;
        const r = data.orbitRadius;

        group.position.set(
          Math.cos(angle) * r,
          Math.sin(data.orbitTilt * 3) * Math.sin(angle) * r * 0.25,
          Math.sin(angle) * r
        );

        // Rotate the node itself
        const nodeMesh = group.children[0] as THREE.Mesh;
        if (nodeMesh) {
          nodeMesh.rotation.y += 0.01;
          nodeMesh.rotation.x += 0.005;
        }

        // Billboard the ring
        const ring = group.children[1] as THREE.Mesh;
        if (ring) {
          ring.lookAt(camera.position);
          const scale = 1 + Math.sin(elapsed * 2 + idx) * 0.1;
          ring.scale.setScalar(scale);
        }

        // Update label position
        if (domainLabels[idx]) {
          const vector = group.position.clone();
          vector.y -= 0.3;
          vector.project(camera);
          const x = (vector.x * 0.5 + 0.5) * width;
          const y = (-vector.y * 0.5 + 0.5) * height;
          domainLabels[idx].style.left = `${x}px`;
          domainLabels[idx].style.top = `${y}px`;
          const dist = camera.position.distanceTo(group.position);
          domainLabels[idx].style.opacity = `${Math.max(0.3, 1 - dist * 0.12)}`;
        }
      });

      // Animate particles
      particleSystems.forEach((ps) => {
        const positions = ps.geometry.attributes.position;
        const velocities = ps.geometry.attributes.velocity;
        if (!positions || !velocities) return;

        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i) + velocities.getX(i);
          const y = positions.getY(i) + velocities.getY(i);
          const z = positions.getZ(i) + velocities.getZ(i);

          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist > 4) {
            const scale = 0.5 / dist;
            positions.setXYZ(i, x * scale, y * scale, z * scale);
          } else {
            positions.setXYZ(i, x, y, z);
          }
        }
        positions.needsUpdate = true;
        ps.rotation.y += 0.0005;
      });

      // Update flow lines based on new positions
      flowLines.forEach((flow, idx) => {
        const [fromIdx, toIdx] = flowConnections[idx];
        const fromNode = domainNodes[fromIdx];
        const toNode = domainNodes[toIdx];
        if (fromNode && toNode) {
          const mid = new THREE.Vector3(
            (fromNode.position.x + toNode.position.x) / 2,
            (fromNode.position.y + toNode.position.y) / 2 + Math.sin(elapsed + idx) * 0.2,
            (fromNode.position.z + toNode.position.z) / 2
          );
          const curve = new THREE.QuadraticBezierCurve3(fromNode.position.clone(), mid, toNode.position.clone());
          const points = curve.getPoints(50);
          flow.geometry.setFromPoints(points);

          const mat = flow.material as THREE.LineBasicMaterial;
          mat.opacity = 0.15 + Math.sin(elapsed * 2 + idx) * 0.1;
        }
      });

      // Camera subtle movement
      camera.position.x += (targetRotation.y * 0.5 - camera.position.x + 0) * 0.02;
      camera.position.y += (targetRotation.x * 0.3 + 0.5 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);

      // Stars rotation
      stars.rotation.y += 0.0001;
      stars.rotation.x += 0.00005;

      renderer.render(scene, camera);
      sceneRef.current!.animId = requestAnimationFrame(animate);
    };

    sceneRef.current.animId = requestAnimationFrame(animate);

    // Resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Simulated data updates
    const dataInterval = setInterval(() => {
      setCoreEnergy(prev => Math.max(0.6, Math.min(1.0, prev + (Math.random() - 0.4) * 0.03)));
      setTotalAttacks(prev => prev + (Math.random() > 0.6 ? 1 : 0));
    }, 3000);

    return () => {
      cancelAnimationFrame(sceneRef.current?.animId || 0);
      container.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      clearInterval(dataInterval);
      domainLabels.forEach(l => l.remove());
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [createParticleSystem, createEnergyFlow]);

  return (
    <div className="relative w-full rounded-2xl border border-slate-700/40 bg-gradient-to-br from-[#030712] via-[#0a0f1e] to-[#030712] overflow-hidden" style={{ height: '620px' }}>
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Title Overlay */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 text-center">
        <div className="flex items-center gap-3 justify-center">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: getSeverityColors(severity).hex }} />
          <span className="text-[10px] font-bold uppercase tracking-[4px] text-slate-500">Attack Universe</span>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: getSeverityColors(severity).hex }} />
        </div>
        <div className="mt-1 flex items-center gap-2 justify-center">
          <span className="text-[22px] font-black tracking-tight" style={{ color: getSeverityColors(severity).hex }}>
            {severity.toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">
            {Math.round(coreEnergy * 100)}% Core Energy
          </span>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="absolute top-5 right-5 z-10 flex flex-col items-end gap-2">
        <div className="px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-900/70 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Active Attacks</span>
          </div>
          <div className="text-xl font-black text-white mt-0.5">{totalAttacks}</div>
        </div>
      </div>

      {/* Threat Actor Panel */}
      <div className="absolute top-20 right-5 z-10 w-52">
        <div className="rounded-xl border border-red-500/20 bg-slate-900/70 backdrop-blur-md p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Crosshair className="w-3 h-3 text-red-400" />
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Threat Actor</span>
          </div>
          <div className="text-sm font-bold text-white mb-1">{threatActor.name}</div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all" style={{ width: `${threatActor.confidence}%` }} />
            </div>
            <span className="text-[10px] font-bold text-red-400">{threatActor.confidence}%</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Objective: <span className="text-amber-400 font-medium">{threatActor.objective}</span>
          </div>
        </div>
      </div>

      {/* Negative Correlations */}
      <div className="absolute top-5 left-5 z-10 space-y-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Missing Signals</span>
        </div>
        {NEGATIVE_CORRELATIONS.map((nc, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-red-500/20 bg-slate-900/60 backdrop-blur-sm"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <div>
              <div className="text-[9px] font-medium text-red-300">{nc.expected}</div>
              <div className="text-[8px] text-slate-500 capitalize">{nc.domain} domain</div>
            </div>
          </div>
        ))}
      </div>

      {/* Memory Trail */}
      <div className="absolute bottom-14 left-4 right-4 z-10">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[9px] font-semibold text-cyan-400 uppercase tracking-wider">Confluence Memory Trail</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {MEMORY_TRAIL.map((item, idx) => {
            const opacity = Math.max(0.4, 1 - idx * 0.1);
            const typeColors: Record<string, string> = {
              incident: 'border-red-500/30 text-red-400',
              campaign: 'border-amber-500/30 text-amber-400',
              malware: 'border-orange-500/30 text-orange-400',
              asset: 'border-blue-500/30 text-blue-400',
              identity: 'border-cyan-500/30 text-cyan-400',
            };
            return (
              <div
                key={item.id}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-md border bg-slate-900/60 backdrop-blur-sm ${typeColors[item.type]}`}
                style={{ opacity }}
              >
                <div className="text-[9px] font-medium whitespace-nowrap">{item.label}</div>
                <div className="text-[8px] text-slate-500 capitalize">{item.type}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Severity Controls */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1">
        {(['normal', 'elevated', 'high', 'critical'] as SeverityLevel[]).map((s) => {
          const c = getSeverityColors(s);
          return (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-2.5 py-1 rounded-md text-[9px] font-semibold uppercase tracking-wider border transition-all duration-300 ${
                severity === s
                  ? 'border-white/20 bg-white/5 scale-105'
                  : 'border-transparent hover:border-white/10 opacity-60 hover:opacity-100'
              }`}
              style={{ color: c.hex }}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Domain Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="flex flex-wrap gap-2">
          {DOMAINS.filter(d => d.active).map(d => (
            <div key={d.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color, boxShadow: `0 0 6px ${d.color}60` }} />
              <span className="text-[8px] text-slate-500 font-medium uppercase">{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none z-[5]" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(3,7,18,0.7) 100%)'
      }} />
    </div>
  );
};

export default AttackUniverse;
