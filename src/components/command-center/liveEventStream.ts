import { useEffect, useState } from 'react';
import {
  ConnectorType,
  FunnelEvent,
  MOCK_EVENTS,
  CONNECTOR_META,
} from './eventFunnelData';

export interface LiveSeed {
  id: string;
  timestamp: string;
  connector: ConnectorType;
  sourceIP: string;
  destIP: string;
  eventType: string;
  severity: FunnelEvent['severity'];
  verdict: FunnelEvent['finalVerdict'];
  protocol: string;
  port: number;
  bytes: number;
  rawData: string;
  resolutionReason: string;
  domain: 'logical' | 'physical';
  isStructured: boolean;
  startPhase: number;
  osiLayer: number;
  crossLayerLinks: number[];
  patternTag: string | null;
  graphLabel: string;
  graphColor: string;
}

const ALL_CONNECTORS: ConnectorType[] = Object.keys(CONNECTOR_META) as ConnectorType[];

const RAND_IPS = [
  '10.0.1.42', '10.0.2.118', '10.0.3.7', '192.168.1.100', '192.168.5.22',
  '172.16.0.88', '172.16.3.201', '10.100.0.15', '10.200.1.44', '192.168.10.3',
  '203.0.113.45', '198.51.100.22', '45.33.32.156', '91.189.88.152', '185.199.108.153',
];

const EVENT_TYPE_MAP: Record<string, { osiLayer: number; cross: number[]; pattern: string | null; graphLabel: string; graphColor: string }> = {
  'C2 Beacon':            { osiLayer: 7, cross: [6, 4],    pattern: 'C2_BEACON',          graphLabel: 'NET_CONN', graphColor: '#ef4444' },
  'Data Exfil':           { osiLayer: 7, cross: [4, 3],    pattern: 'DNS_TUNNEL',         graphLabel: 'DNS_QUERY', graphColor: '#22d3ee' },
  'Port Scan':            { osiLayer: 4, cross: [3],       pattern: 'SYN_FLOOD',          graphLabel: 'NET_CONN', graphColor: '#22d3ee' },
  'Process Injection':    { osiLayer: 7, cross: [5],       pattern: 'APP_EXPLOIT',        graphLabel: 'PROC_EXEC', graphColor: '#eab308' },
  'Privilege Escalation': { osiLayer: 7, cross: [5, 4],    pattern: 'OAUTH_EXPLOIT',      graphLabel: 'AUTH_FAIL', graphColor: '#ef4444' },
  'Malware Download':     { osiLayer: 7, cross: [6, 4],    pattern: 'APP_EXPLOIT',        graphLabel: 'FILE_MOD', graphColor: '#f97316' },
  'Motion Alert':         { osiLayer: 7, cross: [],        pattern: null,                  graphLabel: 'PROC_EXEC', graphColor: '#eab308' },
  'Unauthorized Access':  { osiLayer: 7, cross: [5],       pattern: 'SESSION_HIJACK',     graphLabel: 'AUTH_FAIL', graphColor: '#ef4444' },
  'Lateral Movement':     { osiLayer: 5, cross: [7, 4, 3], pattern: 'LATERAL_MOVE',       graphLabel: 'SMB_SHARE', graphColor: '#f97316' },
  'Credential Theft':     { osiLayer: 7, cross: [5],       pattern: 'SESSION_HIJACK',     graphLabel: 'KERBEROS', graphColor: '#ef4444' },
  'Suspicious Login':     { osiLayer: 7, cross: [5],       pattern: 'OAUTH_EXPLOIT',      graphLabel: 'AUTH_FAIL', graphColor: '#ef4444' },
  'Network Anomaly':      { osiLayer: 3, cross: [4, 2],    pattern: 'ARP_SPOOF',          graphLabel: 'NET_CONN', graphColor: '#22d3ee' },
  'Registry Change':      { osiLayer: 7, cross: [],        pattern: null,                  graphLabel: 'REG_WRITE', graphColor: '#a855f7' },
  'File Modification':    { osiLayer: 7, cross: [],        pattern: null,                  graphLabel: 'FILE_MOD', graphColor: '#f97316' },
};

