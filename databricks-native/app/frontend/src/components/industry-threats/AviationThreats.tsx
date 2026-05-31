import { useState, useEffect, useRef } from 'react';
import {
  Navigation, Radar, Ship, ShieldCheck, AlertTriangle, Activity, Clock,
  ChevronRight, Target, Lock, Radio, Anchor, Globe, Plane, Compass,
  Eye, TrendingUp, MapPin, Zap, Shield, Signal
} from 'lucide-react';

// --- Types ---

interface ADSBThreat {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  icao24: string;
  flightId: string;
  region: string;
  timestamp: string;
  vector: string;
  affectedSystems: string;
}

interface ATCThreat {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  facility: string;
  protocol: string;
  timestamp: string;
  impactRadius: string;
  mitigationStatus: 'contained' | 'active' | 'investigating';
}

interface MaritimeThreat {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  vesselMMSI: string;
  vesselName: string;
  position: string;
  timestamp: string;
  system: string;
  flagState: string;
}

interface ComplianceItem {
  id: string;
  framework: string;
  directive: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'review-pending';
  description: string;
  lastAudit: string;
  nextDeadline: string;
  findings: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

// --- Mock Data ---

const ADSB_THREATS: ADSBThreat[] = [
  {
    id: 'adsb-001',
    type: 'ADS-B Spoofing Attack',
    severity: 'critical',
    description: 'Coordinated injection of 14 ghost aircraft targets on 1090ES frequency with valid ICAO addresses cloned from decommissioned airframes. Targets converging on EGLL approach corridor.',
    icao24: '3C6745 (spoofed)',
    flightId: 'GHOST-LHR-07',
    region: 'London TMA',
    timestamp: '3s ago',
    vector: 'SDR-based 1090MHz injection',
    affectedSystems: 'ADS-B ground stations, MLAT clusters'
  },
  {
    id: 'adsb-002',
    type: 'Ghost Aircraft Injection',
    severity: 'critical',
    description: 'Phantom Mode-S replies detected with fabricated altitude and velocity vectors creating false collision alerts in TCAS II equipped aircraft near KJFK.',
    icao24: 'A4F2B1 (phantom)',
    flightId: 'N/A - Synthetic',
    region: 'New York TRACON',
    timestamp: '12s ago',
    vector: 'Mode-S ES transponder emulation',
    affectedSystems: 'TCAS II, ADS-B In displays, STCA'
  },
  {
    id: 'adsb-003',
    type: 'Flight Plan Manipulation',
    severity: 'high',
    description: 'Unauthorized AFTN/AMHS message injection modifying filed flight plans for 3 transatlantic routes, altering waypoints to create convergence at NATRAK oceanic entry.',
    icao24: 'N/A',
    flightId: 'BAW117, UAL923, DLH404',
    region: 'Shanwick OCA',
    timestamp: '28s ago',
    vector: 'AFTN Type-B message forgery',
    affectedSystems: 'IFPS, CFMU, oceanic clearance systems'
  },
  {
    id: 'adsb-004',
    type: 'GPS Jamming Zone Detected',
    severity: 'critical',
    description: 'High-power L1/L2 GPS jamming source triangulated at 34.052N, 36.21E affecting RNAV approaches within 120nm radius. Multiple aircraft reverting to conventional navigation.',
    icao24: 'Multiple affected',
    flightId: 'MEA315, RJA261, THY1847',
    region: 'Eastern Mediterranean FIR',
    timestamp: '45s ago',
    vector: 'Ground-based L1/L2/L5 broadband jammer',
    affectedSystems: 'GNSS, SBAS/EGNOS, RNP-AR approaches'
  },
  {
    id: 'adsb-005',
    type: 'ACARS Message Interception',
    severity: 'high',
    description: 'Rogue VDL Mode-2 ground station intercepting ACARS uplink/downlink on 136.975 MHz. Captured messages include OOOI reports, digital ATIS, and pre-departure clearances.',
    icao24: '484A0C',
    flightId: 'KLM643',
    region: 'Amsterdam Schiphol',
    timestamp: '1m ago',
    vector: 'VDL-2 passive intercept + active replay',
    affectedSystems: 'ACARS, AOC datalink, FANS-1/A CPDLC'
  },
  {
    id: 'adsb-006',
    type: 'ADS-B Position Falsification',
    severity: 'high',
    description: 'Aircraft broadcasting manipulated ADS-B position data showing 8nm lateral offset from actual radar-confirmed position, potential runway incursion vector at LFPG.',
    icao24: '39CEAB',
    flightId: 'AFR1842',
    region: 'Paris CDG',
    timestamp: '2m ago',
    vector: 'Transponder firmware exploitation',
    affectedSystems: 'A-SMGCS, RIMCAS, surface radar correlation'
  },
  {
    id: 'adsb-007',
    type: 'MLAT Sensor Compromise',
    severity: 'medium',
    description: 'Timing synchronization attack on WAM multilateration cluster causing position calculation errors of 200m+ for aircraft below FL100 in Frankfurt TMA.',
    icao24: 'Multiple',
    flightId: 'Various inbound EDDF',
    region: 'Frankfurt TMA',
    timestamp: '4m ago',
    vector: 'NTP poisoning on sensor network',
    affectedSystems: 'WAM/MLAT ground infrastructure'
  },
  {
    id: 'adsb-008',
    type: 'UAT 978 MHz Exploitation',
    severity: 'medium',
    description: 'Unauthorized TIS-B uplink station broadcasting false traffic advisories to GA aircraft equipped with UAT-In receivers in uncontrolled airspace near KOSH.',
    icao24: 'N/A - Ground',
    flightId: 'GA traffic affected',
    region: 'Central Wisconsin',
    timestamp: '6m ago',
    vector: 'Rogue UAT ground transmitter',
    affectedSystems: 'TIS-B, ADS-R, FIS-B weather overlay'
  },
];

const ATC_THREATS: ATCThreat[] = [
  {
    id: 'atc-001',
    type: 'ASTERIX CAT-048 Exploit',
    severity: 'critical',
    description: 'Malformed ASTERIX Category 048 data blocks injected into PSR/SSR processing chain causing radar tracker to generate false plots with valid track numbers at Eurocontrol MUAC.',
    facility: 'Maastricht UAC',
    protocol: 'ASTERIX CAT-048/062',
    timestamp: '5s ago',
    impactRadius: 'EDYY UIR (340,000 sq km)',
    mitigationStatus: 'active'
  },
  {
    id: 'atc-002',
    type: 'Radar Data Feed Manipulation',
    severity: 'critical',
    description: 'Man-in-the-middle attack on RDPS (Radar Data Processing System) input, selectively suppressing secondary radar returns for aircraft above FL350 on specific SSR codes.',
    facility: 'London ACC Swanwick',
    protocol: 'ASTERIX CAT-062 / ARTAS',
    timestamp: '18s ago',
    impactRadius: 'EGTT FIR upper sectors',
    mitigationStatus: 'investigating'
  },
  {
    id: 'atc-003',
    type: 'SWIM Network Intrusion',
    severity: 'high',
    description: 'Unauthorized SWIM (System Wide Information Management) subscription detected harvesting real-time flight data, aerodrome status, and NOTAMs via compromised FIXM/AIXM endpoints.',
    facility: 'FAA SWIM Hub',
    protocol: 'FIXM 4.3 / AIXM 5.1.1',
    timestamp: '42s ago',
    impactRadius: 'NAS-wide data exposure',
    mitigationStatus: 'contained'
  },
  {
    id: 'atc-004',
    type: 'VHF Comm Frequency Hijack',
    severity: 'critical',
    description: 'Rogue transmitter overriding approach frequency 119.100 MHz with false ATC clearances including unauthorized descent instructions during peak arrival rush at Dubai DXB.',
    facility: 'Dubai Approach',
    protocol: 'VHF AM 118-137 MHz',
    timestamp: '1m ago',
    impactRadius: '80nm around OMDB',
    mitigationStatus: 'active'
  },
  {
    id: 'atc-005',
    type: 'CPDLC Session Hijack',
    severity: 'high',
    description: 'Controller-Pilot Data Link Communications session takeover via forged FANS-1/A logon messages redirecting oceanic clearance uplinks through attacker-controlled ground station.',
    facility: 'Gander Oceanic',
    protocol: 'FANS-1/A / ATN-B1',
    timestamp: '2m ago',
    impactRadius: 'NAT Track System',
    mitigationStatus: 'investigating'
  },
  {
    id: 'atc-006',
    type: 'UHF Military Band Intercept',
    severity: 'high',
    description: 'Wideband SDR array detected monitoring UHF 225-400 MHz military ATC frequencies including HAVE QUICK II frequency-hopping patterns near Ramstein AB.',
    facility: 'Ramstein RAPCON',
    protocol: 'UHF AM / HAVE QUICK II',
    timestamp: '3m ago',
    impactRadius: '150nm mil airspace',
    mitigationStatus: 'contained'
  },
  {
    id: 'atc-007',
    type: 'FDPS Data Corruption',
    severity: 'medium',
    description: 'Flight Data Processing System showing unexplained strip data modifications - ETOs and coordination levels altered for 7 flights without controller input or amendment logging.',
    facility: 'NATS Prestwick Centre',
    protocol: 'OLDI / SYSCO',
    timestamp: '5m ago',
    impactRadius: 'EGPX FIR coordination',
    mitigationStatus: 'investigating'
  },
  {
    id: 'atc-008',
    type: 'AMAN/DMAN Algorithm Poisoning',
    severity: 'medium',
    description: 'Arrival/Departure Manager sequence optimization algorithm producing dangerously compressed spacing by accepting manipulated TMA entry time estimates from compromised feeder sector.',
    facility: 'Amsterdam Schiphol TMA',
    protocol: 'AMAN/DMAN P-RNAV',
    timestamp: '7m ago',
    impactRadius: 'EHAM arrivals/departures',
    mitigationStatus: 'contained'
  },
];

const MARITIME_THREATS: MaritimeThreat[] = [
  {
    id: 'mar-001',
    type: 'AIS Spoofing - Ghost Fleet',
    severity: 'critical',
    description: 'Mass injection of 47 phantom AIS Class-A targets in Strait of Hormuz creating false maritime traffic picture. Spoofed vessels show valid MMSI prefixes for Iranian-flagged tankers.',
    vesselMMSI: '422100xxx (batch)',
    vesselName: 'Multiple phantom vessels',
    position: '26.56N, 56.25E',
    timestamp: '8s ago',
    system: 'AIS Class-A / VDL',
    flagState: 'IR (spoofed)'
  },
  {
    id: 'mar-002',
    type: 'VSAT Terminal Exploitation',
    severity: 'critical',
    description: 'Remote code execution achieved on Cobham SAILOR 900 VSAT terminal via unpatched CVE-2024-XXXX. Attacker has persistent shell access with ability to intercept all ship-to-shore IP traffic.',
    vesselMMSI: '311045200',
    vesselName: 'MV ATLANTIC CROWN',
    position: '41.12N, 28.97E',
    timestamp: '23s ago',
    system: 'Ku-band VSAT / Cobham SAILOR',
    flagState: 'BS (Bahamas)'
  },
  {
    id: 'mar-003',
    type: 'ECDIS Chart Manipulation',
    severity: 'critical',
    description: 'Tampered ENC cells S-57 format injected via compromised chart update service showing false depth soundings removing 12m shoal from approach to Rotterdam Europoort.',
    vesselMMSI: '244670580',
    vesselName: 'MV EUROMAX TRADER',
    position: '51.98N, 4.05E',
    timestamp: '1m ago',
    system: 'ECDIS / S-57 ENC / IHO S-63',
    flagState: 'NL (Netherlands)'
  },
  {
    id: 'mar-004',
    type: 'Ballast Water System Attack',
    severity: 'high',
    description: 'ICS/SCADA attack on ballast water management system via compromised shipboard OT network. Unauthorized ballast operations could destabilize vessel trim during cargo operations at Jebel Ali.',
    vesselMMSI: '538006751',
    vesselName: 'MV DUBAI PIONEER',
    position: '25.01N, 55.06E',
    timestamp: '3m ago',
    system: 'BWMS PLC / Modbus TCP',
    flagState: 'MH (Marshall Islands)'
  },
  {
    id: 'mar-005',
    type: 'Ship-to-Shore Comm Compromise',
    severity: 'high',
    description: 'GMDSS DSC controller compromised to broadcast false distress alerts on Ch.70 (156.525 MHz). Multiple SAR assets diverted from actual emergency in Singapore Strait TSS.',
    vesselMMSI: '563098700',
    vesselName: 'MT STRAITS VOYAGER',
    position: '1.24N, 103.82E',
    timestamp: '5m ago',
    system: 'GMDSS / DSC VHF Ch.70',
    flagState: 'SG (Singapore)'
  },
  {
    id: 'mar-006',
    type: 'GPS Spoofing - Navigation',
    severity: 'critical',
    description: 'Coordinated GPS spoofing causing reported positions to drift 0.8nm eastward in Black Sea approaches. 11 vessels affected showing positions ashore while physically in shipping channel.',
    vesselMMSI: 'Multiple affected',
    vesselName: 'Various Black Sea traffic',
    position: '44.62N, 33.52E',
    timestamp: '7m ago',
    system: 'GNSS L1 C/A / IMO A.1046',
    flagState: 'Multiple flags'
  },
  {
    id: 'mar-007',
    type: 'Engine Room SCADA Intrusion',
    severity: 'high',
    description: 'Unauthorized access to main engine automation system via ship-wide Ethernet. Attacker modified fuel injection timing parameters and disabled high-temperature alarms on exhaust manifold.',
    vesselMMSI: '636092461',
    vesselName: 'MV LIBERTY HORIZON',
    position: '36.14N, -5.35W',
    timestamp: '9m ago',
    system: 'ME Control / Wartsila UNIC',
    flagState: 'LR (Liberia)'
  },
  {
    id: 'mar-008',
    type: 'Port Facility VTS Manipulation',
    severity: 'medium',
    description: 'Vessel Traffic Service radar overlay showing manipulated tracks in Suez Canal approaches. False CPA/TCPA calculations being generated for northbound convoy vessels.',
    vesselMMSI: 'N/A - Shore',
    vesselName: 'Suez VTS North',
    position: '31.26N, 32.31E',
    timestamp: '12m ago',
    system: 'VTS / VTMIS radar fusion',
    flagState: 'EG (shore-based)'
  },
];

const COMPLIANCE_ITEMS: ComplianceItem[] = [
  {
    id: 'comp-001',
    framework: 'ICAO Annex 17',
    directive: 'Amendment 17 - Cybersecurity Provisions for Aviation',
    status: 'partial',
    description: 'Requirement 4.9.1: Each Contracting State shall ensure cyber threats to civil aviation are identified, assessed, and managed through risk-based security measures. Gap identified in CNS/ATM system cyber resilience testing.',
    lastAudit: '2026-02-15',
    nextDeadline: '2026-06-30',
    findings: 4,
    riskLevel: 'high'
  },
  {
    id: 'comp-002',
    framework: 'TSA SD 1580/82-2022',
    directive: 'TSA Cybersecurity Directive - Airport/Aircraft Operators',
    status: 'non-compliant',
    description: 'Section 3(A): Failure to implement network segmentation between IT and OT systems in airport critical infrastructure. Baggage handling SCADA accessible from corporate LAN.',
    lastAudit: '2026-01-20',
    nextDeadline: '2026-04-30',
    findings: 7,
    riskLevel: 'critical'
  },
  {
    id: 'comp-003',
    framework: 'IMO MSC-FAL.1/Circ.3',
    directive: 'Guidelines on Maritime Cyber Risk Management',
    status: 'compliant',
    description: 'Fleet-wide implementation of cyber risk management framework per ISM Code integration. All 34 vessels have completed Cyber Risk Assessment and Safety Management System updates per Resolution MSC.428(98).',
    lastAudit: '2026-03-10',
    nextDeadline: '2027-01-15',
    findings: 0,
    riskLevel: 'low'
  },
  {
    id: 'comp-004',
    framework: 'EASA Part-IS',
    directive: 'Information Security for Aviation Organizations',
    status: 'partial',
    description: 'IS.I.OR.220: Information security risk treatment process partially implemented. Missing continuous monitoring capability for avionics data bus (ARINC 429/664) anomaly detection.',
    lastAudit: '2026-02-28',
    nextDeadline: '2026-09-15',
    findings: 3,
    riskLevel: 'medium'
  },
  {
    id: 'comp-005',
    framework: 'TSA EA-21-01',
    directive: 'TSA Emergency Amendment - Pipeline & Surface',
    status: 'non-compliant',
    description: 'Requirement 2: 24-hour incident reporting to CISA not operational for maritime port facilities. SIEM integration with CISA AIS feed incomplete, manual reporting process exceeds 72-hour window.',
    lastAudit: '2026-01-05',
    nextDeadline: '2026-05-15',
    findings: 5,
    riskLevel: 'critical'
  },
  {
    id: 'comp-006',
    framework: 'ICAO Doc 9985',
    directive: 'ATM Security Manual - Cyber Threat Annex',
    status: 'review-pending',
    description: 'Chapter 6: ATM system cyber resilience requirements for SWIM and AIM data exchanges. Pending third-party penetration test of AMDB and terrain database integrity validation systems.',
    lastAudit: '2025-12-01',
    nextDeadline: '2026-07-31',
    findings: 2,
    riskLevel: 'medium'
  },
  {
    id: 'comp-007',
    framework: 'IACS UR E26/E27',
    directive: 'Unified Requirements for Cyber Resilience of Ships',
    status: 'partial',
    description: 'UR E27: Equipment cyber resilience requirements not met for legacy bridge navigation systems on 12 of 34 fleet vessels. ECDIS and radar systems running unsupported OS versions.',
    lastAudit: '2026-03-22',
    nextDeadline: '2026-12-01',
    findings: 12,
    riskLevel: 'high'
  },
  {
    id: 'comp-008',
    framework: 'NIST SP 800-82 Rev.3',
    directive: 'Guide to OT Security - Aviation ICS Supplement',
    status: 'compliant',
    description: 'Airport OT/ICS security controls implemented per SP 800-82 recommendations. Network monitoring, access controls, and incident response procedures validated for HVAC, fire suppression, and access control systems.',
    lastAudit: '2026-04-01',
    nextDeadline: '2027-04-01',
    findings: 1,
    riskLevel: 'low'
  },
];

const AVIATION_METRICS = [
  { label: 'ADS-B Anomalies / hr', value: '1,247', trend: '+18%', color: 'text-red-400' },
  { label: 'GPS Jamming Zones', value: '14', trend: '+3', color: 'text-orange-400' },
  { label: 'ATC Intrusions', value: '23', trend: '+6%', color: 'text-amber-400' },
  { label: 'AIS Spoofing Events', value: '389', trend: '+41%', color: 'text-sky-400' },
  { label: 'VSAT Compromises', value: '7', trend: '-2', color: 'text-cyan-400' },
  { label: 'Compliance Score', value: '62%', trend: '-8%', color: 'text-blue-400' },
];

// --- Helpers ---

const sevColor = (s: string) => {
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
};

const complianceColor = (s: string) => {
  if (s === 'compliant') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (s === 'non-compliant') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'partial') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
};

