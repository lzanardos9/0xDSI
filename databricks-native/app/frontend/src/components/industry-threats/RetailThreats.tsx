import { useState, useEffect } from 'react';
import {
  ShoppingCart, CreditCard, AlertTriangle, Shield, Package, Users, Lock,
  Wifi, Server, Eye, Clock, Zap, Globe, Database, Truck, BarChart3, Bug
} from 'lucide-react';

interface POSThreat {
  id: string;
  name: string;
  vector: string;
  targetSystem: string;
  technique: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  cardsCompromised: number;
  region: string;
  malwareFamily: string;
  status: 'active' | 'contained' | 'monitoring';
  ioc: string;
}

interface ECommerceFraud {
  id: string;
  type: string;
  method: string;
  platform: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  accountsAffected: number;
  estimatedLoss: string;
  detectionSource: string;
  timestamp: string;
  status: 'blocked' | 'investigating' | 'escalated';
}

interface SupplyChainThreat {
  id: string;
  target: string;
  attackType: string;
  vendor: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  systemsAffected: number;
  entryVector: string;
  businessImpact: string;
  status: 'active' | 'mitigated' | 'investigating';
  cve: string;
}

const POS_THREATS: POSThreat[] = [
  {
    id: 'pos-001', name: 'TreasureHunter v3.2 RAM Scraper', vector: 'RAM Scraping', targetSystem: 'Verifone VX 520',
    technique: 'Track 1/2 memory dump via injected DLL hooking NtReadVirtualMemory in POS process. Exfiltrates PANs over DNS TXT queries to C2.',
    severity: 'critical', description: 'Active RAM scraping campaign targeting mag-stripe data in POS memory before P2PE encryption. Dumps full Track 2 including CVV1.',
    cardsCompromised: 34_720, region: 'US Southeast - 47 stores', malwareFamily: 'TreasureHunter/Jolly Roger',
    status: 'active', ioc: 'C2: dns-relay.shopcardz[.]net | SHA256: 8a3f...b291'
  },
  {
    id: 'pos-002', name: 'Magecart Group 12 Skimmer', vector: 'Digital Skimming', targetSystem: 'Custom checkout page',
    technique: 'JavaScript injection via compromised Google Tag Manager container. Intercepts payment form keystrokes and exfils via WebSocket to attacker domain.',
    severity: 'critical', description: 'Web skimmer injected into checkout flow via poisoned third-party analytics script. Captures card number, expiry, CVV2 on form submit.',
    cardsCompromised: 89_340, region: 'Global - all e-commerce domains', malwareFamily: 'Magecart/Inter',
    status: 'active', ioc: 'Domain: cdn-analytics-gts[.]com | Injected: gtm-loader.min.js'
  },
  {
    id: 'pos-003', name: 'NFC Relay MitM Attack', vector: 'NFC Relay', targetSystem: 'Ingenico Lane/3000',
    technique: 'Proxmark3-based NFC relay extending contactless range to 50m. Attacker proxies legitimate card tap from victim phone to rogue terminal.',
    severity: 'high', description: 'Relay attack intercepting Apple Pay / Google Wallet NFC transactions at self-checkout kiosks. Clones tokenized card-present auth in real time.',
    cardsCompromised: 2_180, region: 'London metro - 12 locations', malwareFamily: 'NFCGate/RelayBridge',
    status: 'monitoring', ioc: 'Device: Proxmark3 RDV4 w/ custom firmware | BLE bridge detected'
  },
  {
    id: 'pos-004', name: 'PINshark Overlay Capture', vector: 'PIN Capture', targetSystem: 'PAX A920 Pro',
    technique: 'Thin 3D-printed PIN pad overlay with embedded membrane keylogger and BLE transmitter. Harvests PIN + card data simultaneously.',
    severity: 'critical', description: 'Physical PIN pad overlay devices discovered on attended checkout lanes. Captures PIN entries via capacitive touch sensor overlay on EPP.',
    cardsCompromised: 5_670, region: 'US Midwest - 23 stores', malwareFamily: 'Physical/PINshark',
    status: 'contained', ioc: 'BLE beacon: "PAX_SERV_xx" | Overlay thickness: 1.2mm detectable by UV'
  },
  {
    id: 'pos-005', name: 'GhostPOS Card-Present Cloning', vector: 'Card-Present Fraud', targetSystem: 'VeriFone MX 925',
    technique: 'Deep-insert shimmer device between chip reader contacts captures EMV data during dip. Produces counterfeit mag-stripe cards from harvested iCVV.',
    severity: 'high', description: 'EMV shimming campaign producing cloned mag-stripe cards for regions without chip mandate. Exploits fallback transaction allowance at fuel pumps.',
    cardsCompromised: 11_450, region: 'US Gas stations - 89 pumps', malwareFamily: 'ShimmerKit/GhostPOS',
    status: 'investigating', ioc: 'Shimmer PCB: 0.1mm flex circuit w/ ATMEL MCU | Serial: GH-2026-xx'
  },
  {
    id: 'pos-006', name: 'FirmJack Terminal Rootkit', vector: 'Firmware Attack', targetSystem: 'Castles Saturn 1000',
    technique: 'Malicious firmware update pushed via compromised TMS (Terminal Management System). Rootkit persists below OS in bootloader, survives factory reset.',
    severity: 'critical', description: 'Supply-chain firmware compromise affecting terminal boot chain. Injects card harvesting code before secure boot validation occurs.',
    cardsCompromised: 67_200, region: 'APAC - 340 terminals', malwareFamily: 'FirmJack/BootSteal',
    status: 'active', ioc: 'TMS: update-srv.castles-sys[.]xyz | FW hash mismatch on bootloader v2.14'
  },
  {
    id: 'pos-007', name: 'PoSeidon Memory Injection', vector: 'RAM Scraping', targetSystem: 'NCR SelfServ Checkout',
    technique: 'Process hollowing of legitimate POS process (POSReady.exe). Keylogger + memory scanner running in hollowed process context evades EDR.',
    severity: 'high', description: 'Self-checkout terminal compromise using process injection to hide within trusted process space. Targets unencrypted card data in application memory.',
    cardsCompromised: 18_900, region: 'US Northeast - 31 stores', malwareFamily: 'PoSeidon/FindStr',
    status: 'contained', ioc: 'Process: POSReady.exe (hollowed) | C2: 185.220.xx.xx:443'
  },
];

