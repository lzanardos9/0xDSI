import * as THREE from 'three';

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  type: string;
  color: string;
  hex: number;
  status: 'active' | 'busy' | 'alert' | 'idle';
  task: string;
  metrics: { accuracy: number; throughput: number; tasksCompleted: number };
}

export const AGENT_DEFS: AgentDef[] = [
  { id: 'triage', name: 'Atlas', role: 'Triage Agent', type: 'triage', color: '#f59e0b', hex: 0xf59e0b, status: 'busy', task: 'Classifying 14 new alerts by severity and confidence scoring', metrics: { accuracy: 96.2, throughput: 342, tasksCompleted: 1847 } },
  { id: 'enrich', name: 'Sage', role: 'Enrichment Agent', type: 'enrichment', color: '#14b8a6', hex: 0x14b8a6, status: 'active', task: 'Cross-referencing IOCs with 12 threat intelligence feeds', metrics: { accuracy: 94.8, throughput: 128, tasksCompleted: 923 } },
  { id: 'orch', name: 'Commander', role: 'Orchestrator', type: 'orchestrator', color: '#06b6d4', hex: 0x06b6d4, status: 'active', task: 'Coordinating investigation pipeline across all agents', metrics: { accuracy: 99.1, throughput: 56, tasksCompleted: 4201 } },
  { id: 'invest', name: 'Nova', role: 'Investigation Agent', type: 'investigation', color: '#3b82f6', hex: 0x3b82f6, status: 'active', task: 'Deep-dive analysis of lateral movement kill chain', metrics: { accuracy: 97.5, throughput: 89, tasksCompleted: 1156 } },
  { id: 'respond', name: 'Vanguard', role: 'Response Agent', type: 'response', color: '#ef4444', hex: 0xef4444, status: 'alert', task: 'Executing automated IP block on 185.220.101.34', metrics: { accuracy: 98.7, throughput: 201, tasksCompleted: 2034 } },
];

export interface BuiltAgent {
  group: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  statusRing: THREE.Mesh;
  bodyMeshes: THREE.Mesh[];
  bodyMaterials: THREE.MeshPhongMaterial[];
  deskGlow: THREE.Mesh;
  pointLight: THREE.PointLight;
  def: AgentDef;
  reactionTime: number;
  thoughtSprite: THREE.Sprite | null;
  thoughtCanvas: HTMLCanvasElement | null;
}

export const AGENT_THOUGHTS: Record<string, string[]> = {
  triage: [
    'Okay, fourteen new alerts. Let me work through these.',
    'Hmm, this one feels like a false positive but I want to be sure.',
    'Running severity scoring on the latest batch now.',
    'Auth failure cluster from Eastern Europe. Worth a closer look.',
    'Filtered the port scan noise. Moving on to the real stuff.',
    'Another phishing attempt. Looks similar to last week\'s campaign.',
    'Escalating this one -- the MITRE mapping is concerning.',
    'Queue\'s almost clear. Just a couple left to classify.',
    'Three criticals flagged. Getting those to enrichment fast.',
    'Interesting pattern here. Haven\'t seen this technique before.',
  ],
  enrichment: [
    'Cross-referencing against all twelve feeds. Hang on.',
    'Got a hit in AlienVault. Let me pull the full context.',
    'Nothing on VirusTotal yet. That actually worries me more.',
    'WHOIS data is deliberately obscured. That\'s telling.',
    'Shodan picked this up too. Multiple sources confirming.',
    'This IP keeps showing up across different campaigns.',
    'ThreatFox just confirmed it. Tagging everything related.',
    'Passive DNS shows this domain hopping between IPs.',
    'Reputation score tanking fast. The feeds are lighting up.',
    'Enrichment done. Packaging the context for investigation.',
  ],
  orchestrator: [
    'All agents healthy. Throughput looks good right now.',
    'Reprioritizing -- the lateral movement finding goes first.',
    'Coordinating the handoff between triage and investigation.',
    'Atlas is running hot. Might need to rebalance the load.',
    'Two concurrent investigations. Balancing resources carefully.',
    'Good, the pipeline cleared that backlog without drops.',
    'Workflow\'s wrapping up. Updating the case with findings.',
    'Dispatching the DNS tunneling indicators for enrichment.',
    'Keeping an eye on overall capacity. We\'re in a good spot.',
    'Everything\'s flowing. No bottlenecks at the moment.',
  ],
  investigation: [
    'Building out the attack graph. The picture\'s getting clearer.',
    'Confirmed -- they pivoted from workstation to domain controller.',
    'PowerShell from a Word macro. Classic move.',
    'Beacon interval is sixty seconds. Pretty textbook C2.',
    'Found the persistence mechanism. Scheduled task under SYSTEM.',
    'About four hundred megs went out over DNS tunneling.',
    'Something\'s off about this process lineage. Digging deeper.',
    'Reconstructed the full timeline. Three hours before detection.',
    'Memory analysis showing injected code in svchost. Not great.',
    'Packaging the full findings for the response team now.',
  ],
  response: [
    'Pushing the IP block now. Firewall rule is going out.',
    'Isolating the endpoint. Should be offline in a few seconds.',
    'C2 beacon went silent. Containment confirmed.',
    'Rolling emergency rules across all edge devices.',
    'Disabled the compromised service account. Locked down.',
    'Quarantine\'s done. Kicking off the forensic capture.',
    'Pushed updated blocks to the proxy tier too. Being thorough.',
    'Recovery playbook running. Should be back up within the hour.',
    'All response actions verified. Writing up the summary.',
    'Containment\'s holding. Monitoring for any signs of re-entry.',
  ],
};