// --- Component ---

export default function AviationThreats() {
  const [tab, setTab] = useState<'adsb' | 'atc' | 'maritime' | 'compliance'>('adsb');
  const [liveADSB, setLiveADSB] = useState(ADSB_THREATS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rotate live ADS-B feed
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveADSB(prev => {
        const shifted = [...prev];
        const first = shifted.shift()!;
        first.timestamp = 'just now';
        shifted.push(first);
        return shifted;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Canvas animation: flight paths + GPS jamming zones
  useEffect(() => {
    if (tab !== 'adsb') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 320;
    let frame = 0;
    let animId: number;

    // Define airports as waypoints
    const airports = [
      { x: W * 0.08, y: H * 0.3, label: 'KJFK' },
      { x: W * 0.22, y: H * 0.15, label: 'EGLL' },
      { x: W * 0.38, y: H * 0.25, label: 'LFPG' },
      { x: W * 0.55, y: H * 0.12, label: 'EDDF' },
      { x: W * 0.7, y: H * 0.35, label: 'OMDB' },
      { x: W * 0.85, y: H * 0.2, label: 'VHHH' },
      { x: W * 0.45, y: H * 0.55, label: 'EHAM' },
      { x: W * 0.15, y: H * 0.65, label: 'LEMD' },
    ];

    // Flight routes (pairs of airport indices)
    const routes = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
      [0, 2], [1, 6], [7, 3], [6, 4], [5, 0],
    ];

    // GPS jamming zones (red threat areas)
    const jammingZones = [
      { x: W * 0.63, y: H * 0.42, r: 40, label: 'E.MED JAM' },
      { x: W * 0.32, y: H * 0.72, r: 30, label: 'GPS SPOOF' },
      { x: W * 0.78, y: H * 0.65, r: 35, label: 'ACTIVE JAM' },
    ];

    // Ghost aircraft positions (anomalous blips)
    const ghostAircraft = [
      { baseX: W * 0.2, baseY: H * 0.4 },
      { baseX: W * 0.5, baseY: H * 0.3 },
      { baseX: W * 0.75, baseY: H * 0.5 },
      { baseX: W * 0.4, baseY: H * 0.7 },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Draw GPS jamming zones (pulsing red circles)
      jammingZones.forEach(zone => {
        const pulse = Math.sin(frame * 0.04) * 8;
        // Outer glow
        const gradient = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.r + pulse + 15);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
        gradient.addColorStop(0.6, 'rgba(239, 68, 68, 0.08)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r + pulse + 15, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        // Zone border
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + Math.sin(frame * 0.05) * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Zone label
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(zone.label, zone.x, zone.y + 3);
      });

      // Draw routes as dashed lines
      routes.forEach(([a, b]) => {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(airports[a].x, airports[a].y);
        ctx.lineTo(airports[b].x, airports[b].y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Animated aircraft dots moving along routes
      routes.forEach(([a, b], i) => {
        const speed = 0.003 + (i % 3) * 0.001;
        const progress = ((frame * speed) + (i * 0.15)) % 1;
        const ax = airports[a].x + (airports[b].x - airports[a].x) * progress;
        const ay = airports[a].y + (airports[b].y - airports[a].y) * progress;

        // Aircraft trail
        for (let t = 0; t < 5; t++) {
          const trailP = Math.max(0, progress - t * 0.02);
          const tx = airports[a].x + (airports[b].x - airports[a].x) * trailP;
          const ty = airports[a].y + (airports[b].y - airports[a].y) * trailP;
          ctx.beginPath();
          ctx.arc(tx, ty, 1.5 - t * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${0.5 - t * 0.1})`;
          ctx.fill();
        }

        // Aircraft dot
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#38BDF8';
        ctx.fill();
        // Glow
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fill();
      });

      // Ghost aircraft (red blinking)
      ghostAircraft.forEach((ghost, i) => {
        const wobbleX = Math.sin(frame * 0.03 + i * 2) * 12;
        const wobbleY = Math.cos(frame * 0.025 + i * 1.5) * 8;
        const gx = ghost.baseX + wobbleX;
        const gy = ghost.baseY + wobbleY;
        const blink = Math.sin(frame * 0.08 + i) > 0;

        if (blink) {
          // Ghost glow
          ctx.beginPath();
          ctx.arc(gx, gy, 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
          ctx.fill();
          // Ghost dot
          ctx.beginPath();
          ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#EF4444';
          ctx.fill();
          // X mark
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx - 5, gy - 5);
          ctx.lineTo(gx + 5, gy + 5);
          ctx.moveTo(gx + 5, gy - 5);
          ctx.lineTo(gx - 5, gy + 5);
          ctx.stroke();
        }
      });

      // Draw airports
      airports.forEach(ap => {
        // Airport circle
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 22, 42, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Label
        ctx.fillStyle = '#38BDF8';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ap.label, ap.x, ap.y + 3);
        // Label below
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.font = '7px monospace';
        ctx.fillText(ap.label, ap.x, ap.y + 22);
      });

      // Radar sweep for one jamming zone
      const sweepAngle = (frame * 0.02) % (Math.PI * 2);
      const sweepZone = jammingZones[0];
      ctx.beginPath();
      ctx.moveTo(sweepZone.x, sweepZone.y);
      ctx.arc(sweepZone.x, sweepZone.y, sweepZone.r + 10, sweepAngle, sweepAngle + 0.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fill();

      frame++;
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [tab]);

  const TABS = [
    { id: 'adsb' as const, label: 'ADS-B Threats', icon: Navigation },
    { id: 'atc' as const, label: 'ATC Systems', icon: Radar },
    { id: 'maritime' as const, label: 'Maritime VSAT', icon: Anchor },
    { id: 'compliance' as const, label: 'AVSEC Compliance', icon: ShieldCheck },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500/20 to-blue-500/20 border border-sky-500/30 flex items-center justify-center">
            <Navigation size={20} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Aviation & Maritime Threat Intelligence</h2>
            <p className="text-xs text-slate-500">ADS-B, ATC, VSAT & AVSEC cybersecurity monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">ELEVATED</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono font-bold text-sky-400 tracking-wider">
            0xDSI AVSEC
          </span>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-6 gap-3">
        {AVIATION_METRICS.map((m, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            <div className={`text-[10px] ${m.trend.startsWith('+') || m.trend.startsWith('-') && m.label === 'Compliance Score' ? 'text-red-400' : m.trend.startsWith('-') ? 'text-emerald-400' : 'text-red-400'}`}>{m.trend}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-sky-300 border-sky-400 bg-sky-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* ========== ADS-B Threats Tab ========== */}
      {tab === 'adsb' && (
        <div className="space-y-4">
          {/* Canvas: Flight paths + GPS jamming zones */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Navigation size={14} className="text-sky-400" />
              <span className="text-xs font-semibold text-white">ADS-B Surveillance Map - Live Threat Overlay</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-[10px] text-red-400 border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />14 Ghost Targets Active
              </span>
            </div>
            <canvas ref={canvasRef} className="w-full" style={{ height: 320 }} />
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Tracked Aircraft', value: '4,827', color: 'text-sky-400' },
                { label: 'Ghost Targets', value: '14', color: 'text-red-400' },
                { label: 'Jamming Zones', value: '3', color: 'text-orange-400' },
                { label: 'MLAT Integrity', value: '87%', color: 'text-emerald-400' },
              ].map((s, i) => (
                <div key={i} className="bg-[#0A1628]/90 border border-[#1e293b] rounded-lg p-2 text-center backdrop-blur">
                  <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ADS-B Threat Feed */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-mono font-bold">LIVE ADS-B / GNSS THREAT FEED</span>
          </div>
          {liveADSB.map((e, i) => (
            <div key={e.id + i} className={`bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 transition-all ${i === liveADSB.length - 1 ? 'animate-pulse border-red-500/30' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(e.severity)}`}>{e.severity.toUpperCase()}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">{e.vector.split(' ')[0]}</span>
                    <span className="text-xs font-semibold text-white">{e.type}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{e.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><Plane size={10} />ICAO: <span className="text-sky-400 font-mono">{e.icao24}</span></span>
                    <span className="flex items-center gap-1"><Target size={10} />{e.flightId}</span>
                    <span className="flex items-center gap-1"><MapPin size={10} />{e.region}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{e.timestamp}</span>
                    <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={10} />{e.affectedSystems}</span>
                  </div>
                </div>
                <button className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-semibold whitespace-nowrap ml-3">
                  Block Source
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== ATC Systems Tab ========== */}
      {tab === 'atc' && (
        <div className="space-y-4">
          {/* ATC summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-400">4</div>
              <div className="text-xs text-slate-500 mt-1">Active ATC Attacks</div>
              <div className="text-[10px] text-red-400 mt-1">2 critical severity</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-sky-400">3</div>
              <div className="text-xs text-slate-500 mt-1">Contained Threats</div>
              <div className="text-[10px] text-emerald-400 mt-1">avg 4.2min response</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">680K</div>
              <div className="text-xs text-slate-500 mt-1">ASTERIX Msgs Scanned / hr</div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: '94%' }} />
              </div>
            </div>
          </div>

          {/* ATC Threat List */}
          <div className="flex items-center gap-2 mb-2">
            <Radar size={14} className="text-sky-400" />
            <span className="text-xs text-sky-400 font-mono font-bold">ATC / RADAR / COMM THREATS</span>
          </div>
          {ATC_THREATS.map(t => (
            <div key={t.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(t.severity)}`}>{t.severity.toUpperCase()}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">{t.protocol.split(' ')[0]}</span>
                    <span className="text-xs font-semibold text-white">{t.type}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><MapPin size={10} />{t.facility}</span>
                    <span className="flex items-center gap-1"><Radio size={10} />{t.protocol}</span>
                    <span className="flex items-center gap-1"><Globe size={10} />{t.impactRadius}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{t.timestamp}</span>
                  </div>
                </div>
                <span className={`px-3 py-1.5 text-[10px] rounded-lg border font-semibold whitespace-nowrap ml-3 ${t.mitigationStatus === 'contained' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : t.mitigationStatus === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {t.mitigationStatus === 'contained' ? 'Contained' : t.mitigationStatus === 'active' ? 'Active Threat' : 'Investigating'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== Maritime VSAT Tab ========== */}
      {tab === 'maritime' && (
        <div className="space-y-4">
          {/* Maritime summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Vessels Monitored', value: '2,341', icon: Ship, color: 'text-sky-400' },
              { label: 'AIS Anomalies', value: '389', icon: AlertTriangle, color: 'text-red-400' },
              { label: 'VSAT Compromised', value: '7', icon: Signal, color: 'text-orange-400' },
              { label: 'ECDIS Alerts', value: '12', icon: Compass, color: 'text-amber-400' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className={s.color} />
                    <span className="text-[10px] text-slate-500">{s.label}</span>
                  </div>
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                </div>
              );
            })}
          </div>

          {/* Maritime Threat List */}
          <div className="flex items-center gap-2 mb-2">
            <Anchor size={14} className="text-sky-400" />
            <span className="text-xs text-sky-400 font-mono font-bold">MARITIME CYBER THREAT FEED</span>
          </div>
          {MARITIME_THREATS.map(t => (
            <div key={t.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(t.severity)}`}>{t.severity.toUpperCase()}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">{t.system.split(' / ')[0]}</span>
                    <span className="text-xs font-semibold text-white">{t.type}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t.description}</p>
                  <div className="grid grid-cols-3 gap-3 mt-3 text-[10px]">
                    <div>
                      <span className="text-slate-500">Vessel: </span>
                      <span className="text-slate-300 font-semibold">{t.vesselName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">MMSI: </span>
                      <span className="text-sky-400 font-mono">{t.vesselMMSI}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Flag: </span>
                      <span className="text-slate-300">{t.flagState}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={10} />{t.position}</span>
                    <span className="flex items-center gap-1"><Radio size={10} />{t.system}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{t.timestamp}</span>
                  </div>
                </div>
                <button className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-semibold whitespace-nowrap ml-3">
                  Isolate Vessel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== AVSEC Compliance Tab ========== */}
      {tab === 'compliance' && (
        <div className="space-y-4">
          {/* Compliance overview */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Compliant', value: '2', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Partial', value: '3', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Non-Compliant', value: '2', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
              { label: 'Review Pending', value: '1', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
            ].map((s, i) => (
              <div key={i} className={`rounded-xl p-3 text-center border ${s.bg}`}>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Overall score bar */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-semibold">Overall AVSEC/Maritime Compliance Score</span>
              <span className="text-lg font-bold text-amber-400">62%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" style={{ width: '62%' }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
              <span>34 total findings across 8 frameworks</span>
              <span>Target: 85% by Q3 2026</span>
            </div>
          </div>

          {/* Compliance Items */}
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={14} className="text-sky-400" />
            <span className="text-xs text-sky-400 font-mono font-bold">REGULATORY COMPLIANCE STATUS</span>
          </div>
          {COMPLIANCE_ITEMS.map(c => (
            <div key={c.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.status === 'compliant' ? 'bg-emerald-500/10' : c.status === 'non-compliant' ? 'bg-red-500/10' : c.status === 'partial' ? 'bg-amber-500/10' : 'bg-sky-500/10'}`}>
                    {c.status === 'compliant' ? <ShieldCheck size={16} className="text-emerald-400" /> :
                     c.status === 'non-compliant' ? <AlertTriangle size={16} className="text-red-400" /> :
                     c.status === 'partial' ? <Shield size={16} className="text-amber-400" /> :
                     <Eye size={16} className="text-sky-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{c.framework}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full border ${complianceColor(c.status)}`}>{c.status.replace('-', ' ').toUpperCase()}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(c.riskLevel)}`}>RISK: {c.riskLevel.toUpperCase()}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{c.directive}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-300">{c.findings}</div>
                  <div className="text-[10px] text-slate-500">findings</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{c.description}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1"><Clock size={10} />Last audit: <span className="text-slate-300">{c.lastAudit}</span></span>
                  <span className="flex items-center gap-1"><Target size={10} />Deadline: <span className={c.nextDeadline <= '2026-05-01' ? 'text-red-400 font-semibold' : 'text-slate-300'}>{c.nextDeadline}</span></span>
                </div>
                <button className="flex items-center gap-1 px-2 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors font-semibold">
                  View Report <ChevronRight size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
