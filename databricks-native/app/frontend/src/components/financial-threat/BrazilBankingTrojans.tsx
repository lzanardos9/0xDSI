import { useState, useEffect, useRef } from 'react';
import {
  Bug, Shield, AlertTriangle, Clock, Target, Cpu, Globe, Eye,
  ChevronRight, Activity, Lock, Zap, Server, Smartphone, FileText
} from 'lucide-react';

interface BankingTrojan {
  id: string;
  name: string;
  aliases: string[];
  origin: string;
  firstSeen: string;
  status: 'active' | 'resurgent' | 'disrupted';
  model: string;
  targetBanks: number;
  targetCountries: number;
  monthlyVictims: number;
  techniques: string[];
  delivery: string[];
  capabilities: string[];
  mitreTTPs: string[];
  iocs: { type: string; value: string }[];
  description: string;
  recentCampaign: string;
  color: string;
}

interface TrojanDetection {
  id: string;
  trojan: string;
  hash: string;
  detectedAt: string;
  endpoint: string;
  bank: string;
  action: string;
  c2Domain: string;
  status: 'quarantined' | 'blocked' | 'investigating';
}

const TROJANS: BankingTrojan[] = [
  {
    id: 'grandoreiro', name: 'Grandoreiro', aliases: ['Tetrade Member'], origin: 'Brazil (Tetrade Group)',
    firstSeen: '2016', status: 'resurgent', model: 'Malware-as-a-Service (MaaS)',
    targetBanks: 1700, targetCountries: 45, monthlyVictims: 51000,
    techniques: ['DLL Side-Loading', 'Binary Padding', 'DGA (12 domains/day)', 'DNS over HTTPS', 'Outlook Email Harvesting', 'CAPTCHA Anti-Analysis'],
    delivery: ['Phishing (tax/invoice lures)', 'Smishing', 'Fake PDF with CAPTCHA', 'MSI Custom Actions'],
    capabilities: ['Live screen streaming to operator', 'Fake pop-up credential phishing', 'Mouse/keyboard simulation', 'Clipboard hijacking', 'Web injection', 'Keylogging', 'Browser cookie theft'],
    mitreTTPs: ['T1566.001', 'T1566.002', 'T1574.002', 'T1027.001', 'T1568.002', 'T1132.002', 'T1056.002', 'T1113'],
    iocs: [
      { type: 'DLL', value: 'dbghelp.dll (side-loaded)' },
      { type: 'XOR Key', value: 'F5454DNBVXCCEFD3EFMNBVDCMNXCEVXD3CMBKJHGFM' },
      { type: 'DGA Seed', value: '12 C2 domains/day via DNS-over-HTTPS' },
      { type: 'Geo Check', value: 'ip-api.com/json (consecutive requests)' },
    ],
    description: '5% of all banking trojan attacks globally in 2024. Despite INTERPOL-led arrests in Jan 2024 (5 operators in Brazil), remaining MaaS operators continue developing lighter, localized variants. Now targets 1,700+ banks and 276 crypto wallets across 45 countries.',
    recentCampaign: 'April 2025: Tax season campaign impersonating Receita Federal (Brazil), SAT (Mexico), SARS (South Africa). MSI installer with CustomAction JScript downloader. 150K+ infections blocked by Kaspersky.',
    color: '#EF4444'
  },
  {
    id: 'coyote', name: 'Coyote', aliases: ['ParasiteSteller'], origin: 'Brazil',
    firstSeen: '2024', status: 'active', model: 'Targeted Campaign',
    targetBanks: 61, targetCountries: 3, monthlyVictims: 12000,
    techniques: ['Squirrel installer abuse', '.NET modular payloads', 'LNK file delivery', 'PowerShell execution chain', 'Nim language loader'],
    delivery: ['LNK files via email', 'PowerShell dropper chain', 'Squirrel installer framework abuse'],
    capabilities: ['Credential theft via overlay', 'Keylogging', 'Screenshot capture', 'Process injection', 'Browser manipulation'],
    mitreTTPs: ['T1059.001', 'T1218.007', 'T1547.001', 'T1056.001', 'T1113', 'T1055'],
    iocs: [
      { type: 'Loader', value: 'Nim-compiled dropper' },
      { type: 'Framework', value: 'Squirrel installer package' },
      { type: 'Target', value: '61 Brazilian bank applications' },
    ],
    description: 'Newest member of the Brazilian banking trojan family. Uses Squirrel installer framework and Nim language for the initial loader, making detection challenging. Exclusively targets Brazilian financial institutions with modular .NET payloads.',
    recentCampaign: 'March 2025: Campaign targeting Itau, Bradesco, Banco do Brasil customers via LNK file attachments disguised as Nota Fiscal Eletronica (NF-e).',
    color: '#F59E0B'
  },
  {
    id: 'casbaneiro', name: 'Casbaneiro', aliases: ['Metamorfo', 'Augmented Marauder', 'Water Saci'], origin: 'Brazil',
    firstSeen: '2018', status: 'active', model: 'Quarterly Campaign Cycles',
    targetBanks: 340, targetCountries: 12, monthlyVictims: 28000,
    techniques: ['Wormable email propagation', 'Wormable WhatsApp messages', 'On-screen overlays', 'Clipboard hijacking (crypto)', 'Horabot companion malware'],
    delivery: ['Phishing email chains', 'WhatsApp message propagation', 'Fake software updates', 'Tax-themed lures'],
    capabilities: ['Full overlay attack toolkit', 'Clipboard monitoring (BTC/ETH addresses)', 'Screenshot capture', 'Keystroke logging', 'Self-propagation via email/WhatsApp'],
    mitreTTPs: ['T1566.001', 'T1534', 'T1056.002', 'T1115', 'T1113', 'T1041'],
    iocs: [
      { type: 'Propagation', value: 'Outlook COM hijack for email spreading' },
      { type: 'Companion', value: 'Horabot malware co-deployment' },
      { type: 'C2', value: 'Quarterly rotating infrastructure' },
    ],
    description: 'Operates on quarterly campaign cycles with constantly evolving delivery chains. Unique wormable capability spreads via both compromised Outlook email clients and WhatsApp messages in Brazil, automating attack chain beyond single-target phishing.',
    recentCampaign: 'Q1 2026: Dual campaign with Horabot. Phishing emails targeting Spanish-speaking LATAM countries + WhatsApp worm component active in Brazil. New evasion: AutoIt scripting interpreter.',
    color: '#3B82F6'
  },
  {
    id: 'mekotio', name: 'Mekotio', aliases: ['Melcoz', 'Tetrade Member'], origin: 'Brazil (Tetrade Group)',
    firstSeen: '2015', status: 'resurgent', model: 'Persistent Campaign',
    targetBanks: 280, targetCountries: 8, monthlyVictims: 19000,
    techniques: ['MSI installer abuse', 'AutoHotKey scripts', 'Custom PowerShell obfuscation', 'Geo-fenced execution'],
    delivery: ['Phishing with MSI installers', 'Fake tax notifications', 'SAT/SII impersonation'],
    capabilities: ['Screenshot capture', 'Keylogging', 'Credential theft', 'Browser manipulation', 'Clipboard monitoring'],
    mitreTTPs: ['T1218.007', 'T1059.001', 'T1497.001', 'T1056.001', 'T1113'],
    iocs: [
      { type: 'Delivery', value: 'MSI with embedded AutoHotKey' },
      { type: 'Evasion', value: 'Geo-check: only executes in LATAM IPs' },
      { type: 'Persistence', value: 'Registry Run Keys + Scheduled Tasks' },
    ],
    description: 'One of the longest-running LATAM banking trojans. Resurgence in 2024 with updated MSI-based delivery targeting Chile, Spain, Mexico, and Brazil. Uses geo-fencing to only execute on victims within Latin American IP ranges.',
    recentCampaign: 'Feb 2025: Campaign impersonating Chilean SII (tax authority) with MSI installers. AutoHotKey-based payload with enhanced anti-VM detection.',
    color: '#10B981'
  },
  {
    id: 'guildma', name: 'Guildma', aliases: ['Astaroth', 'Tetrade Member'], origin: 'Brazil (Tetrade Group)',
    firstSeen: '2015', status: 'active', model: 'Modular Architecture',
    targetBanks: 450, targetCountries: 15, monthlyVictims: 23000,
    techniques: ['BITSAdmin abuse', 'WMIC execution', 'ExtractNow/Attrib abuse', 'Profile data stealing', 'Facebook/YouTube C2'],
    delivery: ['Spearphishing (invoice/NF-e lures)', 'Malicious ZIP attachments', 'Fake Nota Fiscal links'],
    capabilities: ['Full banking overlay suite', 'Form grabbing', 'Email credential theft', 'Social media account hijack', 'Netflix/Amazon credential theft', 'YouTube/Facebook C2 communication'],
    mitreTTPs: ['T1197', 'T1047', 'T1036.005', 'T1056.002', 'T1567.002', 'T1102'],
    iocs: [
      { type: 'C2 Channel', value: 'YouTube video descriptions / Facebook profiles' },
      { type: 'LOLBin', value: 'BITSAdmin + WMIC + ExtractNow chain' },
      { type: 'Payload', value: 'Multi-stage: 10+ modules loaded dynamically' },
    ],
    description: 'Most modular Tetrade member with 10+ dynamically loaded components. Uniquely uses YouTube video descriptions and Facebook profile pages as C2 communication channels, making infrastructure takedown extremely difficult.',
    recentCampaign: 'Jan 2025: NF-e themed campaign targeting Banco do Brasil, Caixa, Itau. New YouTube C2 channel rotation every 48 hours.',
    color: '#8B5CF6'
  },
  {
    id: 'brazking', name: 'BrazKing', aliases: ['PixStealer variant'], origin: 'Brazil',
    firstSeen: '2021', status: 'active', model: 'Android-First',
    targetBanks: 89, targetCountries: 4, monthlyVictims: 34000,
    techniques: ['Accessibility Service abuse', 'Screen dissection (no getInstalledPackages)', 'Server-side overlay rendering', 'Anti-uninstall via Accessibility'],
    delivery: ['Smishing (SMS phishing)', 'Fake banking APKs outside Play Store', 'Social media ad campaigns'],
    capabilities: ['Dynamic overlay attacks (server-rendered)', 'Real-time screen observation', 'Accessibility-based input injection', 'App detection via screen reading', 'Anti-removal mechanisms'],
    mitreTTPs: ['T1417.001', 'T1517', 'T1411', 'T1624.001', 'T1406'],
    iocs: [
      { type: 'Permission', value: 'BIND_ACCESSIBILITY_SERVICE' },
      { type: 'Technique', value: 'Screen dissection (no getInstalledPackages)' },
      { type: 'Overlay', value: 'Server-rendered, not built-in (evades signature)' },
    ],
    description: 'Android-specific trojan that pioneered screen dissection technique to detect banking apps without calling flagged APIs. Server-side overlay rendering means each fake login screen is dynamically generated and always matches current bank app UI.',
    recentCampaign: 'March 2025: Smishing campaign impersonating Nubank and Inter app updates. New anti-Play Protect evasion bypasses Android 14 restrictions.',
    color: '#06B6D4'
  },
  {
    id: 'pixrevolution', name: 'PixRevolution', aliases: ['GhostPix', 'PixAgent'], origin: 'Brazil',
    firstSeen: '2025', status: 'active', model: 'Human/AI Operator Hybrid',
    targetBanks: 42, targetCountries: 1, monthlyVictims: 15000,
    techniques: ['MediaProjection screen capture', 'Accessibility automation', 'Real-time operator control', 'PIX transaction hijacking at confirmation'],
    delivery: ['Fake security apps', 'Smishing with urgency lures', 'Fake Receita Federal notifications'],
    capabilities: ['Real-time screen surveillance', 'Human/AI operator on remote end', 'PIX key/amount modification at transaction moment', 'Biometric bypass via session riding', 'Dynamic C2 with operator rotation'],
    mitreTTPs: ['T1417.001', 'T1517', 'T1411', 'T1629.003', 'T1616'],
    iocs: [
      { type: 'API', value: 'MediaProjection without user-initiated capture' },
      { type: 'Behavior', value: 'Accessibility + screen capture + C2 = composite signal' },
      { type: 'Target', value: 'Brazilian PIX-enabled banking apps exclusively' },
    ],
    description: 'Newest and most sophisticated Brazilian mobile trojan. Combines real-time screen surveillance with a human or AI operator who watches the victim\'s phone and strikes at the exact moment of PIX transaction. Sidesteps automated trojan detection because actions appear as legitimate user behavior.',
    recentCampaign: 'April 2026: Active campaign targeting all major Brazilian banks. Operators rotate every 4 hours. Zimperium zero-day detection via composite behavioral signal.',
    color: '#EF4444'
  },
];