const DEFAULT_TYPE = { osiLayer: 7, cross: [], pattern: null, graphLabel: 'NET_CONN', graphColor: '#22d3ee' };

let counter = 0;

function makeSeed(forceCritical = false): LiveSeed {
  counter += 1;
  const tmpl = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
  const connector = ALL_CONNECTORS[Math.floor(Math.random() * ALL_CONNECTORS.length)];
  const meta = EVENT_TYPE_MAP[tmpl.eventType] ?? DEFAULT_TYPE;
  const sourceIP = RAND_IPS[Math.floor(Math.random() * RAND_IPS.length)];
  const destIP = RAND_IPS[Math.floor(Math.random() * RAND_IPS.length)];
  const severity = forceCritical
    ? (Math.random() < 0.6 ? 'critical' : 'high') as FunnelEvent['severity']
    : tmpl.severity;
  const verdict = forceCritical && severity === 'critical' ? 'critical_threat' as const : tmpl.finalVerdict;
  const startPhase = 1 + Math.floor(Math.random() * 3);

  return {
    id: `LIVE-${Date.now().toString(36)}-${counter.toString(36)}`,
    timestamp: new Date().toISOString(),
    connector,
    sourceIP,
    destIP,
    eventType: tmpl.eventType,
    severity,
    verdict,
    protocol: tmpl.protocol,
    port: tmpl.port,
    bytes: tmpl.bytes + Math.floor((Math.random() - 0.5) * tmpl.bytes * 0.3),
    rawData: tmpl.rawData,
    resolutionReason: tmpl.resolutionReason,
    domain: tmpl.domain,
    isStructured: tmpl.isStructured,
    startPhase,
    osiLayer: meta.osiLayer,
    crossLayerLinks: meta.cross,
    patternTag: meta.pattern,
    graphLabel: meta.graphLabel,
    graphColor: meta.graphColor,
  };
}

const subscribers = new Set<(batch: LiveSeed[]) => void>();
let history: LiveSeed[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  const count = 2 + Math.floor(Math.random() * 3);
  const batch: LiveSeed[] = [];
  for (let i = 0; i < count; i++) batch.push(makeSeed());
  if (Math.random() < 0.3) batch.push(makeSeed(true));

  history = [...history, ...batch];
  if (history.length > 240) history = history.slice(history.length - 240);

  subscribers.forEach(cb => cb(batch));
}

function ensureTimer() {
  if (timer != null) return;
  for (let i = 0; i < 80; i++) history.push(makeSeed(i < 16));
  timer = setInterval(tick, 1500);
}

export function getHistory(): LiveSeed[] {
  return history;
}

export function subscribeLiveStream(cb: (batch: LiveSeed[]) => void): () => void {
  ensureTimer();
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

export function useLiveStream(maxKeep = 200): { all: LiveSeed[]; lastBatch: LiveSeed[] } {
  const [all, setAll] = useState<LiveSeed[]>(() => {
    ensureTimer();
    return [...history];
  });
  const [lastBatch, setLastBatch] = useState<LiveSeed[]>([]);

  useEffect(() => {
    const unsub = subscribeLiveStream(batch => {
      setLastBatch(batch);
      setAll(prev => {
        const updated = [...prev, ...batch];
        return updated.length > maxKeep ? updated.slice(updated.length - maxKeep) : updated;
      });
    });
    return unsub;
  }, [maxKeep]);

  return { all, lastBatch };
}

export function seedToFunnelEvent(s: LiveSeed): FunnelEvent {
  return {
    id: s.id,
    connector: s.connector,
    sourceIP: s.sourceIP,
    destIP: s.destIP,
    timestamp: s.timestamp,
    currentPhase: s.startPhase,
    severity: s.severity,
    eventType: s.eventType,
    rawData: s.rawData,
    protocol: s.protocol,
    port: s.port,
    bytes: s.bytes,
    isStructured: s.isStructured,
    domain: s.domain,
    finalVerdict: s.verdict,
    resolutionReason: s.resolutionReason,
  };
}
