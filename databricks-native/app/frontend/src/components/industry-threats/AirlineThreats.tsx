import { useState, useEffect, useRef } from 'react';
import {
  Plane, Cpu, Radio, Ticket, Boxes, BookOpen, AlertTriangle, Clock,
  Shield, Activity, Wifi, HardDrive, Fuel, Luggage, Users,
  ChevronRight, Target, Zap, GitBranch, Lock, Gauge, ScanLine,
  Globe, Skull, Calendar
} from 'lucide-react';

/**
 * Airline-operator attack surface. Distinct from the Aviation & Maritime view
 * (ADS-B / ATC / VSAT infrastructure): this focuses on the airline enterprise
 * itself - the connected fleet, datalink, passenger/booking systems, loyalty,
 * and airport ground operations. Scenarios are modeled on published research
 * (see the Research tab for citations).
 */

type Sev = 'critical' | 'high' | 'medium' | 'low';

interface UseCase {
  id: string;
  type: string;
  severity: Sev;
  description: string;
  telemetry: string;
  vector: string;
  systems: string;
  control: string;
  ref?: string;
  timestamp: string;
}

interface Research {
  id: string;
  title: string;
  authors: string;
  venue: string;
  takeaway: string;
  maps: string;
}

// ---------------------------------------------------------------------------
// 1. Connected / e-Enabled aircraft & avionics
// ---------------------------------------------------------------------------
const CONNECTED: UseCase[] = [
  {
    id: 'con-001',
    type: 'IFEC-to-Avionics Domain Crossing',
    severity: 'critical',
    description: 'Passenger in-flight entertainment seat-back unit used as a pivot toward the aircraft information services domain. Weak segmentation between the Passenger (PIESD) and Aircraft Control (ACD) domains on an e-enabled widebody lets a compromised IFE server probe the CDN/NIU gateway feeding non-essential avionics data.',
    telemetry: 'IFE Linux syslog, seat-box (SEB) auth failures, NIU/CDN east-west flow logs, ARINC 664 VL bandwidth spikes',
    vector: 'IFE web-app RCE + lateral movement across cabin/avionics gateway',
    systems: 'Panasonic/Thales IFEC, Network Interface Unit, ARINC 664 AFDX',
    control: 'Enforce one-way data diodes ACD->PIESD; alert on any PIESD->ACD initiation',
    ref: 'IOActive IFE research; Chris Roberts 2015 affidavit',
    timestamp: '4s ago',
  },
  {
    id: 'con-002',
    type: 'ARINC 429 Bus Injection (EFB-driven)',
    severity: 'high',
    description: 'Malformed labels injected onto a legacy ARINC 429 avionics data bus via a compromised EFB interface unit. The unauthenticated broadcast bus accepts spoofed air-data labels (altitude, airspeed) that could corrupt an FMS position solution if bridged.',
    telemetry: 'ARINC 429 label-rate baseline drift, unexpected label IDs, EFB-AID USB enumeration events',
    vector: 'Unauthenticated 429 broadcast + EFB gateway tampering',
    systems: 'ARINC 429 / ARINC 825 (CANaerospace), EFB Aircraft Interface Device',
    control: 'Label allow-listing at AID; physical bus isolation; 429 anomaly baseline',
    ref: 'Pen Test Partners avionics bus research',
    timestamp: '31s ago',
  },
  {
    id: 'con-003',
    type: 'Malicious Loadable Software Airplane Part (LSAP)',
    severity: 'critical',
    description: 'Tampered navigation database (NavDB / FMS cycle) or field-loadable software staged through the airline software distribution chain. A forged digital signature or an unsigned dataloader path would push an altered terrain/approach database to the fleet during turnaround.',
    telemetry: 'Dataload manifest hashes vs. golden baseline, ARINC 615A load session logs, signing-cert chain validation',
    vector: 'Supply-chain compromise of the NavDB/LSAP distribution + weak signature checks',
    systems: 'ARINC 615A dataloader, FMS NavDB, EGPWS terrain DB',
    control: 'Cryptographic LSAP signing + hash verification before load; chain-of-custody',
    ref: 'DEF CON Aerospace Village; Boeing 747 floppy-disk NavDB load (PTP, 2020)',
    timestamp: '1m ago',
  },
  {
    id: 'con-004',
    type: 'Aircraft Health / ACMS Telemetry Tampering',
    severity: 'medium',
    description: 'Engine and airframe condition-monitoring data (ACMS/AHM, EICAS/ECAM parameters) altered in transit from aircraft to the airline MRO analytics platform, masking an exceedance to defer a maintenance action.',
    telemetry: 'ACARS AHM report gaps, out-of-range EGT/N1 with no alert, MRO ingest checksum failures',
    vector: 'ACARS AHM downlink manipulation + MRO pipeline injection',
    systems: 'ACMS, Aircraft Health Monitoring, MRO/Prognostics lakehouse',
    control: 'Signed AHM records; cross-check downlink vs. QAR on landing',
    ref: 'Connected-aircraft telemetry integrity research',
    timestamp: '3m ago',
  },
  {
    id: 'con-005',
    type: 'EFB Performance-Calculation Manipulation',
    severity: 'high',
    description: 'Electronic Flight Bag takeoff-performance app fed manipulated runway or weight-and-balance inputs, producing dangerously low V-speeds / thrust settings - a class of error implicated in real tail-strike and runway-overrun events, here induced deliberately via a trojanized EFB app update.',
    telemetry: 'EFB app version/hash, W&B input anomaly vs. load sheet, MDM compliance state',
    vector: 'Trojanized EFB app sideload / MDM bypass',
    systems: 'Class-2 EFB, performance/W&B apps, load control',
    control: 'Locked-down MDM, signed EFB apps, independent load-sheet cross-check',
    ref: 'Pen Test Partners EFB research',
    timestamp: '6m ago',
  },
  {
    id: 'con-006',
    type: 'Boeing 787 Crew Information System Exposure',
    severity: 'critical',
    description: 'Vulnerabilities in the Crew Information System/Maintenance System (CIS/MS) network of an e-enabled widebody, reachable from lower-trust networks, could theoretically be chained toward the Common Data Network - the exact concern IOActive raised after reverse-engineering the 787 core network.',
    telemetry: 'CIS/MS auth logs, VxWorks service exposure, inter-network ACL violations, CDN gateway flow anomalies',
    vector: 'Memory-corruption in CIS/MS services + weak inter-domain ACLs',
    systems: 'Boeing 787 CIS/MS, Common Data Network, VxWorks avionics',
    control: 'Patch CIS/MS, harden inter-domain ACLs, monitor CDN gateway',
    ref: 'Santamarta (IOActive) - Reversing the Boeing 787 Core Network, BH USA 2019',
    timestamp: '2m ago',
  },
  {
    id: 'con-007',
    type: 'TCAS / ACAS Resolution Advisory Spoofing',
    severity: 'high',
    description: 'Fabricated Mode-S / ADS-B intruder tracks injected to trigger spurious TCAS Resolution Advisories, inducing unnecessary climb/descent commands and destabilizing traffic flow in a busy terminal area.',
    telemetry: 'TCAS RA rate vs. baseline, phantom intruder correlation with radar, Mode-S reply anomalies',
    vector: 'Mode-S/ADS-B intruder injection into collision-avoidance logic',
    systems: 'TCAS II / ACAS X, Mode-S transponder',
    control: 'Cross-validate RA triggers with primary radar; RA anomaly baselining',
    ref: 'ACAS/TCAS spoofing research',
    timestamp: '5m ago',
  },
];