const ECOMMERCE_FRAUDS: ECommerceFraud[] = [
  {
    id: 'ecf-001', type: 'Account Takeover', method: 'Credential Stuffing + SIM Swap',
    platform: 'Main E-Commerce Platform', severity: 'critical',
    description: 'Automated credential stuffing using 2.3M leaked combos from BreachForums. Successful logins followed by SIM swap to bypass SMS 2FA, then rapid order placement with stored payment methods.',
    accountsAffected: 12_847, estimatedLoss: '$2.1M', detectionSource: 'Velocity anomaly on login API',
    timestamp: '4m ago', status: 'blocked'
  },
  {
    id: 'ecf-002', type: 'Synthetic Identity Fraud', method: 'AI-Generated Personas',
    platform: 'Credit Application Portal', severity: 'critical',
    description: 'Ring of 340+ synthetic identities created with AI-generated faces, real SSN fragments (from minors/deceased), and burner phone numbers. Building credit history for 6+ months before bust-out.',
    accountsAffected: 347, estimatedLoss: '$4.7M', detectionSource: 'Graph analysis - shared device fingerprints',
    timestamp: '18m ago', status: 'investigating'
  },
  {
    id: 'ecf-003', type: 'Promo Abuse', method: 'Coupon Stacking Bot Network',
    platform: 'Loyalty & Promotions Engine', severity: 'high',
    description: 'Automated bot network creating throwaway accounts to exploit new-customer 40% discount, stacking with referral credits and loyalty points. Reselling discounted goods on secondary marketplaces.',
    accountsAffected: 8_920, estimatedLoss: '$890K', detectionSource: 'Anomalous coupon redemption rate spike',
    timestamp: '32m ago', status: 'blocked'
  },
  {
    id: 'ecf-004', type: 'Return Fraud', method: 'Wardrobing + Receipt Manipulation',
    platform: 'Returns & Refund System', severity: 'high',
    description: 'Organized return fraud ring using purchased receipt data to generate counterfeit return barcodes. Items returned are knockoff replacements while originals are resold. Receipt OCR data sourced from dark web.',
    accountsAffected: 1_230, estimatedLoss: '$1.3M', detectionSource: 'Weight mismatch on returned package scan',
    timestamp: '1h ago', status: 'escalated'
  },
  {
    id: 'ecf-005', type: 'Bot Scalping', method: 'Residential Proxy + ATC Bots',
    platform: 'Limited Release Drops', severity: 'medium',
    description: 'Scalper bot network using rotating residential proxies, CAPTCHA-solving services, and browser fingerprint randomization. Purchasing limited-edition inventory within 0.3s of drop for resale at 400% markup.',
    accountsAffected: 45_000, estimatedLoss: '$2.8M (brand damage)', detectionSource: 'Sub-second checkout completion pattern',
    timestamp: '2h ago', status: 'investigating'
  },
  {
    id: 'ecf-006', type: 'Credential Stuffing on Checkout', method: 'Distributed Low-Rate Attack',
    platform: 'Guest Checkout + Saved Payments', severity: 'critical',
    description: 'Low-and-slow credential validation against checkout API using stolen card BINs. Testing cards at 0.3 req/s per IP across 12K residential proxies. Valid cards sold on Telegram for card-not-present fraud.',
    accountsAffected: 67_000, estimatedLoss: '$560K', detectionSource: 'Abnormal decline rate on $1 auth attempts',
    timestamp: '15m ago', status: 'blocked'
  },
  {
    id: 'ecf-007', type: 'Loyalty Point Theft', method: 'API Exploitation',
    platform: 'Rewards Program API', severity: 'high',
    description: 'IDOR vulnerability in loyalty points transfer API allows unauthenticated transfer between accounts. Attacker draining points from dormant accounts and converting to gift cards via mobile app.',
    accountsAffected: 3_400, estimatedLoss: '$420K', detectionSource: 'Spike in points-to-gift-card conversions',
    timestamp: '45m ago', status: 'blocked'
  },
];

