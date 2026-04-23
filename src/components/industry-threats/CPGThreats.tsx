import { useState, useEffect } from 'react';
import {
  Package, Truck, BarChart3, AlertTriangle, Shield, Activity, Lock,
  Wifi, Eye, Clock, Zap, Database, Users, Globe, Target, Thermometer,
  ShoppingCart, FileText, Server
} from 'lucide-react';

interface SupplyChainAttack {
  id: string;
  target: string;
  brand: string;
  vector: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  impact: string;
  status: 'active' | 'contained' | 'investigating';
  region: string;
  timestamp: string;
  lossEstimate: string;
}

interface CounterfeitAlert {
  id: string;
  product: string;
  sku: string;
  platform: string;
  quantity: number;
  detectionMethod: string;
  origin: string;
  severity: 'critical' | 'high' | 'medium';
  healthRisk: string;
  status: 'takedown-sent' | 'monitoring' | 'seized' | 'active';
  timestamp: string;
}

interface FormulaTheft {
  id: string;
  category: string;
  assetType: string;
  threatActor: string;
  technique: string;
  exfilSize: string;
  valuationAtRisk: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  status: 'blocked' | 'investigating' | 'escalated';
  mitre: string;
}

interface ICSEvent {
  id: string;
  facility: string;
  system: string;
  protocol: string;
  type: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  productLine: string;
  contaminationRisk: boolean;
  status: 'active' | 'contained' | 'resolved';
  timestamp: string;
}

const SUPPLY_CHAIN_ATTACKS: SupplyChainAttack[] = [
  { id: 'sc-001', target: 'SAP S/4HANA - Demand Planning Module', brand: 'Global Beverage Corp', vector: 'Compromised EDI 856 ASN Feed', severity: 'critical', description: 'Adversary injected falsified Advanced Shipping Notices via compromised 3PL EDI gateway, triggering phantom inventory receipts across 14 distribution centers. MRP auto-generated $23M in duplicate procurement orders before detection.', impact: 'Supply chain disruption across North America', status: 'active', region: 'NA - East Coast', timestamp: '4m ago', lossEstimate: '$23.4M' },
  { id: 'sc-002', target: 'Cold Chain IoT Monitoring Platform', brand: 'FreshLife Dairy', vector: 'MQTT Broker Compromise', severity: 'critical', description: 'Temperature sensor telemetry spoofed via compromised MQTT broker. 847 refrigerated containers reported valid temps while actually exceeding safe thresholds. 12,000 pallets of dairy products potentially contaminated.', impact: 'Product recall risk - 12K pallets', status: 'investigating', region: 'EU - Western Europe', timestamp: '18m ago', lossEstimate: '$8.7M' },
  { id: 'sc-003', target: 'Warehouse Management System (Manhattan WMS)', brand: 'CleanHome Products', vector: 'API Key Theft + Inventory Manipulation', severity: 'high', description: 'Stolen WMS API credentials used to modify pick-and-pack instructions, redirecting 340 pallets of premium detergent to unauthorized freight forwarder. GS1 barcode validation bypassed via label reprinting.', impact: 'Product diversion - gray market', status: 'contained', region: 'APAC - Southeast Asia', timestamp: '1h ago', lossEstimate: '$4.2M' },
  { id: 'sc-004', target: 'Blockchain Traceability Platform', brand: 'OrganicFirst Foods', vector: 'Oracle Node Manipulation', severity: 'high', description: 'Compromised IoT oracle nodes injecting false provenance data into Hyperledger traceability chain. Non-organic ingredients receiving organic certification stamps. 23 product SKUs affected across 6 retailers.', impact: 'Regulatory & brand trust damage', status: 'investigating', region: 'NA - West Coast', timestamp: '2h ago', lossEstimate: '$15M (brand damage)' },
  { id: 'sc-005', target: 'Trade Promotion Management System', brand: 'SnackWorld International', vector: 'Insider + Credential Abuse', severity: 'high', description: 'Insider threat actor exploited TPM system to create phantom promotional deductions totaling $6.1M across 890 fictitious retail accounts. Deduction claims matched valid retailer patterns to evade analytics.', impact: 'Financial fraud - trade spend', status: 'escalated', region: 'Global', timestamp: '3h ago', lossEstimate: '$6.1M' },
  { id: 'sc-006', target: 'Direct Store Delivery (DSD) Route System', brand: 'Metro Snacks Inc', vector: 'GPS Spoofing + Route Hijack', severity: 'medium', description: 'DSD delivery routes manipulated via GPS spoofing on 47 delivery vehicles. Trucks diverted to unauthorized locations for product theft. Fleet telemetry showed normal routes while physical vehicles deviated.', impact: 'Product theft - 47 vehicles', status: 'contained', region: 'LATAM - Brazil', timestamp: '5h ago', lossEstimate: '$1.8M' },
];