// ---------------------------------------------------------------------------
// 2. Datalink / ACARS / SATCOM
// ---------------------------------------------------------------------------
const DATALINK: UseCase[] = [
  {
    id: 'dl-001',
    type: 'ACARS Uplink Spoofing (Load Sheet / PDC)',
    severity: 'critical',
    description: 'Forged ACARS uplinks delivering a falsified final load sheet and pre-departure clearance. ACARS has no message authentication; an SDR-equipped adversary near the field injects plausible OOOI/free-text messages to influence crew decisions.',
    telemetry: 'ACARS message provenance, VDL-2 ground-station fingerprint, duplicate/near-dup message correlation',
    vector: 'Unauthenticated ACARS injection over VDL Mode 2 / POA',
    systems: 'ACARS, AOC datalink, Departure Clearance (PDC/DCL)',
    control: 'Out-of-band load-sheet confirmation; ACARS anomaly + station allow-list',
    ref: 'Teso HITB 2013; Strohmeier et al. ACARS privacy study',
    timestamp: '9s ago',
  },
  {
    id: 'dl-002',
    type: 'ACARS Plaintext Data Exfiltration',
    severity: 'high',
    description: 'Passive capture of clear-text ACARS reveals crew names, passenger medical/diversion messages, maintenance faults, and even booking references - a documented privacy leak that also builds targeting intelligence for follow-on attacks.',
    telemetry: 'ACARS free-text PII detection, sensitive-keyword hits, downlink volume by tail',
    vector: 'Passive VHF/SATCOM ACARS intercept',
    systems: 'ACARS free-text, AOC messaging',
    control: 'Move sensitive ops to encrypted datalink; PII scrubbing at gateway',
    ref: 'Strohmeier, Smith, Lenders, Martinovic - ACARS privacy breaches (2017)',
    timestamp: '48s ago',
  },
  {
    id: 'dl-003',
    type: 'Airborne SATCOM Terminal Compromise',
    severity: 'critical',
    description: 'Hardcoded credentials and insecure firmware in an aircraft SATCOM terminal expose a path from the cabin Wi-Fi / IFE network to the terminal management plane, demonstrated across multiple Cobham/Hughes units in published SATCOM research.',
    telemetry: 'SATCOM terminal admin auth, firmware version vs. advisory, cabin-Wi-Fi->terminal flows',
    vector: 'Backdoor creds + firmware flaws reachable from PIESD',
    systems: 'Inmarsat SwiftBroadband, SATCOM terminal, cabin Wi-Fi',
    control: 'Patch firmware, remove default creds, isolate terminal mgmt VLAN',
    ref: 'Santamarta - SATCOM Terminals (BH 2014) & Last Call for SATCOM (BH 2018)',
    timestamp: '2m ago',
  },
  {
    id: 'dl-004',
    type: 'CPDLC / FANS Message Forgery',
    severity: 'high',
    description: 'Controller-Pilot Data Link message forgery over FANS-1/A on oceanic tracks, delivering a spoofed altitude or route uplink through an attacker-positioned ground station during a datalink logon window.',
    telemetry: 'CPDLC logon origin, uplink sequence anomalies, message-authentication field absence',
    vector: 'FANS logon spoofing on ATN-B1 / oceanic datalink',
    systems: 'CPDLC, FANS-1/A, ADS-C',
    control: 'ATN-B2 authentication rollout; voice cross-verify of datalink clearances',
    ref: 'Aviation datalink security literature',
    timestamp: '5m ago',
  },
  {
    id: 'dl-005',
    type: 'ADS-C Position Contract Manipulation',
    severity: 'high',
    description: 'Automatic Dependent Surveillance-Contract reports over oceanic airspace altered or replayed so the ground system holds a stale/false position, degrading procedural separation on North Atlantic and Pacific tracks.',
    telemetry: 'ADS-C report cadence vs. contract, position jump detection, FANS logon origin',
    vector: 'ADS-C report forgery/replay on FANS-1/A',
    systems: 'ADS-C, FANS-1/A, oceanic separation tools',
    control: 'Contract-integrity checks, cross-source position fusion, ATN-B2 auth',
    ref: 'Oceanic surveillance security analysis',
    timestamp: '7m ago',
  },
  {
    id: 'dl-006',
    type: 'In-Flight Wi-Fi Crew/Passenger Segmentation Bypass',
    severity: 'high',
    description: 'Weak isolation between the passenger connectivity network and the crew/EFB network lets an onboard attacker reach crew tablets, cabin-crew apps, or the content-loading server from a paid Wi-Fi seat.',
    telemetry: 'Passenger-VLAN to crew-VLAN flows, rogue DHCP/ARP on cabin net, EFB inbound connections',
    vector: 'Cabin network VLAN hopping / weak isolation',
    systems: 'In-flight connectivity, cabin services network, crew EFB Wi-Fi',
    control: 'Strict VLAN/firewall isolation, client isolation on passenger SSID',
    ref: 'Pen Test Partners in-flight Wi-Fi research',
    timestamp: '9m ago',
  },
];

