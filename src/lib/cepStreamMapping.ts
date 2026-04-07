export interface StreamDef {
  id: string;
  label: string;
  color: string;
}

export const STREAMS: StreamDef[] = [
  { id: 'network', label: 'Network / Firewall', color: '#0ea5e9' },
  { id: 'endpoint', label: 'Endpoint / EDR', color: '#22c55e' },
  { id: 'auth', label: 'Identity / Auth', color: '#f59e0b' },
  { id: 'cloud', label: 'Cloud / SaaS', color: '#06b6d4' },
  { id: 'threat_intel', label: 'Threat Intel', color: '#ef4444' },
  { id: 'physical', label: 'Physical / CCTV / Audio', color: '#14b8a6' },
  { id: 'behavioral', label: 'Behavioral / UEBA', color: '#f97316' },
];

export const STREAM_INDEX = new Map(STREAMS.map((s, i) => [s.id, i]));

export function assignStream(label: string): string {
  const l = label.toLowerCase();
  if (/phish|email|spear|malware|payload|download|dropper|implant|backdoor|inject|exploit|ransom|encrypt|worm|trojan|rootkit|persistence|schedule|cron|service.install|dll|registry/.test(l)) return 'endpoint';
  if (/scan|recon|dns|c2|command.*control|lateral|network|firewall|port|traffic|packet|proxy|tunnel|exfil|beacon|flood|ddos|smb|rdp|ssh|vpn|nat|routing/.test(l)) return 'network';
  if (/login|credential|brute|password|auth|privilege|escal|kerberos|ticket|hash|dump|token|session|mfa|sso|ldap|active.dir|account|ntlm|oauth/.test(l)) return 'auth';
  if (/cloud|aws|azure|s3|saas|lambda|container|docker|kubernetes|gcp|iam.role|api.gateway|serverless|terraform/.test(l)) return 'cloud';
  if (/threat|intel|ioc|indicator|feed|signature|apt|campaign|actor|mitre|att.ck|yara|stix|taxii/.test(l)) return 'threat_intel';
  if (/badge|camera|cctv|physical|door|sensor|audio|microphone|biometric|access.control|motion|infrared|rfid|video|tailgat|ultrasonic|acoustic/.test(l)) return 'physical';
  if (/behav|anomaly|ueba|pattern|baseline|insider|risk.score|profil|deviat|unusual/.test(l)) return 'behavioral';
  return STREAMS[Math.floor(Math.random() * STREAMS.length)].id;
}

export function assignStreamsWithSpread(labels: string[]): string[] {
  const natural = labels.map(assignStream);
  const used = new Set<string>();
  return natural.map(s => {
    if (used.has(s)) {
      const alt = STREAMS.find(st => !used.has(st.id));
      if (alt) { used.add(alt.id); return alt.id; }
    }
    used.add(s);
    return s;
  });
}

export function hex2rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function lightenHex(hex: string, amt: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

export const CW = 1200;
export const CH = 650;
export const LABEL_W = 160;
export const MARGIN_R = 15;
export const MARGIN_T = 30;
export const MARGIN_B = 30;
export const EVENT_AREA_W = CW - LABEL_W - MARGIN_R;
export const LANE_H = (CH - MARGIN_T - MARGIN_B) / STREAMS.length;

export function getLaneY(streamIdx: number): number {
  return MARGIN_T + streamIdx * LANE_H + LANE_H / 2;
}