const DETECTIONS: TrojanDetection[] = [
  { id: 'd-001', trojan: 'Grandoreiro', hash: 'ff908727cc1b...bc7', detectedAt: '12s ago', endpoint: 'WS-FIN-042 (Sao Paulo)', bank: 'Itau Unibanco', action: 'DLL side-loading via dbghelp.dll', c2Domain: 'dga-gen-0426-07.com', status: 'quarantined' },
  { id: 'd-002', trojan: 'PixRevolution', hash: 'APK: com.pix.secure...', detectedAt: '34s ago', endpoint: 'MOBILE-Android-14', bank: 'Nubank', action: 'MediaProjection + Accessibility combo', c2Domain: 'api-pix-auth.xyz', status: 'blocked' },
  { id: 'd-003', trojan: 'Coyote', hash: '4a8b2c91d3...e7f', detectedAt: '1m ago', endpoint: 'WS-ACC-018 (Rio)', bank: 'Bradesco', action: 'Squirrel installer + Nim loader', c2Domain: 'update-service-br.com', status: 'quarantined' },
  { id: 'd-004', trojan: 'Casbaneiro', hash: '7c3d9e1f5a...b28', detectedAt: '2m ago', endpoint: 'WS-HR-007 (Brasilia)', bank: 'Banco do Brasil', action: 'Outlook COM hijack for propagation', c2Domain: 'quarterly-c2-q1.net', status: 'investigating' },
  { id: 'd-005', trojan: 'Guildma', hash: 'ae2f8b4c7d...192', detectedAt: '4m ago', endpoint: 'WS-FIN-091 (BH)', bank: 'Caixa Economica', action: 'BITSAdmin + YouTube C2 decode', c2Domain: 'youtube.com/watch?v=C2PAYLOAD', status: 'blocked' },
  { id: 'd-006', trojan: 'Mekotio', hash: 'MSI: 5b1a3c8d...f41', detectedAt: '6m ago', endpoint: 'WS-LEGAL-003 (SP)', bank: 'Santander Brasil', action: 'MSI CustomAction + AutoHotKey', c2Domain: 'sii-cl-update.com', status: 'quarantined' },
  { id: 'd-007', trojan: 'BrazKing', hash: 'APK: br.safe.bank...', detectedAt: '8m ago', endpoint: 'MOBILE-Android-13', bank: 'Inter', action: 'Screen dissection + server overlay', c2Domain: 'mobile-sec-br.xyz', status: 'blocked' },
];