// ---------------------------------------------------------------------------
// 3. Booking / DCS / GDS / Loyalty (enterprise)
// ---------------------------------------------------------------------------
const ENTERPRISE: UseCase[] = [
  {
    id: 'ent-001',
    type: 'GDS / PNR Enumeration & Takeover',
    severity: 'critical',
    description: 'Six-character booking references (PNR locators) are guessable and, in legacy GDS, protected only by last name. Automated enumeration harvests full traveler itineraries, then rebooks/cancels or redeems ancillaries - the exact weakness SRLabs demonstrated across Amadeus/Sabre/Travelport.',
    telemetry: 'GDS query rate per source, sequential PNR access pattern, retrieve-without-auth ratio',
    vector: 'PNR brute force + missing authentication on retrieval',
    systems: 'Amadeus / Sabre / Travelport GDS, PSS, check-in',
    control: 'Rate-limit + strong auth on PNR retrieval; anomaly detection on lookups',
    ref: 'Nohl & Nikodijevic, SRLabs - "Where in the World Is Carmen Sandiego?" 33C3 2016',
    timestamp: '11s ago',
  },
  {
    id: 'ent-002',
    type: 'Boarding-Pass Barcode Forgery (BCBP)',
    severity: 'high',
    description: 'IATA BCBP PDF417/Aztec barcodes are unsigned and self-describing. Decoding a pass exposes PNR + frequent-flyer number and enables crafting altered passes (cabin upgrade flag, fast-track, or bypassing a no-fly/SSSS selectee marker at document check).',
    telemetry: 'Barcode signature absence, DCS boarding-token mismatch, gate-scan vs. issued-pass diff',
    vector: 'Unsigned BCBP generation / modification',
    systems: 'DCS, boarding gate readers, IATA BCBP',
    control: 'Digitally signed boarding tokens; server-side revalidation at gate',
    ref: 'Boarding-pass barcode research (BCBP)',
    timestamp: '40s ago',
  },
  {
    id: 'ent-003',
    type: 'Frequent-Flyer Account Takeover & Points Cash-out',
    severity: 'high',
    description: 'Credential-stuffing against the loyalty portal followed by instant redemption of miles for gift cards / partner transfers - a high-liquidity fraud target. Bursts of transfers to newly linked partner accounts precede cash-out.',
    telemetry: 'Loyalty login geo/velocity, mass-redemption bursts, new partner-link + immediate transfer',
    vector: 'Credential stuffing + MFA gaps on redemption',
    systems: 'Loyalty platform, partner transfer API, payments',
    control: 'Step-up MFA on redemption/transfer; velocity + device-fingerprint rules',
    ref: 'Airline loyalty fraud pattern',
    timestamp: '1m ago',
  },
  {
    id: 'ent-004',
    type: 'Passenger Service System Data Breach',
    severity: 'critical',
    description: 'Compromise of a shared passenger-service / DCS provider exposes frequent-flyer and PNR records across an entire airline alliance - the multi-carrier blast radius seen in the 2021 SITA PSS incident affecting Star Alliance and oneworld members.',
    telemetry: 'Bulk export volume from PSS, off-hours DB reads, alliance data-share connector logs',
    vector: 'Supply-chain compromise of shared PSS/DCS provider',
    systems: 'Shared PSS, alliance data exchange, CRM',
    control: 'Vendor segmentation, export DLP, tenant-scoped access + alerting',
    ref: 'SITA PSS breach, 2021',
    timestamp: '4m ago',
  },
  {
    id: 'ent-005',
    type: 'Fare / Ancillary Logic Abuse',
    severity: 'medium',
    description: 'Automated abuse of fare-rule and ancillary pricing logic (hidden-city chaining, currency/point-of-sale arbitrage, coupon stacking) executed at bot scale against the booking engine, eroding revenue and poisoning demand forecasting.',
    telemetry: 'Booking-bot fingerprint, look-to-book ratio, repeated abandoned high-value carts',
    vector: 'Business-logic abuse of pricing/fare rules at bot scale',
    systems: 'Internet booking engine, revenue management, fare engine',
    control: 'Bot management, look-to-book throttling, fare-rule integrity checks',
    ref: 'E-commerce/airline booking abuse pattern',
    timestamp: '7m ago',
  },
  {
    id: 'ent-006',
    type: 'Biometric Boarding / Facial-Match Spoofing',
    severity: 'medium',
    description: 'Presentation attacks (printed photo, deepfake, or injected camera feed) against curb-to-gate facial-recognition boarding, plus concerns over the retention and sharing of the biometric gallery linked to PNRs.',
    telemetry: 'Liveness-check failures, match-confidence anomalies, gallery access/export logs',
    vector: 'Presentation/injection attack on face-match + biometric data exposure',
    systems: 'Biometric boarding (facial recognition), traveler-verification service',
    control: 'Liveness detection, secured camera path, minimized biometric retention',
    ref: 'Biometric boarding assurance research',
    timestamp: '9m ago',
  },
  {
    id: 'ent-007',
    type: 'Air Cargo / e-Freight & AWB Fraud',
    severity: 'high',
    description: 'Manipulation of electronic air waybills and dangerous-goods declarations in the cargo booking platform to misdeclare hazmat, divert high-value freight, or defraud through falsified weight/charges across the cargo community system.',
    telemetry: 'AWB amendment history, DG-declaration mismatch, weight vs. manifest delta, off-hours edits',
    vector: 'Cargo platform account abuse / EDI (CargoIMP/CargoXML) injection',
    systems: 'Cargo management, e-AWB, community system (CCS)',
    control: 'Change auditing, DG cross-validation, EDI partner authentication',
    ref: 'Air-cargo digital fraud analysis',
    timestamp: '12m ago',
  },
];