const SKIN_TONES = [0xd4a574, 0xc68642, 0x8d5524, 0xe0ac69, 0xf1c27d];
const HAIR_COLORS: Record<string, number> = {
  triage: 0x2c1810,
  enrichment: 0x1a1a2e,
  orchestrator: 0x3d3d3d,
  investigation: 0x4a2c17,
  response: 0x1c1c1c,
};
const SHIRT_COLORS: Record<string, number> = {
  triage: 0x1e3a5f,
  enrichment: 0x1a3d3d,
  orchestrator: 0x2d2d3d,
  investigation: 0x1e2d4a,
  response: 0x3d1a1a,
};

function skinMat(tone: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: tone, emissive: tone, emissiveIntensity: 0.05,
    shininess: 30, transparent: false,
  });
}

function clothMat(color: number, emissiveHex: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color, emissive: emissiveHex, emissiveIntensity: 0.08,
    shininess: 15, transparent: false,
  });
}

export function buildCharacter(def: AgentDef, angle: number, radius: number): BuiltAgent {
  const group = new THREE.Group();
  const agentIdx = AGENT_DEFS.indexOf(def);
  const skinTone = SKIN_TONES[agentIdx % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[def.type] || 0x2c1810;
  const shirtColor = SHIRT_COLORS[def.type] || 0x1e3a5f;

  const skin = skinMat(skinTone);
  const shirt = clothMat(shirtColor, def.hex);
  const pantsColor = 0x1a1a2a;
  const pants = clothMat(pantsColor, 0x0a0a1a);
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.MeshPhongMaterial[] = [skin, shirt, pants];
  const rad = (angle * Math.PI) / 180;

  group.position.set(Math.sin(rad) * radius, 0, Math.cos(rad) * radius);
  group.rotation.y = -rad;

  // Head - realistic proportions
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.42;

  // Skull shape (slightly elongated sphere)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 24),
    skin
  );
  head.scale.set(1, 1.08, 1.02);
  meshes.push(head);
  headGroup.add(head);

  // Hair (cap-like shape on top/back)
  const hairGeo = new THREE.SphereGeometry(0.168, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hairMat = new THREE.MeshPhongMaterial({ color: hairColor, shininess: 50 });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 0.02;
  hair.scale.set(1.02, 1.0, 1.05);
  headGroup.add(hair);

  // Eyes - more realistic with iris
  const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xf5f5f5, shininess: 100 });
  const irisMat = new THREE.MeshPhongMaterial({ color: def.hex, emissive: def.hex, emissiveIntensity: 0.3, shininess: 120 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
  [-0.055, 0.055].forEach(x => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), eyeWhiteMat);
    eyeWhite.position.set(x, -0.01, 0.14);
    eyeWhite.scale.set(1.2, 0.8, 0.5);
    headGroup.add(eyeWhite);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), irisMat);
    iris.position.set(x, -0.012, 0.155);
    headGroup.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), pupilMat);
    pupil.position.set(x, -0.012, 0.16);
    headGroup.add(pupil);
  });

  // Eyebrows
  const browMat = new THREE.MeshPhongMaterial({ color: hairColor });
  [-0.055, 0.055].forEach(x => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.012), browMat);
    brow.position.set(x, 0.025, 0.145);
    brow.rotation.z = x > 0 ? -0.1 : 0.1;
    headGroup.add(brow);
  });

  // Nose
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.015, 0.03, 8),
    skin
  );
  nose.position.set(0, -0.035, 0.155);
  nose.rotation.x = -Math.PI / 2;
  headGroup.add(nose);

  // Ears
  [-0.155, 0.155].forEach(x => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skin);
    ear.position.set(x, -0.01, 0.0);
    ear.scale.set(0.4, 0.7, 0.7);
    headGroup.add(ear);
  });

  // Subtle ambient glow around head (agent color, very faint)
  const headGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.04, side: THREE.BackSide })
  );
  headGroup.add(headGlow);

  // Neck
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.08, 12),
    skin
  );
  neck.position.y = -0.2;
  headGroup.add(neck);

  group.add(headGroup);

  // Torso - shirt/jacket with agent accent
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.38, 0.2),
    shirt
  );
  torso.position.y = 1.0;
  torso.scale.set(1, 1, 1);
  meshes.push(torso);
  group.add(torso);

  // Collar / accent trim
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, 0.21),
    new THREE.MeshPhongMaterial({ color: def.hex, emissive: def.hex, emissiveIntensity: 0.2 })
  );
  collar.position.set(0, 1.18, 0.0);
  group.add(collar);

  // Shoulders (rounded)
  [-1, 1].forEach(s => {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 12),
      shirt
    );
    shoulder.position.set(s * 0.22, 1.15, 0);
    group.add(shoulder);
  });

  // Arms - more anatomical
  const buildArm = (side: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 1.1, 0);

    // Upper arm (shirt sleeve)
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.045, 0.24, 10),
      shirt
    );
    upper.position.y = -0.12;
    meshes.push(upper);
    arm.add(upper);

    // Forearm (skin showing, rolled sleeves)
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.035, 0.24, 10),
      skin
    );
    forearm.position.set(0, -0.24, 0.14);
    forearm.rotation.x = Math.PI / 3;
    meshes.push(forearm);
    arm.add(forearm);

    // Hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), skin);
    hand.position.set(0, -0.3, 0.27);
    hand.scale.set(1, 0.7, 1.2);
    meshes.push(hand);
    arm.add(hand);

    return arm;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  group.add(leftArm, rightArm);

  // Legs - pants
  [-1, 1].forEach(s => {
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.055, 0.22, 10),
      pants
    );
    thigh.position.set(s * 0.1, 0.68, 0.12);
    thigh.rotation.x = Math.PI / 6;
    meshes.push(thigh);
    group.add(thigh);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.04, 0.28, 10),
      pants
    );
    shin.position.set(s * 0.1, 0.4, 0.24);
    shin.rotation.x = Math.PI / 8;
    meshes.push(shin);
    group.add(shin);

    // Shoes
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 0.14),
      new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 60 })
    );
    shoe.position.set(s * 0.1, 0.2, 0.32);
    group.add(shoe);
  });

  // Modern ergonomic chair
  const chairMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, emissive: def.hex, emissiveIntensity: 0.03, shininess: 40 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.38), chairMat);
  seat.position.set(0, 0.56, -0.04);
  group.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), chairMat);
  backrest.position.set(0, 0.82, -0.2);
  group.add(backrest);
  // Chair armrests
  [-1, 1].forEach(s => {
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.2), chairMat);
    armrest.position.set(s * 0.22, 0.64, -0.06);
    group.add(armrest);
  });

  // Status ring (agent color halo)
  const statusRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 8, 32),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.5 })
  );
  statusRing.position.y = 1.72;
  statusRing.rotation.x = Math.PI / 2;
  group.add(statusRing);

  const secondRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.006, 8, 32),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.2 })
  );
  secondRing.position.y = 1.72;
  secondRing.rotation.x = Math.PI / 2;
  group.add(secondRing);

  // Desk glow
  const deskGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.35),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.04, side: THREE.DoubleSide })
  );
  deskGlow.position.set(0, 0.75, 0.48);
  deskGlow.rotation.x = -Math.PI / 2;
  group.add(deskGlow);

  // Subtle point light
  const pl = new THREE.PointLight(def.hex, 0.25, 3);
  pl.position.set(0, 1.5, 0.5);
  group.add(pl);

  return { group, headGroup, leftArm, rightArm, statusRing, bodyMeshes: meshes, bodyMaterials: materials, deskGlow, pointLight: pl, def, reactionTime: 0, thoughtSprite: null, thoughtCanvas: null };
}