export default function BrazilBankingTrojans() {
  const [view, setView] = useState<'families' | 'detections' | 'killchain'>('families');
  const [expandedTrojan, setExpandedTrojan] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Kill chain animation
  useEffect(() => {
    if (view !== 'killchain') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 360;
    let frame = 0;

    const stages = [
      { x: 60, label: 'Phishing\nDelivery', sub: 'Email/SMS/WhatsApp', color: '#F59E0B', trojans: ['Grandoreiro', 'Casbaneiro', 'Mekotio'] },
      { x: 180, label: 'Loader\nExecution', sub: 'MSI/LNK/Squirrel', color: '#FB923C', trojans: ['Coyote', 'Guildma', 'Grandoreiro'] },
      { x: 300, label: 'Evasion\nPersistence', sub: 'DLL Side-Load/DGA', color: '#EF4444', trojans: ['Grandoreiro', 'Guildma', 'Mekotio'] },
      { x: 420, label: 'Banking\nOverlay', sub: 'Credential Theft', color: '#DC2626', trojans: ['All Families'] },
      { x: 540, label: 'C2\nComms', sub: 'DGA/YouTube/HTTPS', color: '#B91C1C', trojans: ['Guildma (YT)', 'Grandoreiro (DoH)'] },
      { x: 660, label: 'PIX\nHijack', sub: 'Transaction Modify', color: '#991B1B', trojans: ['PixRevolution', 'BrazKing', 'GhostHand'] },
      { x: W - 60, label: 'Mule\nCascade', sub: 'Fund Laundering', color: '#7F1D1D', trojans: ['Automated Splitting'] },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Connection lines
      for (let i = 0; i < stages.length - 1; i++) {
        const gradient = ctx.createLinearGradient(stages[i].x, 0, stages[i + 1].x, 0);
        gradient.addColorStop(0, stages[i].color + '40');
        gradient.addColorStop(1, stages[i + 1].color + '40');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(stages[i].x + 30, 90);
        ctx.lineTo(stages[i + 1].x - 30, 90);
        ctx.stroke();

        // Animated pulse
        const progress = ((frame + i * 15) % 60) / 60;
        const px = stages[i].x + 30 + (stages[i + 1].x - 30 - stages[i].x - 30) * progress;
        ctx.beginPath();
        ctx.arc(px, 90, 5, 0, Math.PI * 2);
        ctx.fillStyle = stages[i].color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, 90, 10, 0, Math.PI * 2);
        ctx.fillStyle = stages[i].color + '30';
        ctx.fill();
      }

      // Stage nodes
      stages.forEach((s, i) => {
        // Glow
        const grd = ctx.createRadialGradient(s.x, 90, 0, s.x, 90, 35);
        grd.addColorStop(0, s.color + '20');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.fillRect(s.x - 35, 55, 70, 70);

        // Circle
        ctx.beginPath();
        ctx.arc(s.x, 90, 25, 0, Math.PI * 2);
        ctx.fillStyle = s.color + '15';
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Stage number
        ctx.fillStyle = s.color;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, s.x, 95);

        // Labels
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 9px sans-serif';
        const lines = s.label.split('\n');
        lines.forEach((line, li) => {
          ctx.fillText(line, s.x, 135 + li * 12);
        });

        ctx.fillStyle = '#64748B';
        ctx.font = '8px monospace';
        ctx.fillText(s.sub, s.x, 165);

        // Trojan labels below
        ctx.fillStyle = s.color + 'CC';
        ctx.font = '7px monospace';
        s.trojans.forEach((t, ti) => {
          ctx.fillText(t, s.x, 185 + ti * 11);
        });
      });

      // Title
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('BRAZILIAN BANKING TROJAN KILL CHAIN - UNIFIED ATTACK FLOW', 20, 25);

      frame++;
      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  return (
    <div className="p-5 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { l: 'Active Trojan Families', v: '7', c: 'text-red-400' },
          { l: 'Banks Targeted', v: '1,700+', c: 'text-orange-400' },
          { l: 'Countries Affected', v: '45', c: 'text-amber-400' },
          { l: 'Monthly Victims (global)', v: '182K', c: 'text-cyan-400' },
          { l: 'Detections (24h)', v: '4,891', c: 'text-emerald-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{s.l}</div>
            <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {[
          { id: 'families' as const, label: 'Trojan Families', icon: Bug },
          { id: 'detections' as const, label: 'Live Detections', icon: Shield },
          { id: 'killchain' as const, label: 'Kill Chain Map', icon: Target },
        ].map(v => {
          const Icon = v.icon;
          return (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${view === v.id ? 'text-red-300 border-red-400 bg-red-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{v.label}
            </button>
          );
        })}
      </div>

      {/* Trojan families */}
      {view === 'families' && (
        <div className="space-y-3">
          <div className="text-[10px] text-slate-500 mb-1">
            Source: Kaspersky, ESET, IBM X-Force, Zimperium, LevelBlue SpiderLabs, INTERPOL
          </div>
          {TROJANS.map(t => {
            const isExpanded = expandedTrojan === t.id;
            return (
              <div key={t.id} className={`bg-[#0b0f1e] border rounded-xl overflow-hidden transition-all ${t.status === 'active' || t.status === 'resurgent' ? 'border-red-500/20' : 'border-[#1e293b]'}`}>
                <button onClick={() => setExpandedTrojan(isExpanded ? null : t.id)}
                  className="w-full p-4 text-left hover:bg-white/[0.01] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: t.color + '15', border: `1px solid ${t.color}40` }}>
                        <Bug size={16} style={{ color: t.color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{t.name}</span>
                          {t.aliases.map(a => <span key={a} className="text-[10px] text-slate-500">{a}</span>)}
                          <span className={`px-2 py-0.5 text-[10px] rounded-full border ${t.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/30' : t.status === 'resurgent' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>{t.status}</span>
                          <span className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-400 border border-slate-700">{t.model}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Since {t.firstSeen} | {t.origin}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-400">{t.targetBanks.toLocaleString()}</div>
                        <div className="text-[9px] text-slate-600">banks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-amber-400">{t.targetCountries}</div>
                        <div className="text-[9px] text-slate-600">countries</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-cyan-400">{t.monthlyVictims.toLocaleString()}</div>
                        <div className="text-[9px] text-slate-600">victims/mo</div>
                      </div>
                      <ChevronRight size={16} className={`text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-800/50">
                    <p className="text-xs text-slate-400 leading-relaxed pt-3">{t.description}</p>

                    <div className="px-3 py-2 bg-red-500/5 border border-red-500/15 rounded-lg">
                      <div className="text-[10px] text-red-400 font-semibold mb-1">LATEST CAMPAIGN</div>
                      <div className="text-[10px] text-red-300">{t.recentCampaign}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold mb-1.5">DELIVERY METHODS</div>
                        {t.delivery.map((d, i) => (
                          <div key={i} className="text-[10px] text-slate-300 flex items-center gap-1 mb-0.5"><ChevronRight size={8} className="text-amber-400" />{d}</div>
                        ))}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold mb-1.5">CAPABILITIES</div>
                        {t.capabilities.map((c, i) => (
                          <div key={i} className="text-[10px] text-slate-300 flex items-center gap-1 mb-0.5"><ChevronRight size={8} className="text-red-400" />{c}</div>
                        ))}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold mb-1.5">TECHNIQUES</div>
                        {t.techniques.map((tc, i) => (
                          <div key={i} className="text-[10px] text-slate-300 flex items-center gap-1 mb-0.5"><ChevronRight size={8} className="text-cyan-400" />{tc}</div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <span className="text-[9px] text-slate-500 mr-1">MITRE ATT&CK:</span>
                      {t.mitreTTPs.map(m => (
                        <span key={m} className="px-1.5 py-0.5 text-[9px] rounded bg-slate-800/50 text-cyan-400 border border-cyan-500/20 font-mono">{m}</span>
                      ))}
                    </div>

                    <div>
                      <div className="text-[9px] text-slate-500 font-semibold mb-1">INDICATORS OF COMPROMISE</div>
                      <div className="flex flex-wrap gap-1">
                        {t.iocs.map((ioc, i) => (
                          <span key={i} className="px-2 py-0.5 text-[9px] rounded bg-red-500/5 text-red-400/80 border border-red-500/10 font-mono">
                            {ioc.type}: {ioc.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Live detections */}
      {view === 'detections' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-mono font-bold">REAL-TIME BRAZILIAN TROJAN DETECTIONS</span>
          </div>
          {DETECTIONS.map((d, i) => (
            <div key={d.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${i === 0 ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bug size={14} className="text-red-400" />
                  <span className="text-sm font-bold" style={{ color: TROJANS.find(t => t.name === d.trojan)?.color || '#EF4444' }}>{d.trojan}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${d.status === 'quarantined' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : d.status === 'blocked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>{d.status}</span>
                </div>
                <span className="text-[10px] text-slate-500">{d.detectedAt}</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-[10px]">
                <div><span className="text-slate-500">Hash:</span> <span className="text-slate-300 font-mono">{d.hash}</span></div>
                <div><span className="text-slate-500">Endpoint:</span> <span className="text-slate-300">{d.endpoint}</span></div>
                <div><span className="text-slate-500">Target:</span> <span className="text-cyan-400">{d.bank}</span></div>
                <div><span className="text-slate-500">C2:</span> <span className="text-red-400 font-mono">{d.c2Domain}</span></div>
              </div>
              <div className="mt-1.5 text-[10px] text-amber-300">{d.action}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kill chain */}
      {view === 'killchain' && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 overflow-hidden">
          <canvas ref={canvasRef} className="w-full" style={{ height: 360 }} />
        </div>
      )}
    </div>
  );
}