// ---------------------------------------------------------------------------
// 4. Airport / ground operations IoT
// ---------------------------------------------------------------------------
const GROUND: UseCase[] = [
  {
    id: 'grd-001',
    type: 'Baggage Handling System SCADA Intrusion',
    severity: 'high',
    description: 'PLC-controlled baggage sortation reachable from the corporate LAN (a documented TSA-directive gap). Manipulated sortation logic misroutes bags or halts the BHS during a bank, cascading into missed connections and ground stops.',
    telemetry: 'BHS PLC Modbus/Profinet writes from IT subnet, sorter throughput drop, engineering-station logins',
    vector: 'Flat IT/OT network + unauthenticated PLC control',
    systems: 'BHS PLC/SCADA, sortation controllers',
    control: 'IT/OT segmentation, PLC write allow-listing, OT anomaly baseline',
    ref: 'TSA SD 1580/82; airport OT segmentation findings',
    timestamp: '18s ago',
  },
  {
    id: 'grd-002',
    type: 'Into-Plane Fueling System Tampering',
    severity: 'critical',
    description: 'Compromise of networked fuel-farm and hydrant dispenser controls (or the fuel-management app) alters delivered quantity or density records, risking an under-fuel condition or a fuel-data mismatch against the flight plan.',
    telemetry: 'Fuel controller setpoint changes, uplift vs. flight-plan fuel delta, dispenser firmware state',
    vector: 'OT intrusion into fuel-management/dispenser network',
    systems: 'Fuel farm SCADA, hydrant dispensers, fuel-mgmt software',
    control: 'Isolated fuel OT VLAN, dual-source fuel reconciliation, integrity alarms',
    ref: 'Airport OT/ICS risk assessments',
    timestamp: '1m ago',
  },
  {
    id: 'grd-003',
    type: 'Ground Support Equipment (GSE) IoT Hijack',
    severity: 'medium',
    description: 'Connected GSE (pushback tugs, belt loaders, GPUs, jet bridges) exposes telematics/CAN gateways over ramp Wi-Fi/LTE. Spoofed commands or firmware tampering could immobilize equipment or drive a jet bridge into an aircraft during turnaround.',
    telemetry: 'GSE telematics anomalies, CAN gateway auth failures, jet-bridge PLC command source',
    vector: 'Insecure IoT telematics / ramp wireless + CAN access',
    systems: 'GSE telematics, jet-bridge PLC, ramp IoT gateways',
    control: 'Mutual-auth telematics, signed firmware, ramp network isolation',
    ref: 'Connected-GSE / ramp IoT research',
    timestamp: '3m ago',
  },
  {
    id: 'grd-004',
    type: 'FIDS / PA System Defacement',
    severity: 'medium',
    description: 'Flight Information Display and public-address systems on an internet-exposed CMS get defaced or used to broadcast false gate/boarding info and evacuation messages, driving crowd disruption and reputational damage.',
    telemetry: 'FIDS CMS admin logins, out-of-schedule content pushes, PA trigger source',
    vector: 'Exposed CMS / weak admin auth',
    systems: 'FIDS, airport PA, gate displays',
    control: 'CMS MFA + allow-listing, content-change approval workflow',
    ref: 'Airport display-system exposure reports',
    timestamp: '5m ago',
  },
  {
    id: 'grd-005',
    type: 'Turnaround Wi-Fi Datalink Bridge',
    severity: 'high',
    description: 'Gate-based wireless "gatelink" used to offload QAR data and load cabin/IFE content becomes a bridge into the aircraft networks when the ground Wi-Fi is compromised, enabling staged content or software injection during the turn.',
    telemetry: 'Gatelink association logs, unexpected large uploads to tail, off-schedule dataload sessions',
    vector: 'Compromised gatelink Wi-Fi + weak aircraft-side auth',
    systems: 'Gatelink Wi-Fi, wireless QAR, IFE content loader',
    control: 'Mutual TLS gatelink, signed content, per-session dataload approval',
    ref: 'Connected-aircraft turnaround research',
    timestamp: '8m ago',
  },
  {
    id: 'grd-006',
    type: 'Drone / UAS Incursion & Airspace Disruption',
    severity: 'high',
    description: 'Unauthorized drone activity over the movement area forces runway closures and ground stops - the Gatwick 2018 pattern - while spoofed Remote-ID or GPS-driven geofence evasion complicates counter-UAS attribution.',
    telemetry: 'Counter-UAS radar/RF detections, Remote-ID inconsistencies, runway-closure correlation',
    vector: 'Malicious/negligent UAS operation + Remote-ID spoofing',
    systems: 'Counter-UAS sensors, airport ops, Remote-ID',
    control: 'C-UAS detection + geofence enforcement, response playbook, RF direction-finding',
    ref: 'Gatwick 2018 drone disruption; counter-UAS research',
    timestamp: '10m ago',
  },
  {
    id: 'grd-007',
    type: 'Crew Rostering / Scheduling Ransomware',
    severity: 'critical',
    description: 'Ransomware detonated in the crew-management and rostering platform strands crews out of position, breaches duty-time limits, and cascades into mass cancellations - a documented cause of multi-day operational meltdowns.',
    telemetry: 'Mass file-encryption signatures, roster DB availability, backup-restore RTO, bulk crew re-assignments',
    vector: 'Ransomware via phished ops-staff credentials / RDP',
    systems: 'Crew management, rostering, flight ops control',
    control: 'Immutable backups, network segmentation, MFA, tested recovery runbooks',
    ref: 'Airline operational ransomware incidents',
    timestamp: '13m ago',
  },
];

// ---------------------------------------------------------------------------
// 5. GPS / GNSS environment (current, high-profile)
// ---------------------------------------------------------------------------
const GNSS: UseCase[] = [
  {
    id: 'gps-001',
    type: 'Regional GPS Spoofing - IRS Corruption',
    severity: 'critical',
    description: 'Sustained GNSS spoofing across a conflict-adjacent FIR feeds false position/time to airliners, corrupting the inertial reference system and clock, triggering false terrain warnings and, in reported cases, forcing aircraft to lose all navigation capability and divert.',
    telemetry: 'GNSS/IRS position divergence, sudden clock jumps, EGPWS false alerts by region',
    vector: 'High-power ground GNSS spoofer near flight corridors',
    systems: 'GNSS receivers, IRS/IRU, EGPWS, FMS',
    control: 'Multi-constellation + IRS-coasting logic, spoof-detection, route advisories',
    ref: 'OPSGROUP GPS-spoofing reports, 2023-2024',
    timestamp: '22s ago',
  },
  {
    id: 'gps-002',
    type: 'Timing Attack on Ops Systems',
    severity: 'high',
    description: 'GNSS-derived time disruption cascades into ground systems that depend on GPS time (ACARS timestamps, CCTV, access control, data-center sync), degrading forensic timelines and correlation across the airline SOC.',
    telemetry: 'NTP/GPS-clock offset alarms, timestamp skew across log sources, correlation-window failures',
    vector: 'GNSS time spoofing affecting GPS-disciplined clocks',
    systems: 'GPS-disciplined NTP, SIEM time sync, access control',
    control: 'Holdover oscillators, multi-source time, skew monitoring',
    ref: 'GNSS timing-dependency analyses',
    timestamp: '2m ago',
  },
  {
    id: 'gps-003',
    type: 'ILS / Instrument Landing System Spoofing',
    severity: 'critical',
    description: 'Low-cost SDR transmitters spoof the ILS localizer and glideslope on final approach, inducing subtle lateral/vertical offsets that can steer an aircraft off the runway centerline in low-visibility conditions - demonstrated in a controlled study.',
    telemetry: 'ILS deviation vs. GNSS/RNP cross-check, signal-strength anomalies, off-centerline trend on approach',
    vector: 'RF spoofing of localizer/glideslope on 108-112 MHz / 329-335 MHz',
    systems: 'ILS localizer & glideslope, autoland, approach guidance',
    control: 'Multi-sensor approach monitoring (GNSS/RNP cross-check), signal anomaly detection',
    ref: 'Sathaye, Schepers, Ranganathan, Noubir - Wireless Attacks on ILS, USENIX Security 2019',
    timestamp: '40s ago',
  },
];