const SUPPLY_CHAIN_THREATS: SupplyChainThreat[] = [
  {
    id: 'sc-001', target: 'Vendor Self-Service Portal', attackType: 'Vendor Portal Compromise',
    vendor: 'SupplyLink Pro (3PL)', severity: 'critical',
    description: 'SQL injection in vendor onboarding portal grants access to 2,400 supplier records including bank routing numbers. Attacker modified ACH payment details for 18 vendors to redirect payments.',
    systemsAffected: 2_400, entryVector: 'SQLi in /api/vendor/register endpoint',
    businessImpact: '$3.2M in redirected vendor payments over 6 weeks', status: 'active',
    cve: 'CVE-2026-52341'
  },
  {
    id: 'sc-002', target: 'EDI X12 850 Purchase Orders', attackType: 'EDI Injection',
    vendor: 'AS2 Gateway (SPS Commerce)', severity: 'high',
    description: 'Malformed EDI 850 documents injected into AS2 channel exploiting parser vulnerability. Crafted ISA/GS envelope segments trigger buffer overflow in EDI translator, allowing arbitrary PO creation.',
    systemsAffected: 890, entryVector: 'Crafted ISA segment overflow in EDI translator v4.2',
    businessImpact: '$780K in fraudulent purchase orders auto-approved', status: 'mitigated',
    cve: 'CVE-2026-48872'
  },
  {
    id: 'sc-003', target: 'Manhattan WMS (Warehouse Mgmt)', attackType: 'WMS System Attack',
    vendor: 'Manhattan Associates WMi', severity: 'critical',
    description: 'RCE in warehouse management system REST API via deserialization of Java objects in inventory sync endpoint. Attacker manipulating pick/pack instructions to reroute high-value shipments.',
    systemsAffected: 12, entryVector: 'Java deserialization in /api/v2/inventory/sync',
    businessImpact: '$1.4M in diverted shipments to fraudulent addresses', status: 'investigating',
    cve: 'CVE-2026-51098'
  },
  {
    id: 'sc-004', target: 'FedEx / UPS Tracking Integration', attackType: 'Logistics Tracking Manipulation',
    vendor: 'ShipStation API', severity: 'high',
    description: 'Man-in-the-middle attack on tracking webhook callbacks. Attacker intercepting delivery confirmations and spoofing "delivered" status to trigger premature refund while intercepting package at depot.',
    systemsAffected: 34_000, entryVector: 'Webhook URL hijack via DNS poisoning of callback domain',
    businessImpact: '$560K in false delivery confirmations triggering refunds', status: 'mitigated',
    cve: 'CVE-2026-49234'
  },
  {
    id: 'sc-005', target: 'Cold Chain IoT Sensors', attackType: 'IoT Sensor Tampering',
    vendor: 'Sensitech TempTale', severity: 'medium',
    description: 'Bluetooth LE replay attack on cold chain monitoring sensors. Attacker replaying "in-range" temperature readings while actual temps exceed thresholds, masking spoiled perishable inventory.',
    systemsAffected: 450, entryVector: 'BLE GATT characteristic replay (no HMAC validation)',
    businessImpact: 'Product safety risk - contaminated perishables reaching shelves', status: 'investigating',
    cve: 'CVE-2026-50187'
  },
  {
    id: 'sc-006', target: 'SAP Ariba Procurement', attackType: 'Procurement Fraud',
    vendor: 'SAP Ariba Network', severity: 'critical',
    description: 'Compromised procurement admin account used to create shell vendor entities and approve invoices against fictitious POs. Three-way match bypass via manipulated goods receipt records.',
    systemsAffected: 1, entryVector: 'Stolen admin credentials from phishing + no MFA on Ariba',
    businessImpact: '$2.8M in fraudulent invoices paid to shell companies', status: 'active',
    cve: 'N/A - credential theft'
  },
];

