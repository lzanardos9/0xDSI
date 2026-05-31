import * as THREE from 'three';
import type { BuiltAgent } from './soc3dHelpers';

export interface EnergyBeam {
  group: THREE.Group;
  progress: number;
  duration: number;
}

export function spawnEnergyBeam(from: BuiltAgent, to: BuiltAgent, scene: THREE.Scene): EnergyBeam {
  const group = new THREE.Group();
  const fromPos = new THREE.Vector3();
  from.group.getWorldPosition(fromPos);
  fromPos.y += 1.2;
  const toPos = new THREE.Vector3();
  to.group.getWorldPosition(toPos);
  toPos.y += 1.2;

  const mid = new THREE.Vector3().lerpVectors(fromPos, toPos, 0.5);
  mid.y += 1.8;
  const curve = new THREE.QuadraticBezierCurve3(fromPos, mid, toPos);
  const points = curve.getPoints(40);
  const geo = new THREE.BufferGeometry().setFromPoints(points);

  const core = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: from.def.hex, transparent: true, opacity: 0, linewidth: 2,
  }));
  group.add(core);

  const glowGeo = new THREE.BufferGeometry().setFromPoints(points);
  const glow = new THREE.Line(glowGeo, new THREE.LineBasicMaterial({
    color: from.def.hex, transparent: true, opacity: 0, linewidth: 1,
  }));
  group.add(glow);

  const nodeCount = 5;
  for (let i = 0; i < nodeCount; i++) {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color: from.def.hex, transparent: true, opacity: 0 })
    );
    node.userData.curveOffset = i / nodeCount;
    group.add(node);
  }

  scene.add(group);
  return { group, progress: 0, duration: 120 };
}

export function updateEnergyBeam(beam: EnergyBeam): boolean {
  beam.progress++;
  const t = beam.progress / beam.duration;
  if (t >= 1) return true;

  const fadeIn = Math.min(t * 5, 1);
  const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  const opacity = fadeIn * fadeOut * 0.6;

  beam.group.children.forEach((child, idx) => {
    if (child instanceof THREE.Line) {
      (child.material as THREE.LineBasicMaterial).opacity = opacity * (idx === 0 ? 1 : 0.4);
    } else if (child instanceof THREE.Mesh) {
      const off = child.userData.curveOffset || 0;
      const nodeT = (t * 3 + off) % 1;
      const from = beam.group.children[0] as THREE.Line;
      const positions = (from.geometry as THREE.BufferGeometry).attributes.position;
      const idx2 = Math.floor(nodeT * (positions.count - 1));
      child.position.set(
        positions.getX(idx2),
        positions.getY(idx2),
        positions.getZ(idx2)
      );
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity * (0.5 + Math.sin(beam.progress * 0.3 + off * 10) * 0.5);
      const s = 1 + Math.sin(beam.progress * 0.2 + off * 8) * 0.5;
      child.scale.set(s, s, s);
    }
  });
  return false;
}