const COUNTERFEIT_ALERTS: CounterfeitAlert[] = [
  { id: 'cf-001', product: 'Premium Infant Formula (Stage 1)', sku: 'NF-INF-001-32oz', platform: 'Amazon Marketplace + Pinduoduo', quantity: 34_500, detectionMethod: 'AI Image Recognition + Chemical Assay', origin: 'Guangzhou, China', severity: 'critical', healthRisk: 'Lead content 47x safe limit detected in samples - infant mortality risk', status: 'seized', timestamp: '1h ago' },
  { id: 'cf-002', product: 'Organic Extra Virgin Olive Oil', sku: 'OL-EVOO-750ml', platform: 'AliExpress + Local Retailers', quantity: 128_000, detectionMethod: 'Isotope Ratio Mass Spectrometry', origin: 'Izmir, Turkey', severity: 'high', healthRisk: 'Seed oil blend with added chlorophyll - allergen risk', status: 'takedown-sent', timestamp: '4h ago' },
  { id: 'cf-003', product: 'Luxury Skincare Serum (Retinol)', sku: 'SK-RET-30ml', platform: 'TikTok Shop + Shopee', quantity: 67_200, detectionMethod: 'QR Code Track & Trace + Spectral Analysis', origin: 'Ho Chi Minh City, Vietnam', severity: 'critical', healthRisk: 'Hydroquinone at toxic levels - skin damage & carcinogenic', status: 'active', timestamp: '6h ago' },
  { id: 'cf-004', product: 'Sports Nutrition Protein Powder', sku: 'SP-WPI-5lb', platform: 'eBay + Mercado Libre', quantity: 45_800, detectionMethod: 'Blockchain Provenance Mismatch', origin: 'Lagos, Nigeria', severity: 'medium', healthRisk: 'Amino spiking with melamine - kidney damage risk', status: 'monitoring', timestamp: '12h ago' },
  { id: 'cf-005', product: 'Premium Spirits (Single Malt)', sku: 'WH-SM-12Y-700ml', platform: 'Dark Web + Grey Market Distributors', quantity: 12_400, detectionMethod: 'NFC Tag Authentication Failure', origin: 'Tbilisi, Georgia', severity: 'high', healthRisk: 'Methanol contamination - blindness/death risk', status: 'seized', timestamp: '1d ago' },
  { id: 'cf-006', product: 'Organic Baby Food Pouches', sku: 'BF-ORG-MULTI-4oz', platform: 'Facebook Marketplace + WhatsApp Groups', quantity: 89_300, detectionMethod: 'Consumer Complaint Pattern + Lab Analysis', origin: 'Karachi, Pakistan', severity: 'critical', healthRisk: 'Heavy metals (arsenic, cadmium) exceeding FDA limits by 12x', status: 'takedown-sent', timestamp: '2d ago' },
];