export function buildWorkstation(def: AgentDef, parent: THREE.Group) {
  const deskMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, emissive: 0x334155, emissiveIntensity: 0.15 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.48), deskMat);
  desk.position.set(0, 0.73, 0.48);
  parent.add(desk);

  [[-0.5, 0.25], [0.5, 0.25], [-0.5, 0.69], [0.5, 0.69]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.73, 6), deskMat);
    leg.position.set(x, 0.365, z);
    parent.add(leg);
  });

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 248);
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 8;
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = def.color;
  ctx.fillText(def.name.toUpperCase(), 16, 38);
  ctx.shadowBlur = 0;
  ctx.font = '16px monospace';
  ctx.fillStyle = '#64748b';
  ctx.fillText(def.role, 16, 60);
  ctx.fillStyle = def.status === 'alert' ? '#ef4444' : '#22c55e';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`[${def.status.toUpperCase()}]`, 16, 88);
  ctx.fillStyle = '#475569';
  ctx.font = '14px monospace';
  const taskLines = def.task.match(/.{1,42}/g) || [def.task];
  taskLines.forEach((l, i) => ctx.fillText(l, 16, 115 + i * 20));
  ctx.fillStyle = def.color;
  ctx.globalAlpha = 0.3;
  for (let y = 160; y < 230; y += 4) {
    const w = Math.random() * 200 + 50;
    ctx.fillRect(16, y, w, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#334155';
  ctx.fillText(`ACC: ${def.metrics.accuracy}% | ${def.metrics.throughput} evt/s | ${def.metrics.tasksCompleted.toLocaleString()} tasks`, 16, 245);

  const screenTex = new THREE.CanvasTexture(canvas);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.39),
    new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 0.95 })
  );
  screen.position.set(0, 1.02, 0.7);
  screen.rotation.x = -0.12;
  parent.add(screen);

  const screenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.45),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.08, side: THREE.BackSide })
  );
  screenGlow.position.set(0, 1.02, 0.69);
  screenGlow.rotation.x = -0.12;
  parent.add(screenGlow);

  const screenFrame = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.43),
    new THREE.MeshBasicMaterial({ color: def.hex, transparent: true, opacity: 0.18 })
  );
  screenFrame.position.set(0, 1.02, 0.695);
  screenFrame.rotation.x = -0.12;
  parent.add(screenFrame);

  if (def.type === 'orchestrator' || def.type === 'investigation') {
    const s2c = document.createElement('canvas');
    s2c.width = 256;
    s2c.height = 256;
    const c2 = s2c.getContext('2d')!;
    c2.fillStyle = '#060a14';
    c2.fillRect(0, 0, 256, 256);
    c2.strokeStyle = def.color;
    c2.lineWidth = 2;
    c2.strokeRect(2, 2, 252, 252);
    c2.font = 'bold 16px monospace';
    c2.fillStyle = def.color;
    c2.fillText(def.type === 'orchestrator' ? 'PIPELINE' : 'KILL CHAIN', 12, 24);
    c2.font = '12px monospace';
    const lines = def.type === 'orchestrator'
      ? ['Triage: 14 queued', 'Enrich: 3 active', 'Investigate: 2 active', 'Respond: 1 executing', '', 'Throughput: 856 evt/s', 'Latency: 12ms avg']
      : ['Initial Access', '  -> Execution', '    -> Persistence', '      -> Lateral Move', '        -> Exfiltration', '', 'Confidence: 94.2%'];
    lines.forEach((t, i) => {
      c2.fillStyle = t.includes('executing') || t.includes('Exfil') ? '#ef4444' : '#64748b';
      c2.fillText(t, 12, 48 + i * 18);
    });
    const s2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.35),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(s2c), transparent: true, opacity: 0.88 })
    );
    s2.position.set(0.58, 1.02, 0.58);
    s2.rotation.y = -0.4;
    s2.rotation.x = -0.1;
    parent.add(s2);
  }
}

