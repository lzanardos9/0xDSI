import * as THREE from 'three';

const CONTINENTS: [number, number][][] = [
  // North America
  [
    [-130,55],[-126,50],[-124,44],[-120,37],[-117,33],[-110,30],[-105,24],
    [-98,20],[-92,17],[-87,14],[-83,10],[-80,8],[-78,9],[-76,18],[-80,25],
    [-82,30],[-76,35],[-74,40],[-70,42],[-65,45],[-56,48],[-55,52],[-60,55],
    [-65,60],[-75,62],[-85,66],[-95,70],[-115,73],[-140,71],[-155,71],
    [-165,68],[-168,63],[-152,60],[-140,60],[-130,55],
  ],
  // South America
  [
    [-80,8],[-77,6],[-72,5],[-60,5],[-50,2],[-45,-3],[-40,-10],[-37,-15],
    [-40,-23],[-48,-28],[-55,-33],[-60,-38],[-65,-43],[-68,-50],[-73,-53],
    [-75,-47],[-72,-40],[-72,-30],[-75,-15],[-77,-5],[-80,0],[-80,8],
  ],
  // Europe
  [
    [-10,36],[0,38],[5,43],[10,45],[15,46],[20,44],[25,42],[28,41],
    [30,45],[30,55],[25,58],[20,58],[15,55],[10,58],[5,58],
    [0,55],[-5,50],[-10,44],[-10,36],
  ],
  // Africa
  [
    [-17,15],[-5,10],[0,6],[10,5],[10,0],[12,-5],[20,-10],[28,-15],
    [33,-25],[35,-33],[28,-34],[20,-30],[15,-25],[12,-15],[10,-5],
    [5,0],[0,5],[-5,8],[-10,10],[-17,15],
  ],
  // Asia
  [
    [30,42],[35,38],[40,35],[45,30],[50,25],[55,25],[60,25],
    [68,23],[72,18],[77,8],[80,6],[85,8],[88,22],[92,20],
    [97,16],[100,14],[103,2],[105,-6],[110,-8],[115,-8],
    [117,5],[120,22],[122,25],[125,32],[128,38],[130,42],
    [132,35],[135,34],[140,37],[142,43],[145,46],[150,55],
    [155,58],[160,62],[168,65],[180,68],[180,72],
    [170,70],[160,68],[150,60],[140,55],[130,55],
    [110,55],[90,55],[80,55],[70,58],[60,55],[50,55],[40,50],[30,42],
  ],
  // Australia
  [
    [115,-14],[120,-14],[130,-12],[136,-13],[140,-15],[145,-15],
    [150,-23],[152,-28],[150,-34],[147,-38],[140,-38],[135,-35],
    [130,-33],[125,-33],[118,-35],[114,-33],[113,-25],[114,-22],[115,-14],
  ],
  // Greenland
  [
    [-55,60],[-45,60],[-35,65],[-22,70],[-18,76],[-25,82],
    [-40,83],[-50,82],[-55,78],[-55,70],[-55,60],
  ],
  // UK
  [[-8,52],[-6,54],[-5,57],[-3,58],[0,57],[2,52],[0,51],[-5,50],[-8,52]],
  // Japan
  [
    [130,31],[131,33],[134,34],[137,35],[140,37],[141,40],
    [140,43],[142,45],[141,43],[139,38],[136,35],[133,33],[130,31],
  ],
  // Scandinavia
  [
    [5,58],[10,58],[15,62],[20,63],[25,66],[28,68],
    [25,71],[18,70],[12,67],[8,63],[5,60],[5,58],
  ],
];

export const KNOWN_CITIES = [
  { lat: 40.71, lon: -74.01, name: 'New York', country: 'US' },
  { lat: 37.77, lon: -122.42, name: 'San Francisco', country: 'US' },
  { lat: 51.51, lon: -0.13, name: 'London', country: 'UK' },
  { lat: 35.68, lon: 139.65, name: 'Tokyo', country: 'JP' },
  { lat: -33.87, lon: 151.21, name: 'Sydney', country: 'AU' },
  { lat: 1.35, lon: 103.82, name: 'Singapore', country: 'SG' },
  { lat: 55.76, lon: 37.62, name: 'Moscow', country: 'RU' },
  { lat: 39.90, lon: 116.41, name: 'Beijing', country: 'CN' },
  { lat: 19.43, lon: -99.13, name: 'Mexico City', country: 'MX' },
  { lat: -23.55, lon: -46.63, name: 'Sao Paulo', country: 'BR' },
  { lat: 52.52, lon: 13.41, name: 'Berlin', country: 'DE' },
  { lat: 25.20, lon: 55.27, name: 'Dubai', country: 'AE' },
  { lat: 22.32, lon: 114.17, name: 'Hong Kong', country: 'HK' },
  { lat: 37.57, lon: 126.98, name: 'Seoul', country: 'KR' },
  { lat: 28.61, lon: 77.21, name: 'New Delhi', country: 'IN' },
  { lat: 48.86, lon: 2.35, name: 'Paris', country: 'FR' },
  { lat: -1.29, lon: 36.82, name: 'Nairobi', country: 'KE' },
  { lat: 30.04, lon: 31.24, name: 'Cairo', country: 'EG' },
];