const FORMULA_THEFTS: FormulaTheft[] = [
  { id: 'ft-001', category: 'Beverage - Flavor Innovation', assetType: 'Flavor formulation + process parameters', threatActor: 'APT41 (Double Dragon)', technique: 'Spearphishing -> PLM system lateral movement', exfilSize: '2.3 GB', valuationAtRisk: '$340M (3-year competitive advantage)', severity: 'critical', description: 'Nation-state actor targeting next-generation zero-sugar cola formulation from PLM/R&D system. 47 flavor compound ratios, fermentation process IP, and consumer test data exfiltrated via encrypted DNS tunnel.', status: 'escalated', mitre: 'T1566.001 -> T1021.001 -> T1567.002' },
  { id: 'ft-002', category: 'Personal Care - Biotech', assetType: 'Probiotic strain genome + fermentation IP', threatActor: 'APT10 (Stone Panda)', technique: 'Supply chain compromise via lab equipment vendor', exfilSize: '890 MB', valuationAtRisk: '$180M (patent portfolio)', severity: 'critical', description: 'Compromised LIMS vendor update delivered backdoor to genomics lab systems. Proprietary Lactobacillus strain sequences, fermentation yield optimization algorithms, and clinical trial data targeted.', status: 'investigating', mitre: 'T1195.002 -> T1059.001 -> T1041' },
  { id: 'ft-003', category: 'Food - Manufacturing Process', assetType: 'Proprietary cooking process + seasoning blend', threatActor: 'Competitor-linked insider', technique: 'USB exfiltration + encrypted email', exfilSize: '450 MB', valuationAtRisk: '$95M (market share)', severity: 'high', description: 'Departing R&D director copied proprietary seasoning formulation database, extruder configuration parameters, and consumer preference models to personal USB. Data appeared on competitor product within 6 months.', status: 'blocked', mitre: 'T1052.001 -> T1048.002' },
  { id: 'ft-004', category: 'Pharma-Adjacent - Supplements', assetType: 'Clinical efficacy data + formulation ratios', threatActor: 'FIN7 (Carbanak)', technique: 'Watering hole on industry conference site', exfilSize: '1.7 GB', valuationAtRisk: '$220M (regulatory approval timeline)', severity: 'high', description: 'Drive-by download targeting attendees of NutraIngredients conference. Payload specifically searched for clinical trial databases, bioavailability studies, and GMP manufacturing SOPs.', status: 'investigating', mitre: 'T1189 -> T1083 -> T1005' },
  { id: 'ft-005', category: 'Cosmetics - Sustainability', assetType: 'Green chemistry process + supplier network', threatActor: 'Unknown (likely state-sponsored)', technique: 'Cloud misconfiguration exploitation', exfilSize: '3.1 GB', valuationAtRisk: '$410M (ESG brand premium)', severity: 'critical', description: 'Exposed S3 bucket containing entire sustainable packaging R&D pipeline: biodegradable polymer formulations, recycled-content supplier contracts, and carbon footprint optimization models.', status: 'blocked', mitre: 'T1530 -> T1537' },
];