export function disposeBeam(beam: EnergyBeam, scene: THREE.Scene) {
  beam.group.children.forEach(c => {
    if (c instanceof THREE.Line || c instanceof THREE.Mesh) {
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
  });
  scene.remove(beam.group);
}

export interface FloorPulse {
  ring: THREE.Mesh;
  progress: number;
  maxRadius: number;
  color: number;
}

export function spawnFloorPulse(scene: THREE.Scene, color = 0x06b6d4): FloorPulse {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  scene.add(ring);
  return { ring, progress: 0, maxRadius: 8 + Math.random() * 4, color };
}

export function updateFloorPulse(pulse: FloorPulse): boolean {
  pulse.progress += 0.008;
  if (pulse.progress >= 1) return true;
  const r = pulse.progress * pulse.maxRadius;
  pulse.ring.scale.set(r, r, r);
  const mat = pulse.ring.material as THREE.MeshBasicMaterial;
  mat.opacity = (1 - pulse.progress) * 0.35;
  return false;
}

export function disposeFloorPulse(pulse: FloorPulse, scene: THREE.Scene) {
  pulse.ring.geometry.dispose();
  (pulse.ring.material as THREE.Material).dispose();
  scene.remove(pulse.ring);
}

export interface FloatingLabel {
  sprite: THREE.Sprite;
  baseY: number;
  angle: number;
  radius: number;
  speed: number;
  life: number;
}

const THREAT_LABELS = [
  'APT41 DETECTED', 'LATERAL MOVEMENT', 'C2 BEACON', 'EXFILTRATION',
  'BRUTE FORCE', 'RANSOMWARE', 'PHISHING', 'ZERO-DAY',
  'PRIVILEGE ESC', 'DATA STAGING', 'MIMIKATZ', 'COBALT STRIKE',
];

export function spawnFloatingLabel(scene: THREE.Scene): FloatingLabel {
  const text = THREAT_LABELS[Math.floor(Math.random() * THREAT_LABELS.length)];
  const isHighSev = ['APT41 DETECTED', 'RANSOMWARE', 'ZERO-DAY', 'COBALT STRIKE'].includes(text);
  const color = isHighSev ? '#ef4444' : '#64748b';

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = color;
  ctx.fillText(text, 8, 30);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0 })
  );
  sprite.scale.set(1.5, 0.28, 1);
  const angle = Math.random() * Math.PI * 2;
  const radius = 3 + Math.random() * 4;
  const baseY = 2 + Math.random() * 2;
  sprite.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
  scene.add(sprite);

  return { sprite, baseY, angle, radius, speed: 0.0005 + Math.random() * 0.001, life: 0 };
}

export function updateFloatingLabel(label: FloatingLabel): boolean {
  label.life += 0.003;
  if (label.life >= 1) return true;
  label.angle += label.speed;
  label.sprite.position.x = Math.cos(label.angle) * label.radius;
  label.sprite.position.z = Math.sin(label.angle) * label.radius;
  label.sprite.position.y = label.baseY + Math.sin(label.life * Math.PI * 2) * 0.3;
  const mat = label.sprite.material as THREE.SpriteMaterial;
  const fadeIn = Math.min(label.life * 8, 1);
  const fadeOut = label.life > 0.8 ? 1 - (label.life - 0.8) / 0.2 : 1;
  mat.opacity = fadeIn * fadeOut * 0.55;
  return false;
}

export function disposeFloatingLabel(label: FloatingLabel, scene: THREE.Scene) {
  const mat = label.sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
  scene.remove(label.sprite);
}

export function buildFloorConnections(agents: BuiltAgent[], scene: THREE.Scene): THREE.Line[] {
  const center = new THREE.Vector3(0, 0.14, 0);
  return agents.map(agent => {
    const pos = new THREE.Vector3();
    agent.group.getWorldPosition(pos);
    pos.y = 0.14;
    const mid = new THREE.Vector3().lerpVectors(center, pos, 0.5);
    mid.y = 0.14;
    const curve = new THREE.QuadraticBezierCurve3(center, mid, pos);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: agent.def.hex, transparent: true, opacity: 0.12,
    }));
    scene.add(line);
    return line;
  });
}

export function buildCentralHologram(scene: THREE.Scene) {
  const hologramGroup = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 2),
    new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.4 })
  );
  hologramGroup.add(core);

  const innerCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.18, 1),
    new THREE.MeshPhongMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.8, transparent: true, opacity: 0.3 })
  );
  hologramGroup.add(innerCore);

  const rings: THREE.Mesh[] = [];
  const ringConfigs = [
    { r: 0.6, tilt: 0, color: 0x06b6d4 },
    { r: 0.8, tilt: Math.PI / 3, color: 0x3b82f6 },
    { r: 1.0, tilt: -Math.PI / 4, color: 0x14b8a6 },
    { r: 1.3, tilt: Math.PI / 6, color: 0x06b6d4 },
  ];
  ringConfigs.forEach(({ r, tilt, color }) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.008, 8, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
    );
    ring.rotation.x = Math.PI / 2 + tilt;
    rings.push(ring);
    hologramGroup.add(ring);
  });

  const orbiterCount = 8;
  const orbiters: THREE.Mesh[] = [];
  for (let i = 0; i < orbiterCount; i++) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({
        color: [0x06b6d4, 0xf59e0b, 0x3b82f6, 0xef4444, 0x14b8a6, 0x06b6d4, 0x3b82f6, 0xf59e0b][i],
        transparent: true, opacity: 0.7,
      })
    );
    orb.userData.orbitRadius = 0.5 + (i % 4) * 0.25;
    orb.userData.orbitSpeed = 0.8 + i * 0.15;
    orb.userData.orbitTilt = (i / orbiterCount) * Math.PI;
    orbiters.push(orb);
    hologramGroup.add(orb);
  }

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 0.35, 16),
    new THREE.MeshPhongMaterial({ color: 0x0f172a, emissive: 0x06b6d4, emissiveIntensity: 0.2 })
  );
  pillar.position.y = -0.55;
  hologramGroup.add(pillar);

  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.04, 32),
    new THREE.MeshPhongMaterial({ color: 0x0f172a, emissive: 0x06b6d4, emissiveIntensity: 0.15 })
  );
  basePlate.position.y = -0.38;
  hologramGroup.add(basePlate);

  hologramGroup.position.y = 1.1;
  scene.add(hologramGroup);

  return { hologramGroup, core, innerCore, rings, orbiters };
}