export default function RetailThreats() {
  const [tab, setTab] = useState<'pos' | 'ecommerce' | 'supply' | 'pci'>('pos');
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPulsePhase(p => p + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  const TABS = [
    { id: 'pos' as const, label: 'POS Malware', icon: CreditCard },
    { id: 'ecommerce' as const, label: 'E-Commerce Fraud', icon: Globe },
    { id: 'supply' as const, label: 'Supply Chain', icon: Truck },
    { id: 'pci' as const, label: 'PCI DSS Status', icon: Shield },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 flex items-center justify-center">
            <ShoppingCart size={20} className="text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Retail & E-Commerce Threat Intelligence</h2>
            <p className="text-xs text-slate-500">POS security, fraud detection, supply chain monitoring, PCI compliance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30">
            <Zap size={12} className="text-teal-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-teal-400 tracking-wider">LIVE</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono font-bold text-emerald-400 tracking-wider">0xDSI RETAIL</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { l: 'Transactions Blocked', v: '142,830', c: 'text-teal-400', bg: 'from-teal-500/5 to-teal-500/0' },
          { l: 'Fraud Prevented', v: '$12.7M', c: 'text-emerald-400', bg: 'from-emerald-500/5 to-emerald-500/0' },
          { l: 'POS Alerts', v: '89', c: 'text-amber-400', bg: 'from-amber-500/5 to-amber-500/0' },
          { l: 'Cards Compromised', v: '229,460', c: 'text-red-400', bg: 'from-red-500/5 to-red-500/0' },
          { l: 'Skimmers Detected', v: '14', c: 'text-orange-400', bg: 'from-orange-500/5 to-orange-500/0' },
          { l: 'PCI Score', v: '76%', c: 'text-cyan-400', bg: 'from-cyan-500/5 to-cyan-500/0' },
        ].map((s, i) => (
          <div key={i} className={`bg-gradient-to-b ${s.bg} border border-[#1e293b] rounded-xl p-3 text-center`}>
            <div className="text-[10px] text-slate-500">{s.l}</div>
            <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-teal-300 border-teal-400 bg-teal-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* POS Malware Tab */}
      {tab === 'pos' && (
        <div className="space-y-3">
          {POS_THREATS.map(d => (
            <div key={d.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${d.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <CreditCard size={14} className="text-teal-400" />
                    <span className="text-sm font-bold text-white">{d.name}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">{d.vector}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${d.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : d.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{d.severity}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">{d.targetSystem} -- {d.region}</div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-1">{d.description}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-mono">{d.technique}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] flex-wrap">
                    <span className="text-red-400 font-semibold">{d.cardsCompromised.toLocaleString()} cards compromised</span>
                    <span className="text-slate-500 font-mono">{d.malwareFamily}</span>
                    <span className="text-cyan-400 font-mono text-[9px]">{d.ioc}</span>
                    <span className={`px-2 py-0.5 rounded border ${d.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20' : d.status === 'contained' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{d.status}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* E-Commerce Fraud Tab */}
      {tab === 'ecommerce' && (
        <div className="space-y-3">
          {ECOMMERCE_FRAUDS.map(f => (
            <div key={f.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-emerald-400" />
                  <span className="text-sm font-bold text-white">{f.type}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${f.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : f.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{f.severity}</span>
                  <span className="text-[10px] text-slate-600">{f.timestamp}</span>
                </div>
                <span className={`px-2 py-0.5 text-[10px] rounded border ${f.status === 'blocked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : f.status === 'escalated' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{f.status}</span>
              </div>
              <div className="text-[10px] text-teal-400 font-mono mb-1.5">{f.method}</div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">{f.description}</p>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div><span className="text-slate-500">Platform:</span> <span className="text-slate-300">{f.platform}</span></div>
                <div><span className="text-slate-500">Accounts:</span> <span className="text-red-400 font-bold">{f.accountsAffected.toLocaleString()}</span></div>
                <div><span className="text-slate-500">Est. Loss:</span> <span className="text-amber-400 font-bold">{f.estimatedLoss}</span></div>
                <div><span className="text-slate-500">Detection:</span> <span className="text-cyan-400">{f.detectionSource}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supply Chain Tab */}
      {tab === 'supply' && (
        <div className="space-y-4">
          {SUPPLY_CHAIN_THREATS.map(s => (
            <div key={s.id} className={`bg-[#0b0f1e] border rounded-xl p-5 ${s.status === 'active' ? 'border-red-500/40' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Truck size={14} className="text-teal-400" />
                    <h4 className="text-sm font-bold text-white">{s.target}</h4>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">{s.attackType}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{s.vendor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${s.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : s.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{s.severity}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded border ${s.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20' : s.status === 'mitigated' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{s.status}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{s.description}</p>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
                <div><span className="text-slate-500">Entry Vector:</span> <span className="text-amber-400 font-mono">{s.entryVector}</span></div>
                <div><span className="text-slate-500">Systems:</span> <span className="text-slate-300">{s.systemsAffected.toLocaleString()} affected</span></div>
                <div><span className="text-slate-500">CVE:</span> <span className="text-cyan-400 font-mono">{s.cve}</span></div>
              </div>
              <div className="px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                <span className="text-[10px] text-red-400 font-semibold">BUSINESS IMPACT: </span>
                <span className="text-[10px] text-red-300">{s.businessImpact}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PCI DSS Status Tab */}
      {tab === 'pci' && (
        <div className="space-y-4">
          {/* CDE Assessment Header */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-teal-400" />
                <h4 className="text-sm font-bold text-white">Cardholder Data Environment Assessment</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Last QSA Audit: 2026-03-15</span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">REMEDIATION REQUIRED</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { l: 'CDE Scope', v: '347 systems', c: 'text-teal-400' },
                { l: 'In Compliance', v: '264', c: 'text-emerald-400' },
                { l: 'Non-Compliant', v: '83', c: 'text-red-400' },
                { l: 'Overall Score', v: '76.1%', c: 'text-amber-400' },
              ].map((s, i) => (
                <div key={i} className="bg-[#0A1628] rounded-lg p-3 border border-[#1e293b]">
                  <div className="text-[10px] text-slate-500">{s.l}</div>
                  <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PCI DSS Requirements */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                req: 'Req 1: Network Security Controls',
                score: 82, findings: 12, critical: 2, color: 'text-amber-400',
                controls: ['Firewall rules for CDE segmentation', 'DMZ configuration for public-facing apps', 'Wireless network isolation', 'Network flow documentation']
              },
              {
                req: 'Req 3: Protect Stored Account Data',
                score: 68, findings: 21, critical: 5, color: 'text-red-400',
                controls: ['PAN masking in displays', 'Encryption key management', 'Cryptographic key rotation', 'Secure deletion of expired data']
              },
              {
                req: 'Req 6: Secure Systems & Software',
                score: 74, findings: 18, critical: 4, color: 'text-orange-400',
                controls: ['Custom code vulnerability scanning', 'WAF for public-facing web apps', 'Change management procedures', 'Patch management SLA compliance']
              },
              {
                req: 'Req 8: Identify Users & Auth',
                score: 91, findings: 5, critical: 0, color: 'text-emerald-400',
                controls: ['MFA for CDE access', 'Password complexity enforcement', 'Session timeout controls', 'Shared account elimination']
              },
              {
                req: 'Req 10: Log & Monitor All Access',
                score: 79, findings: 14, critical: 3, color: 'text-amber-400',
                controls: ['Audit trail for CHD access', 'Tamper-proof log storage', 'Daily log review process', 'Automated alerting on anomalies']
              },
              {
                req: 'Req 11: Test Security Regularly',
                score: 63, findings: 27, critical: 7, color: 'text-red-400',
                controls: ['Quarterly ASV scans', 'Annual penetration testing', 'IDS/IPS signature updates', 'File integrity monitoring']
              },
            ].map((f, i) => (
              <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">{f.req}</h4>
                  <div className={`text-2xl font-bold ${f.color}`}>{f.score}%</div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${f.score >= 80 ? 'bg-emerald-500' : f.score >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${f.score}%` }} />
                </div>
                <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-3">
                  <span>{f.findings} findings</span>
                  <span className={f.critical > 0 ? 'text-red-400' : 'text-emerald-400'}>{f.critical} critical</span>
                </div>
                <div className="space-y-1.5">
                  {f.controls.map((c, j) => {
                    const val = f.score + (j * 11 - 15) % 25;
                    return (
                      <div key={j} className="flex items-center gap-2 text-[10px]">
                        <span className="w-44 text-slate-400 truncate">{c}</span>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${val >= 80 ? 'bg-emerald-500' : val >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(30, val))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