const ICS_EVENTS: ICSEvent[] = [
  { id: 'ics-001', facility: 'Beverage Plant - Atlanta', system: 'CIP (Clean-in-Place) Controller', protocol: 'EtherNet/IP', type: 'Setpoint Manipulation', severity: 'critical', description: 'CIP cycle caustic concentration setpoint changed from 2.0% to 0.3% NaOH via compromised HMI. Insufficient sanitation would allow Listeria survival in bottling lines. HACCP critical limit breached.', productLine: 'Ready-to-Drink Juice', contaminationRisk: true, status: 'contained', timestamp: '8m ago' },
  { id: 'ics-002', facility: 'Snack Factory - Dallas', system: 'Continuous Fryer Temperature PLC', protocol: 'Modbus TCP', type: 'Safety Interlock Bypass', severity: 'critical', description: 'SIL-2 high-temperature interlock on continuous fryer forced to bypass mode. Oil temperature allowed to exceed flash point (330C). Fire suppression system also found disabled via separate attack vector.', productLine: 'Potato Chips', contaminationRisk: false, status: 'active', timestamp: '15m ago' },
  { id: 'ics-003', facility: 'Dairy Processing - Wisconsin', system: 'Pasteurizer HTST Controller', protocol: 'S7comm', type: 'Time-Temperature Manipulation', severity: 'critical', description: 'HTST pasteurizer hold time reduced from 15s to 3s at 72C via PLC program modification. Flow diversion valve logic altered to pass under-pasteurized product. Public health risk for 230K gallon batch.', productLine: 'Fluid Milk', contaminationRisk: true, status: 'contained', timestamp: '34m ago' },
  { id: 'ics-004', facility: 'Cosmetics Plant - New Jersey', system: 'Batch Reactor DCS', protocol: 'OPC-UA', type: 'Ingredient Ratio Manipulation', severity: 'high', description: 'DCS recipe parameters altered to increase preservative concentration 8x above safe limits in face cream batch. Would cause severe chemical burns on application. QC hold triggered by viscosity anomaly.', productLine: 'Premium Skincare', contaminationRisk: true, status: 'investigating', timestamp: '1h ago' },
  { id: 'ics-005', facility: 'Pet Food Plant - Kansas City', system: 'Extrusion Line PLC', protocol: 'PROFINET', type: 'Moisture Content Sabotage', severity: 'high', description: 'Extrusion moisture setpoints systematically altered to create conditions favorable for aflatoxin growth during storage. Subtle changes (2-3% increase) designed to evade inline NIR detection.', productLine: 'Dry Dog Food', contaminationRisk: true, status: 'investigating', timestamp: '2h ago' },
  { id: 'ics-006', facility: 'Brewery - Milwaukee', system: 'Fermentation Tank Automation', protocol: 'Modbus TCP', type: 'Yeast Pitch Rate Manipulation', severity: 'medium', description: 'Automated yeast pitching system parameters altered to introduce wrong strain into premium lager fermentation. 120,000 gallon batch would produce off-flavors requiring disposal. $2.8M batch at risk.', productLine: 'Premium Lager', contaminationRisk: false, status: 'resolved', timestamp: '4h ago' },
];

const METRICS = [
  { label: 'Supply Chain Alerts', value: '156', color: 'text-red-400', trend: '+18%' },
  { label: 'Counterfeit Detections', value: '377K', color: 'text-orange-400', trend: '+34%' },
  { label: 'Formula IP at Risk', value: '$1.2B', color: 'text-amber-400', trend: '+7%' },
  { label: 'Plants Monitored', value: '342', color: 'text-cyan-400', trend: '' },
  { label: 'Contamination Blocks', value: '23', color: 'text-emerald-400', trend: '-12%' },
  { label: 'FDA/FSMA Score', value: '87%', color: 'text-blue-400', trend: '+3%' },
];

const sevBadge = (s: string) => {
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
};

const statusBadge = (s: string) => {
  if (s === 'active' || s === 'escalated') return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (s === 'contained' || s === 'blocked' || s === 'resolved' || s === 'seized') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (s === 'takedown-sent') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
};