export type HologramParts = ReturnType<typeof buildCentralHologram>;

export function animateHologram(parts: HologramParts, time: number) {
  parts.core.rotation.y = time * 0.4;
  parts.core.rotation.x = time * 0.2;
  const coreScale = 1 + Math.sin(time * 1.5) * 0.08;
  parts.core.scale.set(coreScale, coreScale, coreScale);

  parts.innerCore.rotation.y = -time * 0.6;
  parts.innerCore.rotation.z = time * 0.3;
  const innerPulse = 0.3 + Math.sin(time * 2) * 0.15;
  (parts.innerCore.material as THREE.MeshPhongMaterial).emissiveIntensity = 0.5 + innerPulse;

  parts.rings.forEach((ring, i) => {
    ring.rotation.z = time * (0.2 + i * 0.1) * (i % 2 === 0 ? 1 : -1);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.2 + Math.sin(time * 1.2 + i * 1.5) * 0.12;
  });

  parts.orbiters.forEach(orb => {
    const r = orb.userData.orbitRadius;
    const s = orb.userData.orbitSpeed;
    const tilt = orb.userData.orbitTilt;
    orb.position.x = Math.cos(time * s) * r;
    orb.position.y = Math.sin(time * s) * r * Math.sin(tilt);
    orb.position.z = Math.sin(time * s) * r * Math.cos(tilt);
    const orbMat = orb.material as THREE.MeshBasicMaterial;
    orbMat.opacity = 0.4 + Math.sin(time * 2 + s) * 0.3;
  });
}

export function buildAgentAura(agent: BuiltAgent, scene: THREE.Scene): THREE.Points {
  const count = 40;
  const positions = new Float32Array(count * 3);
  const agentPos = new THREE.Vector3();
  agent.group.getWorldPosition(agentPos);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 0.6 + Math.random() * 0.15;
    positions[i * 3] = agentPos.x + Math.cos(angle) * r;
    positions[i * 3 + 1] = 1.2 + Math.random() * 0.6;
    positions[i * 3 + 2] = agentPos.z + Math.sin(angle) * r;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: agent.def.hex,
    size: 0.04,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(points);
  return points;
}

export function animateAuras(auras: THREE.Points[], agents: BuiltAgent[], time: number) {
  auras.forEach((aura, aIdx) => {
    const agentPos = new THREE.Vector3();
    agents[aIdx].group.getWorldPosition(agentPos);
    const positions = aura.geometry.attributes.position as THREE.BufferAttribute;
    const count = positions.count;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + time * 0.5;
      const r = 0.55 + Math.sin(time * 2 + i * 0.5) * 0.15;
      positions.setX(i, agentPos.x + Math.cos(angle) * r);
      positions.setY(i, 1.0 + Math.sin(time * 1.5 + i * 0.3) * 0.4 + 0.5);
      positions.setZ(i, agentPos.z + Math.sin(angle) * r);
    }
    positions.needsUpdate = true;
    const mat = aura.material as THREE.PointsMaterial;
    mat.opacity = 0.25 + Math.sin(time * 2 + aIdx) * 0.1;
  });
}