// ---------------------------------------------------------------------------
// 6. Web / Mobile / API surface
// ---------------------------------------------------------------------------
const WEBAPI: UseCase[] = [
  {
    id: 'web-001',
    type: 'Magecart Payment-Page Skimming',
    severity: 'critical',
    description: 'Malicious JavaScript injected into the booking/payment flow via a compromised third-party script or tag manager silently exfiltrates card and passenger data - the technique behind the British Airways 2018 breach and its landmark regulatory fine.',
    telemetry: 'CSP violation reports, outbound beacons to unknown hosts, script-integrity (SRI) failures, new third-party tags',
    vector: 'Supply-chain JS injection into checkout',
    systems: 'Booking engine, payment page, tag manager, third-party scripts',
    control: 'Strict CSP + SRI, script allow-listing, client-side integrity monitoring',
    ref: 'British Airways Magecart breach, 2018 (ICO fine)',
    timestamp: '14s ago',
  },
  {
    id: 'web-002',
    type: 'Mobile App API BOLA / IDOR (PNR & Loyalty Exposure)',
    severity: 'critical',
    description: 'Broken Object-Level Authorization in the airline mobile/web API: incrementing a booking or member ID returns another traveler\'s PNR, documents, and loyalty balance - the #1 OWASP API risk and a recurring airline bug-bounty finding.',
    telemetry: 'Sequential object-ID access per token, cross-account read ratio, 403-then-200 probing patterns',
    vector: 'Missing object-level authZ on REST/GraphQL endpoints',
    systems: 'Mobile/Web API gateway, booking & loyalty services',
    control: 'Per-object authorization checks, non-enumerable IDs, API abuse detection',
    ref: 'OWASP API Security Top 10 (API1: BOLA)',
    timestamp: '38s ago',
  },
  {
    id: 'web-003',
    type: 'OAuth / Session Token Theft on Loyalty Portal',
    severity: 'high',
    description: 'Stolen or replayed session/refresh tokens (via XSS, open redirect, or leaked mobile logs) grant persistent access to member accounts and stored payment instruments without tripping password-based alerts.',
    telemetry: 'Token reuse across geos/devices, refresh-token replay, redirect-URI mismatches, XSS payload hits',
    vector: 'XSS / open redirect / token leakage -> session hijack',
    systems: 'Identity provider, loyalty portal, mobile app',
    control: 'Short-lived tokens, sender-constrained tokens, redirect allow-list, XSS hardening',
    ref: 'OWASP API Security Top 10 (API2)',
    timestamp: '2m ago',
  },
  {
    id: 'web-004',
    type: 'Automated Fare/Seat Scraping & Inventory Denial',
    severity: 'medium',
    description: 'High-volume bots scrape fares and hold seats without purchasing, distorting revenue management, denying inventory to real customers, and inflating GDS look-to-book fees.',
    telemetry: 'Look-to-book ratio, headless-browser fingerprints, seat-hold-without-purchase spikes',
    vector: 'Scraper/hold bots against booking API',
    systems: 'Internet booking engine, inventory, revenue management',
    control: 'Bot management, proof-of-work/CAPTCHA on holds, hold-expiry tuning',
    ref: 'Airline bot-abuse pattern',
    timestamp: '6m ago',
  },
];

// ---------------------------------------------------------------------------
// 7. Real-world campaigns & incidents (named, public)
// ---------------------------------------------------------------------------
interface Incident {
  id: string;
  name: string;
  year: string;
  actor: string;
  technique: string;
  impact: string;
  scale: string;
  severity: Sev;
}

const INCIDENTS: Incident[] = [
  {
    id: 'inc-001',
    name: 'Qantas customer-data breach',
    year: '2025',
    actor: 'Scattered Spider / ShinyHunters (via third-party platform)',
    technique: 'Vishing of a call-center vendor to reach a cloud CRM, then bulk data export',
    impact: 'Personal data of ~6 million customers exposed; later tied to a broader extortion campaign',
    scale: '~6M records',
    severity: 'critical',
  },
  {
    id: 'inc-002',
    name: 'Aeroflot systems destruction',
    year: '2025',
    actor: 'Silent Crow + Belarusian Cyber-Partisans',
    technique: 'Long-term persistence culminating in destructive wiping of internal infrastructure',
    impact: 'Thousands of servers reportedly destroyed; dozens of flights cancelled amid a multi-day outage',
    scale: '~7,000 servers / 40+ flights',
    severity: 'critical',
  },
  {
    id: 'inc-003',
    name: 'Scattered Spider targets US airlines',
    year: '2025',
    actor: 'Scattered Spider (UNC3944)',
    technique: 'Social-engineering of IT help desks + MFA-fatigue to seize privileged access',
    impact: 'FBI/industry warning; disruption at multiple carriers including Hawaiian and WestJet',
    scale: 'Sector-wide campaign',
    severity: 'critical',
  },
  {
    id: 'inc-004',
    name: 'British Airways payment skimming',
    year: '2018',
    actor: 'Magecart',
    technique: 'Malicious JavaScript on the booking/payment site (web skimming)',
    impact: 'Payment and personal data of ~400,000+ customers stolen; £20M ICO fine',
    scale: '~400K cards',
    severity: 'critical',
  },
  {
    id: 'inc-005',
    name: 'Cathay Pacific data breach',
    year: '2018',
    actor: 'Undisclosed / prolonged intrusion',
    technique: 'Sustained unauthorized access to passenger databases',
    impact: 'Data of 9.4M passengers exposed; £500K UK regulatory penalty',
    scale: '9.4M passengers',
    severity: 'high',
  },
  {
    id: 'inc-006',
    name: 'SITA passenger-service breach',
    year: '2021',
    actor: 'Supply-chain intrusion (shared PSS provider)',
    technique: 'Compromise of a shared passenger-service platform',
    impact: 'Frequent-flyer/PNR data exposed across Star Alliance & oneworld members (incl. Air India ~4.5M)',
    scale: 'Multi-carrier / millions',
    severity: 'critical',
  },
  {
    id: 'inc-007',
    name: 'EasyJet customer breach',
    year: '2020',
    actor: 'Undisclosed',
    technique: 'Unauthorized access to customer records',
    impact: '9M customers affected; 2,208 payment-card details accessed',
    scale: '9M customers',
    severity: 'high',
  },
  {
    id: 'inc-008',
    name: 'Bangkok Airways ransomware',
    year: '2021',
    actor: 'LockBit',
    technique: 'Ransomware with data theft & leak-site extortion',
    impact: 'Over 200GB of data exfiltrated, including passenger PII and travel documents',
    scale: '200GB+ exfiltrated',
    severity: 'high',
  },
];