export default function CPGThreats() {
  const [tab, setTab] = useState<'supply' | 'counterfeit' | 'formula' | 'plant'>('supply');

  const TABS = [
    { id: 'supply' as const, label: 'Supply Chain Attacks', icon: Truck },
    { id: 'counterfeit' as const, label: 'Anti-Counterfeit', icon: Eye },
    { id: 'formula' as const, label: 'Formula & IP Theft', icon: Lock },
    { id: 'plant' as const, label: 'Plant ICS/Safety', icon: Thermometer },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
            <Package size={20} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Consumer Packaged Goods Threat Intelligence</h2>
            <p className="text-xs text-slate-500">Supply chain, anti-counterfeit, IP protection & food safety ICS monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-amber-400 tracking-wider">FSMA WATCH</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">0xDSI CPG</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-6 gap-3">
        {METRICS.map((m, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            {m.trend && <div className={`text-[10px] ${m.trend.startsWith('+') ? 'text-red-400' : 'text-emerald-400'}`}>{m.trend}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-amber-300 border-amber-400 bg-amber-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Supply Chain Attacks */}
      {tab === 'supply' && (
        <div className="space-y-3">
          {SUPPLY_CHAIN_ATTACKS.map(a => (
            <div key={a.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${a.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Truck size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-white">{a.target}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevBadge(a.severity)}`}>{a.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${statusBadge(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-1.5">
                    <span>{a.brand}</span>
                    <span className="text-slate-700">|</span>
                    <span>{a.region}</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-orange-400">{a.vector}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px]">
                    <span className="text-red-400 font-semibold">{a.impact}</span>
                    <span className="text-slate-500">{a.timestamp}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-lg font-bold text-red-400">{a.lossEstimate}</div>
                  <div className="text-[9px] text-slate-600">est. loss</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Anti-Counterfeit */}
      {tab === 'counterfeit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-400">377K</div>
              <div className="text-xs text-slate-500 mt-1">Counterfeit Units Detected (MTD)</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">$47M</div>
              <div className="text-xs text-slate-500 mt-1">Brand Protection Value</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">94%</div>
              <div className="text-xs text-slate-500 mt-1">Takedown Success Rate</div>
            </div>
          </div>
          {COUNTERFEIT_ALERTS.map(c => (
            <div key={c.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${c.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Package size={14} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{c.product}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevBadge(c.severity)}`}>{c.severity}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded border ${statusBadge(c.status)}`}>{c.status}</span>
                </div>
                <span className="text-sm font-bold text-red-400">{c.quantity.toLocaleString()} units</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[11px] mb-2">
                <div><span className="text-slate-500">SKU:</span> <span className="text-slate-300 font-mono">{c.sku}</span></div>
                <div><span className="text-slate-500">Platform:</span> <span className="text-slate-300">{c.platform}</span></div>
                <div><span className="text-slate-500">Origin:</span> <span className="text-slate-300">{c.origin}</span></div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">Detection: {c.detectionMethod}</div>
              <div className="px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                <span className="text-[10px] text-red-400 font-semibold">HEALTH RISK: </span>
                <span className="text-[10px] text-red-300">{c.healthRisk}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formula & IP Theft */}
      {tab === 'formula' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 mb-2">
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-400">$1.25B</div>
              <div className="text-xs text-slate-500 mt-1">Total IP at Risk</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">5</div>
              <div className="text-xs text-slate-500 mt-1">Active APT Campaigns</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">8.5 GB</div>
              <div className="text-xs text-slate-500 mt-1">Exfil Blocked (30d)</div>
            </div>
          </div>
          {FORMULA_THEFTS.map(f => (
            <div key={f.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${f.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Lock size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-white">{f.category}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevBadge(f.severity)}`}>{f.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${statusBadge(f.status)}`}>{f.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-1.5">
                    <span className="text-red-400 font-semibold">{f.threatActor}</span>
                    <span className="text-slate-700">|</span>
                    <span>{f.assetType}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px]">
                    <span className="text-cyan-400 font-mono">{f.mitre}</span>
                    <span className="text-slate-500">Exfil: {f.exfilSize}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-sm font-bold text-red-400">{f.valuationAtRisk}</div>
                  <div className="text-[9px] text-slate-600">at risk</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plant ICS / Food Safety */}
      {tab === 'plant' && (
        <div className="space-y-3">
          <div className="px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center gap-3 mb-2">
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-red-400">FOOD SAFETY CRITICAL</div>
              <div className="text-[10px] text-red-300">4 of 6 incidents involve contamination risk affecting consumer health. FSMA Preventive Controls activated.</div>
            </div>
          </div>
          {ICS_EVENTS.map(e => (
            <div key={e.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${e.contaminationRisk ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Thermometer size={14} className={e.contaminationRisk ? 'text-red-400' : 'text-amber-400'} />
                    <span className="text-sm font-bold text-white">{e.type}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevBadge(e.severity)}`}>{e.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${statusBadge(e.status)}`}>{e.status}</span>
                    {e.contaminationRisk && (
                      <span className="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold animate-pulse">CONTAMINATION RISK</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-1.5">
                    <span>{e.facility}</span>
                    <span className="text-slate-700">|</span>
                    <span>{e.system}</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-blue-400 font-mono">{e.protocol}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{e.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px]">
                    <span className="text-amber-400">Product: {e.productLine}</span>
                    <span className="text-slate-500">{e.timestamp}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