export function buildEnvironment(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshPhongMaterial({ color: 0x060a14, emissive: 0x060a14, emissiveIntensity: 0.1, shininess: 150 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.12;
  scene.add(floor);

  const grid = new THREE.GridHelper(30, 60, 0x162040, 0x0a1320);
  grid.position.y = 0.125;
  scene.add(grid);

  const count = 500;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 6 + 0.3;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    const hue = [0.52, 0.55, 0.12, 0.0, 0.45][Math.floor(Math.random() * 5)];
    const c = new THREE.Color().setHSL(hue, 0.6 + Math.random() * 0.3, 0.5 + Math.random() * 0.2);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    sizes[i] = 0.015 + Math.random() * 0.025;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.03, vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
  })));

  return { particles: pGeo };
}

export function buildLabel(name: string, role: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(6, 10, 20, 0.8)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 96, 12);
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 96, 12);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 32px monospace';
  ctx.fillStyle = color;
  ctx.fillText(name, 16, 38);
  ctx.font = '20px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(role, 16, 72);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sprite.scale.set(1.4, 0.26, 1);
  return sprite;
}

export interface DataPacket {
  mesh: THREE.Mesh;
  trail: THREE.Mesh[];
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  speed: number;
  color: number;
}

function bezierPoint(from: THREE.Vector3, mid: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  const omt = 1 - t;
  return new THREE.Vector3(
    omt * omt * from.x + 2 * omt * t * mid.x + t * t * to.x,
    omt * omt * from.y + 2 * omt * t * mid.y + t * t * to.y,
    omt * omt * from.z + 2 * omt * t * mid.z + t * t * to.z,
  );
}