const sevDot = (s: string) =>
  s === 'critical' ? 'bg-red-400' : s === 'high' ? 'bg-orange-400' : s === 'medium' ? 'bg-amber-400' : 'bg-emerald-400';

// ---------------------------------------------------------------------------
// Research library (citations)
// ---------------------------------------------------------------------------
const RESEARCH: Research[] = [
  {
    id: 'r1',
    title: 'Aircraft Hacking: Practical Aero Series (PlaneSploit)',
    authors: 'Hugo Teso',
    venue: 'HITB Amsterdam 2013',
    takeaway: 'Demonstrated ACARS as an unauthenticated attack channel to influence FMS behaviour in a research/simulation setup - the seminal airline-datalink talk.',
    maps: 'ACARS uplink spoofing, FMS integrity',
  },
  {
    id: 'r2',
    title: 'SATCOM Terminals: Hacking by Air, Sea, and Land / Last Call for SATCOM Security',
    authors: 'Ruben Santamarta (IOActive)',
    venue: 'Black Hat USA 2014 & 2018',
    takeaway: 'Backdoors, hardcoded creds and firmware flaws across aviation/maritime SATCOM terminals; showed a path from passenger Wi-Fi/IFE toward SATCOM management.',
    maps: 'Airborne SATCOM compromise, IFEC domain crossing',
  },
  {
    id: 'r3',
    title: 'In-Flight Entertainment System / "In Flight Hacking System"',
    authors: 'IOActive; Chris Roberts (2015 FBI affidavit)',
    venue: 'IOActive advisory 2016; FBI case 2015',
    takeaway: 'IFEC vulnerabilities and the contested claim of pivoting from a seat electronic box toward aircraft systems - the case that put cabin/avionics segmentation on the map.',
    maps: 'IFEC-to-avionics domain crossing',
  },
  {
    id: 'r4',
    title: 'Where in the World Is Carmen Sandiego? Becoming a Secret Travel Agent',
    authors: 'Karsten Nohl & Nemanja Nikodijevic (SRLabs)',
    venue: '33C3 / 2016',
    takeaway: 'Legacy GDS (Amadeus/Sabre/Travelport) protect PNRs with weak or no authentication, enabling enumeration, data theft and itinerary manipulation.',
    maps: 'GDS/PNR takeover, boarding-pass abuse',
  },
  {
    id: 'r5',
    title: 'Ghost in the Air(Traffic): On the Insecurity of ADS-B',
    authors: 'Andrei Costin & Aurelien Francillon',
    venue: 'Black Hat USA 2012',
    takeaway: 'Foundational analysis of ADS-B spoofing/injection feasibility with low-cost SDR - underpins the ghost-aircraft threat model.',
    maps: 'ADS-B spoofing (see Aviation & Maritime view)',
  },
  {
    id: 'r6',
    title: 'Analyzing Privacy Breaches in ACARS',
    authors: 'Strohmeier, Smith, Lenders, Martinovic',
    venue: 'Academic (2017)',
    takeaway: 'Large-scale study showing clear-text ACARS leaks PII, medical, maintenance and booking data captured passively.',
    maps: 'ACARS exfiltration & privacy',
  },
  {
    id: 'r7',
    title: 'Aviation cyber research: EFB, in-flight Wi-Fi, avionics buses & the floppy-disk NavDB',
    authors: 'Pen Test Partners (Ken Munro / Alex Lomas et al.)',
    venue: 'DEF CON / industry, 2018-2022',
    takeaway: 'Practical work on EFB tampering, aircraft network segmentation, ARINC bus exposure and legacy dataload paths (e.g., 747 NavDB via 3.5" floppy).',
    maps: 'EFB manipulation, ARINC 429/615A, LSAP',
  },
  {
    id: 'r8',
    title: 'DEF CON Aerospace Village & Hack-A-Sat',
    authors: 'Aerospace Village community',
    venue: 'DEF CON 2019-present',
    takeaway: 'Ongoing hands-on aviation/space security research, CTFs and live avionics testbeds normalizing responsible aviation security testing.',
    maps: 'Cross-cutting airline attack surface',
  },
  {
    id: 'r9',
    title: 'GPS Spoofing of Commercial Airliners',
    authors: 'OPSGROUP and industry safety reporting',
    venue: '2023-2024',
    takeaway: 'Documented widespread GNSS spoofing near conflict zones corrupting aircraft IRS/clocks and forcing diversions - the most current large-scale airline threat.',
    maps: 'GNSS spoofing, timing attacks',
  },
  {
    id: 'r10',
    title: 'Wireless Attacks on Aircraft Instrument Landing Systems',
    authors: 'Harshad Sathaye, Domien Schepers, Aanjhan Ranganathan, Guevara Noubir (Northeastern)',
    venue: 'USENIX Security 2019',
    takeaway: 'Showed practical SDR spoofing of ILS localizer/glideslope that can steer an aircraft off centerline on approach, with countermeasure discussion.',
    maps: 'ILS / NAVAID spoofing',
  },
  {
    id: 'r11',
    title: 'Arm IDA and Cross Check: Reversing the Boeing 787 Core Network',
    authors: 'Ruben Santamarta (IOActive)',
    venue: 'Black Hat USA 2019',
    takeaway: 'Reverse-engineered 787 CIS/MS firmware and argued for potential cross-domain reachability toward the Common Data Network - a landmark e-enabled-aircraft study.',
    maps: 'Connected fleet, domain segmentation',
  },
  {
    id: 'r12',
    title: 'Scattered Spider (UNC3944) targeting of the airline sector',
    authors: 'FBI / Mandiant / CrowdStrike advisories',
    venue: '2025',
    takeaway: 'Documented help-desk social engineering and MFA-fatigue to obtain privileged access at airlines and their vendors, driving several 2025 incidents.',
    maps: 'Identity abuse, help-desk vishing, incidents tab',
  },
  {
    id: 'r13',
    title: 'OWASP API Security Top 10',
    authors: 'OWASP',
    venue: '2023',
    takeaway: 'Codifies BOLA/IDOR, broken authentication and other API risks that recur in airline mobile/web booking and loyalty APIs.',
    maps: 'Web/Mobile/API surface',
  },
  {
    id: 'r14',
    title: 'On the Security of ADS-B and Wireless Air-Traffic Communication',
    authors: 'Martin Strohmeier, Vincent Lenders, Ivan Martinovic et al. (OpenSky)',
    venue: 'IEEE / academic (2014-2020)',
    takeaway: 'Body of work quantifying spoofing/jamming feasibility and perception-vs-reality of air-traffic communication security using real-world data.',
    maps: 'ADS-B, datalink threat modeling',
  },
];