export const SEVERITY_COLORS: Record<string, { hex: number; css: string }> = {
  critical: { hex: 0xef4444, css: '#ef4444' },
  high: { hex: 0xf97316, css: '#f97316' },
  medium: { hex: 0xeab308, css: '#eab308' },
  low: { hex: 0x22c55e, css: '#22c55e' },
};

export const ATTACK_TYPES = [
  'SQL Injection', 'DDoS Amplification', 'Ransomware C2', 'Phishing Campaign',
  'Zero-Day Exploit', 'Brute Force', 'Data Exfiltration', 'Credential Theft',
  'Port Scan', 'C2 Beacon', 'Lateral Movement', 'Privilege Escalation',
  'APT Activity', 'Cryptojacking', 'Supply Chain Attack', 'DNS Tunneling',
  'RCE Exploit', 'Webshell Upload', 'BGP Hijack', 'Watering Hole',
];

function toCanvas(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

function drawContinentPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  w: number,
  h: number
) {
  if (pts.length < 3) return;
  ctx.beginPath();
  const [sx, sy] = toCanvas(pts[0][0], pts[0][1], w, h);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = toCanvas(pts[i][0], pts[i][1], w, h);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createEarthTexture(): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#040c1a';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(6, 182, 212, 0.04)';
  ctx.lineWidth = 0.5;
  for (let lat = -80; lat <= 80; lat += 10) {
    const y = ((90 - lat) / 180) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let lon = -170; lon <= 180; lon += 10) {
    const x = ((lon + 180) / 360) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(20, 184, 166, 0.08)';
  ctx.lineWidth = 1;
  const eqY = h / 2;
  ctx.beginPath(); ctx.moveTo(0, eqY); ctx.lineTo(w, eqY); ctx.stroke();

  ctx.save();
  ctx.shadowColor = '#06b6d4';
  ctx.shadowBlur = 25;
  ctx.strokeStyle = '#0891b2';
  ctx.lineWidth = 3;
  for (const c of CONTINENTS) {
    drawContinentPath(ctx, c, w, h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#0a2847';
  for (const c of CONTINENTS) {
    drawContinentPath(ctx, c, w, h);
    ctx.fill();
  }

  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 1.2;
  for (const c of CONTINENTS) {
    drawContinentPath(ctx, c, w, h);
    ctx.stroke();
  }

  ctx.fillStyle = '#22d3ee';
  for (const city of KNOWN_CITIES) {
    const [cx, cy] = toCanvas(city.lon, city.lat, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const polar = ctx.createLinearGradient(0, 0, 0, h);
  polar.addColorStop(0, 'rgba(0,0,0,0.3)');
  polar.addColorStop(0.15, 'rgba(0,0,0,0)');
  polar.addColorStop(0.85, 'rgba(0,0,0,0)');
  polar.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = polar;
  ctx.fillRect(0, 0, w, h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export function createArcCurve(
  source: { lat: number; lon: number },
  target: { lat: number; lon: number },
  radius: number
): THREE.CubicBezierCurve3 {
  const start = latLonToVector3(source.lat, source.lon, radius);
  const end = latLonToVector3(target.lat, target.lon, radius);
  const dist = start.distanceTo(end);
  const height = Math.max(0.4, dist * 0.45);
  const mid = new THREE.Vector3()
    .lerpVectors(start, end, 0.5)
    .normalize()
    .multiplyScalar(radius + height);
  const cp1 = new THREE.Vector3()
    .lerpVectors(start, mid, 0.5)
    .normalize()
    .multiplyScalar(radius + height * 0.75);
  const cp2 = new THREE.Vector3()
    .lerpVectors(mid, end, 0.5)
    .normalize()
    .multiplyScalar(radius + height * 0.75);
  return new THREE.CubicBezierCurve3(start, cp1, cp2, end);
}

export function findNearestCity(lat: number, lon: number): { name: string; country: string } {
  let best = KNOWN_CITIES[0];
  let bestDist = Infinity;
  for (const c of KNOWN_CITIES) {
    const d = (lat - c.lat) ** 2 + (lon - c.lon) ** 2;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return { name: best.name, country: best.country };
}

export const ATMOSPHERE_VS = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ATMOSPHERE_INNER_FS = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
    float intensity = pow(rim, 3.5) * 1.5;
    gl_FragColor = vec4(0.06, 0.72, 0.84, intensity * 0.7);
  }
`;

export const ATMOSPHERE_OUTER_FS = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
    float intensity = pow(rim, 5.0) * 0.8;
    gl_FragColor = vec4(0.06, 0.58, 0.75, intensity * 0.4);
  }
`;

export const GLOBE_RADIUS = 2.0;