export function spawnDataPacket(fromAgent: BuiltAgent, toAgent: BuiltAgent, scene: THREE.Scene): DataPacket {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: fromAgent.def.hex, transparent: true, opacity: 0.95 })
  );
  const glowShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: fromAgent.def.hex, transparent: true, opacity: 0.25, side: THREE.BackSide })
  );
  mesh.add(glowShell);

  const from = new THREE.Vector3();
  fromAgent.group.getWorldPosition(from);
  from.y += 1.2;
  const to = new THREE.Vector3();
  toAgent.group.getWorldPosition(to);
  to.y += 1.2;
  mesh.position.copy(from);
  scene.add(mesh);

  const trail: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 - i * 0.002, 4, 4),
      new THREE.MeshBasicMaterial({ color: fromAgent.def.hex, transparent: true, opacity: 0 })
    );
    scene.add(t);
    trail.push(t);
  }

  return { mesh, trail, from, to, progress: 0, speed: 0.006 + Math.random() * 0.004, color: fromAgent.def.hex };
}

export function updateDataPacket(p: DataPacket): boolean {
  p.progress += p.speed;
  if (p.progress >= 1) return true;

  const mid = new THREE.Vector3().lerpVectors(p.from, p.to, 0.5);
  mid.y += 2.0 + Math.sin(p.progress * Math.PI) * 0.8;

  const pos = bezierPoint(p.from, mid, p.to, p.progress);
  p.mesh.position.copy(pos);

  const mat = p.mesh.material as THREE.MeshBasicMaterial;
  mat.opacity = p.progress < 0.08 ? p.progress / 0.08 : p.progress > 0.88 ? (1 - p.progress) / 0.12 : 0.95;
  const s = 0.8 + Math.sin(p.progress * Math.PI * 6) * 0.4;
  p.mesh.scale.set(s, s, s);

  p.trail.forEach((t, i) => {
    const trailT = Math.max(0, p.progress - (i + 1) * 0.012);
    if (trailT <= 0) {
      (t.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    const tPos = bezierPoint(p.from, mid, p.to, trailT);
    t.position.copy(tPos);
    (t.material as THREE.MeshBasicMaterial).opacity = mat.opacity * (1 - (i + 1) / 10) * 0.6;
  });

  return false;
}

export function disposePacket(p: DataPacket, scene: THREE.Scene) {
  scene.remove(p.mesh);
  p.mesh.geometry.dispose();
  (p.mesh.material as THREE.Material).dispose();
  p.trail.forEach(t => {
    scene.remove(t);
    t.geometry.dispose();
    (t.material as THREE.Material).dispose();
  });
}

export function buildThoughtBubble(agent: BuiltAgent): { sprite: THREE.Sprite; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const thoughts = AGENT_THOUGHTS[agent.def.type] || AGENT_THOUGHTS.triage;
  const text = thoughts[Math.floor(Math.random() * thoughts.length)];
  renderThoughtCanvas(canvas, text, agent.def.color);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.2, 0.82, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 999;
  agent.group.add(sprite);
  return { sprite, canvas };
}

function renderThoughtCanvas(canvas: HTMLCanvasElement, text: string, color: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 192);

  ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
  ctx.beginPath();
  ctx.roundRect(16, 8, 480, 120, 20);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(16, 8, 480, 120, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
  ctx.beginPath();
  ctx.ellipse(200, 142, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(220, 160, 10, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(235, 174, 6, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillText('>', 36, 52);
  ctx.shadowBlur = 0;

  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#e2e8f0';
  const maxWidth = 410;
  const words = text.split(' ');
  let line = '';
  let y = 52;
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 64, y);
      line = word;
      y += 30;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 64, y);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.fillText('thinking...', 370, 110);
  ctx.globalAlpha = 1;
}

export function updateThoughtBubble(agent: BuiltAgent) {
  if (!agent.thoughtCanvas || !agent.thoughtSprite) return;
  const thoughts = AGENT_THOUGHTS[agent.def.type] || AGENT_THOUGHTS.triage;
  const text = thoughts[Math.floor(Math.random() * thoughts.length)];
  renderThoughtCanvas(agent.thoughtCanvas, text, agent.def.color);
  const mat = agent.thoughtSprite.material as THREE.SpriteMaterial;
  if (mat.map) mat.map.needsUpdate = true;
}

export function animateScene(agents: BuiltAgent[], time: number, particleGeo: THREE.BufferGeometry) {
  agents.forEach((a, i) => {
    const o = i * 1.3;
    const reaction = Math.max(0, a.reactionTime - time);
    const reactionBoost = Math.min(reaction * 2, 1);

    // Natural head movement (subtle sway like a real person)
    a.headGroup.rotation.y = Math.sin(time * 0.3 + o) * (0.15 + reactionBoost * 0.2);
    a.headGroup.rotation.x = Math.sin(time * 0.2 + o + 1) * 0.04 - reactionBoost * 0.1;

    // Typing animation (more natural rhythm)
    const speed = a.def.status === 'alert' ? 7 : a.def.status === 'busy' ? 5 : 2.5;
    const typingAmplitude = 0.05 + reactionBoost * 0.06;
    a.leftArm.rotation.x = Math.sin(time * (speed + reactionBoost * 3) + o) * typingAmplitude;
    a.rightArm.rotation.x = Math.sin(time * (speed + reactionBoost * 3) + o + Math.PI * 0.8) * typingAmplitude;

    // Status ring (slower, subtler)
    a.statusRing.rotation.z = time * (0.4 + reactionBoost * 1.5);
    const pulse = 1 + Math.sin(time * 2 + o) * 0.08 + reactionBoost * 0.12;
    a.statusRing.scale.set(pulse, pulse, pulse);

    // Subtle clothing emissive for agent identity glow (keep skin natural)
    const shirtEmissive = 0.06 + Math.sin(time * 1.2 + o) * 0.02 + reactionBoost * 0.1;
    a.bodyMaterials.forEach((m, idx) => {
      if (idx > 0) m.emissiveIntensity = shirtEmissive;
    });

    const glowMat = a.deskGlow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = 0.03 + Math.sin(time * speed + o) * 0.02 + reactionBoost * 0.06;

    a.pointLight.intensity = 0.2 + reactionBoost * 0.5 + Math.sin(time * 1.5 + o) * 0.08;
  });

  const positions = particleGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    positions.setY(i, y + Math.sin(time * 0.4 + i * 0.08) * 0.002);
    const x = positions.getX(i);
    positions.setX(i, x + Math.cos(time * 0.2 + i * 0.05) * 0.001);
  }
  positions.needsUpdate = true;
}

export interface VRSeatParts {
  group: THREE.Group;
  ghostHead: THREE.Mesh;
  ghostBody: THREE.Mesh;
  beacon: THREE.Mesh;
  floorRing: THREE.Mesh;
  floorRingOuter: THREE.Mesh;
  label: THREE.Sprite;
  seatLight: THREE.PointLight;
  orbiters: THREE.Mesh[];
}

export const VR_SEAT_ANGLE = 180;

export function buildVRSeat(scene: THREE.Scene, radius: number): VRSeatParts {
  const group = new THREE.Group();
  const rad = (VR_SEAT_ANGLE * Math.PI) / 180;
  const color = 0x06b6d4;
  group.position.set(Math.sin(rad) * radius, 0, Math.cos(rad) * radius);
  group.rotation.y = -rad;

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.95, 0.06, 6),
    new THREE.MeshPhongMaterial({ color: 0x0a1628, emissive: color, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 })
  );
  platform.position.y = 0.15;
  group.add(platform);

  const chairMat = new THREE.MeshPhongMaterial({ color: 0x0f1d2f, emissive: color, emissiveIntensity: 0.1, transparent: true, opacity: 0.85 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.42), chairMat);
  seat.position.set(0, 0.58, -0.04);
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.05), chairMat);
  back.position.set(0, 0.84, -0.22);
  group.add(back);
  [-1, 1].forEach(s => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.32), chairMat);
    arm.position.set(s * 0.27, 0.68, -0.04);
    group.add(arm);
  });

  const ghostMat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.1 });
  const ghostHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), ghostMat.clone());
  ghostHead.position.y = 1.38;
  group.add(ghostHead);
  const ghostBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.16), ghostMat.clone());
  ghostBody.position.y = 1.04;
  group.add(ghostBody);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.18, 5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.045, side: THREE.DoubleSide })
  );
  beacon.position.y = 2.7;
  group.add(beacon);

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.7, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.135;
  group.add(floorRing);

  const floorRingOuter = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 0.95, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  floorRingOuter.rotation.x = -Math.PI / 2;
  floorRingOuter.position.y = 0.135;
  group.add(floorRingOuter);

  const orbiters: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.04, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
    );
    orb.userData.oa = (i / 4) * Math.PI * 2;
    orb.userData.os = 0.7 + i * 0.2;
    orb.userData.or = 0.5 + i * 0.08;
    orb.userData.oh = 1.1 + i * 0.15;
    orbiters.push(orb);
    group.add(orb);
  }

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(6,10,20,0.88)';
  ctx.beginPath();
  ctx.roundRect(16, 8, 480, 144, 20);
  ctx.fill();
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.roundRect(16, 8, 480, 144, 20);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#06b6d4';
  ctx.beginPath();
  ctx.roundRect(200, 18, 112, 40, 10);
  ctx.fill();
  ctx.fillStyle = '#050810';
  ctx.beginPath();
  ctx.roundRect(210, 26, 34, 24, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(268, 26, 34, 24, 6);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#06b6d4';
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 8;
  ctx.fillText('YOUR SEAT', 256, 98);
  ctx.shadowBlur = 0;
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('HUMAN IN THE LOOP', 256, 125);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })
  );
  label.scale.set(2.2, 0.7, 1);
  label.position.y = 2.15;
  label.renderOrder = 999;
  group.add(label);

  const seatLight = new THREE.PointLight(color, 0.5, 5);
  seatLight.position.set(0, 1.5, 0);
  group.add(seatLight);

  const deskMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, emissive: 0x334155, emissiveIntensity: 0.15 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.035, 0.48), deskMat);
  desk.position.set(0, 0.73, 0.48);
  group.add(desk);

  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 256;
  const sctx = sc.getContext('2d')!;
  sctx.fillStyle = '#060a14';
  sctx.fillRect(0, 0, 512, 256);
  sctx.strokeStyle = '#06b6d4';
  sctx.lineWidth = 3;
  sctx.strokeRect(4, 4, 504, 248);
  sctx.font = 'bold 22px monospace';
  sctx.fillStyle = '#06b6d4';
  sctx.shadowColor = '#06b6d4';
  sctx.shadowBlur = 8;
  sctx.fillText('HUMAN INTERFACE', 16, 36);
  sctx.shadowBlur = 0;
  sctx.font = '14px monospace';
  sctx.fillStyle = '#475569';
  sctx.fillText('[AWAITING OPERATOR]', 16, 58);
  sctx.fillStyle = '#06b6d4';
  sctx.globalAlpha = 0.15;
  for (let y = 80; y < 230; y += 6) {
    const w = 80 + Math.random() * 350;
    sctx.fillRect(16, y, w, 3);
  }
  sctx.globalAlpha = 1;
  sctx.fillStyle = '#334155';
  sctx.fillText('STATUS: STANDBY | ROLE: UNASSIGNED', 16, 245);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.39),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.9 })
  );
  screen.position.set(0, 1.02, 0.7);
  screen.rotation.x = -0.12;
  group.add(screen);

  const connGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.14, 0),
    new THREE.Vector3(Math.sin(rad) * radius * 0.5, 0.14, Math.cos(rad) * radius * 0.5),
    new THREE.Vector3(Math.sin(rad) * radius, 0.14, Math.cos(rad) * radius),
  ]);
  const connLine = new THREE.Line(connGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.08 }));
  scene.add(connLine);

  scene.add(group);
  return { group, ghostHead, ghostBody, beacon, floorRing, floorRingOuter, label, seatLight, orbiters };
}