const METRICS = [
  { label: 'ACARS Anomalies / hr', value: '2,914', trend: '+22%', bad: true },
  { label: 'GNSS Spoof Corridors', value: '11', trend: '+4', bad: true },
  { label: 'PNR Enum Attempts', value: '48K', trend: '+61%', bad: true },
  { label: 'Loyalty ATO / day', value: '176', trend: '+12%', bad: true },
  { label: 'Fleet Dataloads Verified', value: '99.2%', trend: '+0.3%', bad: false },
  { label: 'IT/OT Segmentation', value: '71%', trend: '+5%', bad: false },
];

const sevColor = (s: string) => {
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
};

type TabId = 'connected' | 'datalink' | 'enterprise' | 'webapi' | 'ground' | 'gnss' | 'incidents' | 'research';

const DATA: Record<'connected' | 'datalink' | 'enterprise' | 'webapi' | 'ground' | 'gnss', UseCase[]> = {
  connected: CONNECTED,
  datalink: DATALINK,
  enterprise: ENTERPRISE,
  webapi: WEBAPI,
  ground: GROUND,
  gnss: GNSS,
};

function UseCaseCard({ e }: { e: UseCase }) {
  return (
    <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(e.severity)}`}>{e.severity.toUpperCase()}</span>
            <span className="text-sm font-semibold text-white">{e.type}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{e.description}</p>

          <div className="grid md:grid-cols-2 gap-2 mt-3">
            <div className="bg-[#0A1628] border border-[#1e293b] rounded-lg p-2">
              <div className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono mb-0.5"><Activity size={10} />TELEMETRY</div>
              <div className="text-[10px] text-slate-400 leading-relaxed">{e.telemetry}</div>
            </div>
            <div className="bg-[#0A1628] border border-[#1e293b] rounded-lg p-2">
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono mb-0.5"><Shield size={10} />CONTROL</div>
              <div className="text-[10px] text-slate-400 leading-relaxed">{e.control}</div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><Zap size={10} className="text-red-400" />{e.vector}</span>
            <span className="flex items-center gap-1"><HardDrive size={10} />{e.systems}</span>
            <span className="flex items-center gap-1"><Clock size={10} />{e.timestamp}</span>
            {e.ref && <span className="flex items-center gap-1 text-cyan-500/80"><BookOpen size={10} />{e.ref}</span>}
          </div>
        </div>
        <button className="px-3 py-1.5 text-[10px] rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors font-semibold whitespace-nowrap">
          Investigate
        </button>
      </div>
    </div>
  );
}

export default function AirlineThreats() {
  const [tab, setTab] = useState<TabId>('connected');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated aircraft attack-surface data-bus diagram
  useEffect(() => {
    if (tab !== 'connected') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = (canvas.width = canvas.parentElement!.clientWidth);
    const H = (canvas.height = 220);
    let frame = 0;
    let raf = 0;

    const domains = [
      { x: W * 0.16, y: H * 0.5, label: 'ACD', sub: 'Aircraft Control', color: '#10B981' },
      { x: W * 0.42, y: H * 0.3, label: 'AISD', sub: 'Info Services', color: '#38BDF8' },
      { x: W * 0.42, y: H * 0.72, label: 'MRO/AHM', sub: 'Health Monitor', color: '#F59E0B' },
      { x: W * 0.7, y: H * 0.5, label: 'PIESD', sub: 'IFE / Cabin', color: '#F97316' },
      { x: W * 0.9, y: H * 0.5, label: 'PODD', sub: 'Passenger Wi-Fi', color: '#EF4444' },
    ];
    const links: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4]];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // links + flowing packets (attacker attempts flow right->left)
      links.forEach(([a, b], i) => {
        const A = domains[a], B = domains[b];
        ctx.strokeStyle = 'rgba(56,189,248,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        const p = ((frame * 0.006) + i * 0.2) % 1;
        // packet travelling from B (outer) toward A (inner) = intrusion direction
        const px = B.x + (A.x - B.x) * p;
        const py = B.y + (A.y - B.y) * p;
        const danger = a === 0; // crossing into ACD
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = danger ? '#EF4444' : '#38BDF8'; ctx.fill();
      });
      // one-way diode marker between AISD and ACD
      const A = domains[0], B = domains[1];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      ctx.fillStyle = 'rgba(16,185,129,0.9)';
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('DATA DIODE', mx, my - 8);
      // nodes
      domains.forEach((d) => {
        const pulse = 1 + Math.sin(frame * 0.05) * 0.06;
        ctx.beginPath(); ctx.arc(d.x, d.y, 18 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,22,40,0.95)'; ctx.fill();
        ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = d.color; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText(d.label, d.x, d.y + 2);
        ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '7px monospace';
        ctx.fillText(d.sub, d.x, d.y + 30);
      });
      frame++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  const TABS: { id: TabId; label: string; icon: typeof Plane }[] = [
    { id: 'connected', label: 'Connected Fleet', icon: Cpu },
    { id: 'datalink', label: 'ACARS / SATCOM', icon: Radio },
    { id: 'enterprise', label: 'Booking / Loyalty', icon: Ticket },
    { id: 'webapi', label: 'Web / Mobile / API', icon: Globe },
    { id: 'ground', label: 'Airport / Ground IoT', icon: Boxes },
    { id: 'gnss', label: 'GNSS / Nav Spoof', icon: Target },
    { id: 'incidents', label: 'Campaigns & Incidents', icon: Skull },
    { id: 'research', label: 'Research Library', icon: BookOpen },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Plane size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Airline Threat Intelligence</h2>
            <p className="text-xs text-slate-500">Connected fleet, datalink, booking, loyalty & ground-ops attack surface</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">ELEVATED</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
            0xDSI AVIATION
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {METRICS.map((m, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{m.label}</div>
            <div className={`text-lg font-bold ${m.bad ? 'text-red-400' : 'text-emerald-400'}`}>{m.value}</div>
            <div className={`text-[10px] ${m.bad ? 'text-red-400' : 'text-emerald-400'}`}>{m.trend}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e293b] overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${tab === t.id ? 'text-cyan-300 border-cyan-400 bg-cyan-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Connected fleet: diagram + cards */}
      {tab === 'connected' && (
        <div className="space-y-4">
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={14} className="text-cyan-400" />
              <span className="text-xs font-semibold text-white">e-Enabled Aircraft Domain Map - Intrusion Direction (right to left)</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-400 border border-emerald-500/20">
                <Lock size={10} />Diode-enforced ACD
              </span>
            </div>
            <canvas ref={canvasRef} className="w-full" style={{ height: 220 }} />
          </div>
          {DATA.connected.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {tab === 'datalink' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><Radio size={14} className="text-cyan-400" /><span className="text-xs text-cyan-400 font-mono font-bold">DATALINK / SATCOM THREAT FEED</span></div>
          {DATA.datalink.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {tab === 'enterprise' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><Users size={14} className="text-cyan-400" /><span className="text-xs text-cyan-400 font-mono font-bold">PASSENGER / BOOKING / LOYALTY THREATS</span></div>
          {DATA.enterprise.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {tab === 'webapi' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><Globe size={14} className="text-cyan-400" /><span className="text-xs text-cyan-400 font-mono font-bold">WEB / MOBILE / API THREATS</span></div>
          {DATA.webapi.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {tab === 'ground' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Baggage SCADA', icon: Luggage },
              { label: 'Fuel Systems', icon: Fuel },
              { label: 'GSE Telematics', icon: Gauge },
              { label: 'Gatelink Wi-Fi', icon: Wifi },
            ].map((s, i) => { const I = s.icon; return (
              <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 flex items-center gap-2">
                <I size={14} className="text-cyan-400" /><span className="text-[11px] text-slate-300">{s.label}</span>
              </div>
            ); })}
          </div>
          {DATA.ground.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {tab === 'gnss' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><Target size={14} className="text-red-400" /><span className="text-xs text-red-400 font-mono font-bold">GNSS SPOOFING / TIMING THREATS</span></div>
          {DATA.gnss.map((e) => <UseCaseCard key={e.id} e={e} />)}
        </div>
      )}

      {/* Campaigns & incidents */}
      {tab === 'incidents' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2"><Skull size={14} className="text-red-400" /><span className="text-xs text-red-400 font-mono font-bold">REAL-WORLD AIRLINE CAMPAIGNS & BREACHES</span></div>
          <p className="text-[11px] text-slate-500 leading-relaxed">Public, attributed incidents affecting airlines and their supply chain - from web skimming and data theft to destructive intrusions and 2025 identity-driven campaigns. Use them to pressure-test detections and tabletop exercises.</p>
          {INCIDENTS.map((inc) => (
            <div key={inc.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full ${sevDot(inc.severity)}`} />
                  <span className="text-sm font-semibold text-white">{inc.name}</span>
                  <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-slate-500/10 text-slate-300 border border-slate-500/20"><Calendar size={10} />{inc.year}</span>
                </div>
                <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(inc.severity)} whitespace-nowrap`}>{inc.scale}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[11px] text-red-300/90"><Skull size={11} />{inc.actor}</div>
              <div className="grid md:grid-cols-2 gap-2 mt-2">
                <div className="bg-[#0A1628] border border-[#1e293b] rounded-lg p-2">
                  <div className="flex items-center gap-1 text-[10px] text-orange-400 font-mono mb-0.5"><Zap size={10} />TECHNIQUE</div>
                  <div className="text-[10px] text-slate-400 leading-relaxed">{inc.technique}</div>
                </div>
                <div className="bg-[#0A1628] border border-[#1e293b] rounded-lg p-2">
                  <div className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono mb-0.5"><AlertTriangle size={10} />IMPACT</div>
                  <div className="text-[10px] text-slate-400 leading-relaxed">{inc.impact}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Research library */}
      {tab === 'research' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2"><BookOpen size={14} className="text-cyan-400" /><span className="text-xs text-cyan-400 font-mono font-bold">RESEARCH & ATTACK-VECTOR LIBRARY</span></div>
          <p className="text-[11px] text-slate-500 leading-relaxed">Each airline use case above is modeled on published aviation-security research from DEF CON, Black Hat, HITB, academic venues and safety reporting. Scenarios are illustrative threat models for detection engineering - not operational instructions.</p>
          {RESEARCH.map((r) => (
            <div key={r.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ScanLine size={14} className="text-cyan-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">{r.title}</span>
                </div>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 whitespace-nowrap">{r.venue}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{r.authors}</div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{r.takeaway}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
                <ChevronRight size={10} className="text-cyan-400" />Maps to: <span className="text-cyan-400">{r.maps}</span>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              Defensive framing only. These entries describe telemetry to collect and controls to enforce so a SOC can detect the referenced techniques. They are not step-by-step exploitation guidance.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