export function animateVRSeat(parts: VRSeatParts, time: number, occupied: boolean) {
  const ghostOp = occupied ? 0 : 0.06 + Math.sin(time * 1.5) * 0.04;
  (parts.ghostHead.material as THREE.MeshBasicMaterial).opacity = ghostOp;
  (parts.ghostBody.material as THREE.MeshBasicMaterial).opacity = ghostOp;

  const beaconMat = parts.beacon.material as THREE.MeshBasicMaterial;
  beaconMat.opacity = occupied ? 0.015 : 0.035 + Math.sin(time * 2) * 0.02;
  parts.beacon.rotation.y = time * 0.3;

  parts.floorRing.rotation.z = time * 0.4;
  (parts.floorRing.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 2.5) * 0.1;
  parts.floorRingOuter.rotation.z = -time * 0.2;
  (parts.floorRingOuter.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(time * 1.8 + 1) * 0.04;

  parts.label.position.y = 2.15 + Math.sin(time * 1.2) * 0.06;
  const labelMat = parts.label.material as THREE.SpriteMaterial;
  labelMat.opacity = occupied ? 0.3 : 0.85 + Math.sin(time * 2) * 0.15;

  parts.seatLight.intensity = occupied ? 0.2 : 0.4 + Math.sin(time * 2) * 0.3;

  parts.orbiters.forEach(orb => {
    const a = orb.userData.oa + time * orb.userData.os;
    orb.position.set(Math.cos(a) * orb.userData.or, orb.userData.oh + Math.sin(time * 2) * 0.08, Math.sin(a) * orb.userData.or);
    orb.rotation.y = time * 2;
    orb.rotation.x = time * 1.5;
    (orb.material as THREE.MeshBasicMaterial).opacity = occupied ? 0.15 : 0.35 + Math.sin(time * 3 + orb.userData.oa) * 0.2;
  });
}
