import { useState, useEffect, useRef } from 'react';
import {
  Zap, AlertTriangle, Shield, Clock, MapPin, Users, Eye, Phone,
  TrendingUp, Target, Smartphone, QrCode, MessageSquare, Lock,
  ArrowRight, ChevronRight, Activity
} from 'lucide-react';

interface PixScam {
  id: string;
  name: string;
  namePt: string;
  category: 'social-engineering' | 'malware' | 'physical' | 'technical';
  severity: 'critical' | 'high' | 'medium';
  description: string;
  technique: string;
  monthlyIncidents: number;
  avgLoss: string;
  trend: string;
  medVector: string;
  regions: string[];
  indicators: string[];
}

interface LivePixEvent {
  id: string;
  type: string;
  amount: string;
  origin: string;
  destination: string;
  riskScore: number;
  reason: string;
  status: 'blocked' | 'flagged' | 'investigating' | 'allowed';
  cpf: string;
  timestamp: string;
  bank: string;
  deviceTrust: number;
}

const PIX_SCAMS: PixScam[] = [
  {
    id: 'pix-001', name: 'Ghost Hand (Mao Fantasma)', namePt: 'Golpe da Mao Fantasma',
    category: 'malware', severity: 'critical',
    description: 'PixRevolution-class Android trojan uses Accessibility Services to hijack PIX transfers in real-time. Human/AI operator watches victim\'s screen via MediaProjection and modifies recipient keys and amounts at the moment of transaction confirmation. Bypasses biometric auth by operating within the legitimate banking app session.',
    technique: 'Accessibility Service abuse + MediaProjection screen capture + real-time C2 operator intervention',
    monthlyIncidents: 47_200, avgLoss: 'R$ 4,780', trend: '+67%', medVector: 'Fake banking apps / Smishing',
    regions: ['Sao Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia'],
    indicators: ['com.security.update APK', 'MediaProjection without user consent', 'Accessibility overlay on banking app', 'C2: api-pix-security[.]com']
  },
  {
    id: 'pix-002', name: 'QR Code Swap (Troca de QR)', namePt: 'Golpe do QR Code Trocado',
    category: 'technical', severity: 'critical',
    description: 'Adversary replaces legitimate merchant QR codes with attacker-controlled PIX keys. Physical overlays on payment terminals, MITM on dynamic QR generation APIs, and malware that modifies QR code rendering in real-time on victim devices. BRCode standard EMV manipulation targeting Payload Format Indicator.',
    technique: 'Physical QR overlay + dynamic QR API MITM + EMV BRCode payload manipulation',
    monthlyIncidents: 28_900, avgLoss: 'R$ 1,240', trend: '+34%', medVector: 'Physical / API compromise',
    regions: ['Sao Paulo', 'Brasilia', 'Curitiba', 'Belo Horizonte'],
    indicators: ['Modified BRCode CRC16 checksum', 'PIX key != merchant CNPJ', 'QR generation from non-PSP endpoint', 'Geo mismatch: merchant vs key owner']
  },
  {
    id: 'pix-003', name: 'Express Kidnapping (Sequestro Relampago)', namePt: 'Sequestro Relampago PIX',
    category: 'physical', severity: 'critical',
    description: 'Victims physically coerced to make PIX transfers under threat of violence. Criminal networks use "money mule cascades" where initial transfer is instantly split across 15-30 accounts within seconds via automated PIX API scripts, making recovery impossible. BCB MED (Special Return Mechanism) ineffective due to speed.',
    technique: 'Physical coercion + automated mule cascade splitting via PIX API + immediate crypto conversion',
    monthlyIncidents: 8_400, avgLoss: 'R$ 12,500', trend: '+23%', medVector: 'Physical kidnapping',
    regions: ['Sao Paulo (Zona Leste)', 'Rio de Janeiro', 'Salvador', 'Recife'],
    indicators: ['Nighttime transfer > R$5K from mobile', 'Multiple sequential transfers same device', 'New PIX keys registered <24h', 'Mule accounts: age <25, opened <30d']
  },
  {
    id: 'pix-004', name: 'Fake Bank Employee (Falsa Central)', namePt: 'Golpe da Falsa Central Telefonica',
    category: 'social-engineering', severity: 'high',
    description: 'Scammers spoof caller ID of major Brazilian banks (Itau 4004-4828, Bradesco 4002-0022, BB 4004-0001) and convince victims they have a "security issue" requiring an "emergency PIX reversal." Victims unknowingly transfer funds to attacker accounts. Uses real leaked data from Serasa breaches for credibility.',
    technique: 'Caller ID spoofing + leaked CPF/account data from Serasa + social engineering script',
    monthlyIncidents: 156_000, avgLoss: 'R$ 2,890', trend: '+45%', medVector: 'Voice call / WhatsApp',
    regions: ['National (all states)', 'Concentration: SP, RJ, MG'],
    indicators: ['Incoming call matching bank prefix', 'Urgency language: "bloqueio", "seguranca"', 'Request to install "app de seguranca"', 'Transfer to CPF (not CNPJ)']
  },
  {
    id: 'pix-005', name: 'PIX Bug Scam (Bug do PIX)', namePt: 'Golpe do Bug do PIX',
    category: 'social-engineering', severity: 'high',
    description: 'Social media campaigns (TikTok, Instagram Reels, WhatsApp groups) claim a "bug" in PIX system returns 10x the transferred amount. Victims send money to attacker\'s PIX key believing they will receive multiplied returns. Uses deepfake videos of "bank employees" confirming the exploit.',
    technique: 'Deepfake video social proof + viral social media + fake testimonial screenshots',
    monthlyIncidents: 34_700, avgLoss: 'R$ 890', trend: '+89%', medVector: 'TikTok / Instagram / WhatsApp',
    regions: ['National', 'Focus: Northeast, North regions'],
    indicators: ['Viral video mentioning "bug do PIX"', 'Transfer to random CPF with promise of return', 'Small initial "test" amounts R$10-50', 'Deepfake detection: facial artifacts']
  },
  {
    id: 'pix-006', name: 'WhatsApp Cloning (Clonagem)', namePt: 'Golpe da Clonagem do WhatsApp',
    category: 'social-engineering', severity: 'high',
    description: 'SIM swap or WhatsApp Web session hijacking gives attacker control of victim\'s WhatsApp. Attacker messages contacts pretending to be victim, claiming "emergency" need for PIX transfer. Uses victim\'s real profile photo, status, and communication style mined from chat history.',
    technique: 'SIM swap via social engineering at carrier + WhatsApp Web session theft + contact impersonation',
    monthlyIncidents: 89_500, avgLoss: 'R$ 3,200', trend: '+12%', medVector: 'WhatsApp / SMS',
    regions: ['National (all states)'],
    indicators: ['SIM swap request at carrier store', 'WhatsApp re-registration event', 'Message pattern change: urgency + PIX request', 'New device fingerprint on account']
  },
  {
    id: 'pix-007', name: 'Fake Receipt (Comprovante Falso)', namePt: 'Golpe do Comprovante Falso',
    category: 'technical', severity: 'medium',
    description: 'Attacker generates pixel-perfect fake PIX receipt (comprovante) using forged receipt generators. Merchant releases goods/services believing payment was received. Exploits delay between receipt display and actual bank settlement confirmation. Targets small merchants without real-time reconciliation.',
    technique: 'Receipt image forgery + timing exploitation between display and settlement + social pressure',
    monthlyIncidents: 67_300, avgLoss: 'R$ 450', trend: '+28%', medVector: 'In-person / WhatsApp image',
    regions: ['National', 'Focus: small merchants, street vendors'],
    indicators: ['Receipt screenshot vs API confirmation mismatch', 'TXID format validation failure', 'Timestamp inconsistency', 'Missing E2E ID on receipt']
  },
];

const LIVE_EVENTS: LivePixEvent[] = [
  { id: 'le-001', type: 'Ghost Hand Transfer', amount: 'R$ 8,450.00', origin: 'CPF ***.***.234-56', destination: 'PIX Key: +55 11 9****-7823', riskScore: 98, reason: 'Accessibility Service active + MediaProjection + new recipient', status: 'blocked', cpf: '***234-56', timestamp: '2s ago', bank: 'Itau Unibanco', deviceTrust: 12 },
  { id: 'le-002', type: 'Mule Cascade Split', amount: 'R$ 23,000.00', origin: 'CPF ***.***.891-02', destination: '17 sequential PIX keys', riskScore: 99, reason: 'Automated splitting pattern: 17 transfers in 8 seconds', status: 'blocked', cpf: '***891-02', timestamp: '5s ago', bank: 'Banco do Brasil', deviceTrust: 45 },
  { id: 'le-003', type: 'QR Code Substitution', amount: 'R$ 2,340.00', origin: 'CNPJ merchant terminal', destination: 'PIX Key CPF (not CNPJ)', riskScore: 94, reason: 'QR payload recipient != registered merchant. BRCode CRC mismatch.', status: 'flagged', cpf: 'CNPJ ****/0001-45', timestamp: '12s ago', bank: 'Bradesco', deviceTrust: 78 },
  { id: 'le-004', type: 'Fake Central Call', amount: 'R$ 5,670.00', origin: 'CPF ***.***.567-89', destination: 'PIX Key: email@protonmail.com', riskScore: 91, reason: 'Transfer initiated during active voice call. New recipient. Amount > daily avg 4x.', status: 'investigating', cpf: '***567-89', timestamp: '23s ago', bank: 'Nubank', deviceTrust: 67 },
  { id: 'le-005', type: 'Nighttime Coercion', amount: 'R$ 15,000.00', origin: 'CPF ***.***.123-45', destination: 'PIX Key: CPF ***.***.999-00', riskScore: 97, reason: 'Transfer at 02:47 AM. Location: known risk zone. Amount = exact PIX limit.', status: 'blocked', cpf: '***123-45', timestamp: '34s ago', bank: 'Caixa Economica', deviceTrust: 89 },
  { id: 'le-006', type: 'WhatsApp Clone Request', amount: 'R$ 3,890.00', origin: 'CPF ***.***.456-78', destination: 'PIX Key: +55 21 9****-3456', riskScore: 87, reason: 'Recipient contacted via cloned WhatsApp. SIM swap detected 2h ago on origin.', status: 'flagged', cpf: '***456-78', timestamp: '48s ago', bank: 'Santander Brasil', deviceTrust: 34 },
  { id: 'le-007', type: 'Deepfake Bug Scam', amount: 'R$ 500.00', origin: 'CPF ***.***.789-01', destination: 'PIX Key: aleatoria@email.com', riskScore: 82, reason: 'Multiple small transfers to same key. Device visited "bug do PIX" TikTok content 12m ago.', status: 'investigating', cpf: '***789-01', timestamp: '1m ago', bank: 'Inter', deviceTrust: 56 },
];

const MED_STATS = [
  { label: 'PIX Transfers / sec (Brazil)', value: '4,127', color: 'text-cyan-400' },
  { label: 'Blocked (24h)', value: '23,891', color: 'text-emerald-400' },
  { label: 'Fraud Attempts (24h)', value: '187,430', color: 'text-red-400' },
  { label: 'MED Claims Filed', value: '12,456', color: 'text-amber-400' },
  { label: 'Mule Accounts Frozen', value: '3,847', color: 'text-orange-400' },
  { label: 'Recovery Rate', value: '23.4%', color: 'text-blue-400' },
];

const catColor = (c: string) => {
  if (c === 'social-engineering') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (c === 'malware') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (c === 'physical') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
};

export default function PixFraudIntelligence() {
  const [view, setView] = useState<'taxonomy' | 'live' | 'med'>('taxonomy');
  const [liveEvents, setLiveEvents] = useState(LIVE_EVENTS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setLiveEvents(prev => {
        const copy = [...prev];
        const popped = copy.pop()!;
        popped.timestamp = 'just now';
        popped.riskScore = Math.min(99, popped.riskScore + Math.floor(Math.random() * 5));
        copy.unshift(popped);
        return copy;
      });
    }, 3500);
    return () => clearInterval(iv);
  }, []);

  // Mule cascade visualization
  useEffect(() => {
    if (view !== 'live') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 180;
    let frame = 0;

    const origin = { x: 60, y: H / 2 };
    const mules = Array.from({ length: 14 }, (_, i) => ({
      x: 180 + (i % 7) * 80,
      y: i < 7 ? 35 : H - 35,
      amount: `R$${(Math.random() * 2000 + 500).toFixed(0)}`,
    }));
    const crypto = { x: W - 60, y: H / 2 };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Origin node
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VICTIM', origin.x, origin.y - 4);
      ctx.fillText('R$23K', origin.x, origin.y + 8);

      // Draw mule nodes
      mules.forEach((m, i) => {
        // Line from origin
        const progress = ((frame + i * 8) % 60) / 60;
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(origin.x + 20, origin.y);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        // Pulse along line
        const px = origin.x + 20 + (m.x - origin.x - 20) * progress;
        const py = origin.y + (m.y - origin.y) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 146, 60, ${1 - progress})`;
        ctx.fill();

        // Mule node
        ctx.beginPath();
        ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(251, 146, 60, 0.1)';
        ctx.fill();
        ctx.strokeStyle = '#FB923C';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#FB923C';
        ctx.font = '7px monospace';
        ctx.fillText(m.amount, m.x, m.y + 3);

        // Line to crypto
        const p2 = ((frame + i * 8 + 30) % 60) / 60;
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';
        ctx.beginPath();
        ctx.moveTo(m.x + 12, m.y);
        ctx.lineTo(crypto.x - 20, crypto.y);
        ctx.stroke();

        const cx = m.x + 12 + (crypto.x - 20 - m.x - 12) * p2;
        const cy = m.y + (crypto.y - m.y) * p2;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${1 - p2})`;
        ctx.fill();
      });

      // Crypto node
      ctx.beginPath();
      ctx.arc(crypto.x, crypto.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#22D3EE';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('CRYPTO', crypto.x, crypto.y - 4);
      ctx.fillText('MIXER', crypto.x, crypto.y + 8);

      frame++;
      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  const VIEWS = [
    { id: 'taxonomy' as const, label: 'PIX Fraud Taxonomy', icon: Target },
    { id: 'live' as const, label: 'Live PIX Monitor', icon: Activity },
    { id: 'med' as const, label: 'MED 2.0 Recovery', icon: Shield },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-6 gap-3">
        {MED_STATS.map((s, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{s.label}</div>
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sub-views */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {VIEWS.map(v => {
          const Icon = v.icon;
          return (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${view === v.id ? 'text-emerald-300 border-emerald-400 bg-emerald-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{v.label}
            </button>
          );
        })}
      </div>

      {/* Taxonomy view */}
      {view === 'taxonomy' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">15 Known PIX Fraud Vectors</span>
            <span className="text-[10px] text-slate-600">(Source: BCB, ArXiv Taxonomy 2025, Zimperium Research)</span>
          </div>
          {PIX_SCAMS.map(scam => (
            <div key={scam.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${scam.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'} hover:border-slate-600 transition-colors`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-white">{scam.name}</span>
                    <span className="text-[10px] text-slate-500 italic">{scam.namePt}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${scam.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : scam.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{scam.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${catColor(scam.category)}`}>{scam.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">{scam.description}</p>
                  <div className="mt-2 px-3 py-2 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-[10px] text-cyan-400 font-semibold mb-1">TECHNIQUE</div>
                    <div className="text-[10px] text-slate-300">{scam.technique}</div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px]">
                    <span className="text-slate-500">Vector: <span className="text-slate-300">{scam.medVector}</span></span>
                    <span className="text-slate-500">Regions: {scam.regions.slice(0, 2).map(r => <span key={r} className="text-emerald-400 mr-1">{r}</span>)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {scam.indicators.map((ind, i) => (
                      <span key={i} className="px-2 py-0.5 text-[9px] rounded bg-red-500/5 text-red-400/80 border border-red-500/10 font-mono">{ind}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4 space-y-1">
                  <div className="text-lg font-bold text-red-400">{scam.monthlyIncidents.toLocaleString()}</div>
                  <div className="text-[9px] text-slate-600">incidents/month</div>
                  <div className="text-sm font-bold text-amber-400">{scam.avgLoss}</div>
                  <div className="text-[9px] text-slate-600">avg loss</div>
                  <div className={`text-xs font-bold ${scam.trend.startsWith('+') ? 'text-red-400' : 'text-emerald-400'}`}>{scam.trend}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live PIX monitor */}
      {view === 'live' && (
        <div className="space-y-4">
          {/* Mule cascade viz */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-red-400 font-mono font-bold">MULE CASCADE VISUALIZATION - REAL-TIME SPLITTING PATTERN</span>
            </div>
            <canvas ref={canvasRef} className="w-full" style={{ height: 180 }} />
          </div>

          {/* Live feed */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-mono font-bold">LIVE PIX FRAUD DETECTION FEED</span>
          </div>
          {liveEvents.map((e, i) => (
            <div key={e.id + i} className={`bg-[#0b0f1e] border rounded-xl p-4 transition-all duration-500 ${i === 0 ? 'border-red-500/40 animate-pulse' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{e.type}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${e.status === 'blocked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : e.status === 'flagged' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>{e.status}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-red-400">{e.amount}</div>
                    <div className="text-[9px] text-slate-600">{e.bank}</div>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${e.riskScore >= 95 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : e.riskScore >= 85 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                    {e.riskScore}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div><span className="text-slate-500">From:</span> <span className="text-slate-300 font-mono">{e.origin}</span></div>
                <div><span className="text-slate-500">To:</span> <span className="text-red-400 font-mono">{e.destination}</span></div>
                <div><span className="text-slate-500">Device Trust:</span> <span className={e.deviceTrust < 50 ? 'text-red-400' : 'text-emerald-400'}>{e.deviceTrust}/100</span></div>
              </div>
              <div className="mt-2 text-[10px] text-amber-300">{e.reason}</div>
              <div className="text-[9px] text-slate-600 mt-1">{e.timestamp}</div>
            </div>
          ))}
        </div>
      )}

      {/* MED 2.0 Recovery */}
      {view === 'med' && (
        <div className="space-y-4">
          <div className="bg-[#0b0f1e] border border-emerald-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-emerald-400" />
              <span className="text-sm font-bold text-white">MED 2.0 - Mecanismo Especial de Devolucao</span>
              <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">BCB REGULATION</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              The Central Bank of Brazil's Special Return Mechanism enables automated fund recovery for PIX fraud. MED 2.0 introduces cascading blocks across the entire mule chain, not just the first recipient. Recovery window: 80 hours from claim filing.
            </p>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { l: 'Claims Filed (MTD)', v: '12,456', c: 'text-cyan-400' },
                { l: 'Recovered Value', v: 'R$ 34.2M', c: 'text-emerald-400' },
                { l: 'Recovery Rate', v: '23.4%', c: 'text-amber-400' },
                { l: 'Avg Resolution Time', v: '47h', c: 'text-blue-400' },
              ].map((s, i) => (
                <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] text-slate-500">{s.l}</div>
                  <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recovery pipeline */}
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <h4 className="text-xs font-bold text-white mb-4">MED 2.0 Recovery Pipeline - Active Claims</h4>
            {[
              { claim: 'MED-2026-0847291', amount: 'R$ 23,000', status: 'cascading-block', mules: 17, recovered: 'R$ 8,450', bank: 'Banco do Brasil', time: '12h', stage: 3 },
              { claim: 'MED-2026-0847156', amount: 'R$ 8,900', status: 'partial-recovery', mules: 5, recovered: 'R$ 6,200', bank: 'Itau Unibanco', time: '34h', stage: 4 },
              { claim: 'MED-2026-0846998', amount: 'R$ 45,000', status: 'investigating', mules: 23, recovered: 'R$ 0', bank: 'Caixa Economica', time: '6h', stage: 2 },
              { claim: 'MED-2026-0846872', amount: 'R$ 5,670', status: 'funds-locked', mules: 3, recovered: 'R$ 5,670', bank: 'Nubank', time: '52h', stage: 5 },
              { claim: 'MED-2026-0846701', amount: 'R$ 15,000', status: 'crypto-traced', mules: 8, recovered: 'R$ 3,200', bank: 'Bradesco', time: '67h', stage: 4 },
            ].map((c, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-800/50 last:border-0">
                <div className="w-36">
                  <div className="text-xs font-mono text-cyan-400">{c.claim}</div>
                  <div className="text-[10px] text-slate-500">{c.bank}</div>
                </div>
                <div className="text-sm font-bold text-red-400 w-24">{c.amount}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    {['Filed', 'Analysis', 'Block', 'Recovery', 'Complete'].map((stage, j) => (
                      <div key={j} className="flex items-center gap-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${j < c.stage ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>{j + 1}</div>
                        {j < 4 && <div className={`w-6 h-px ${j < c.stage - 1 ? 'bg-emerald-500/50' : 'bg-slate-700'}`} />}
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1">{c.mules} mule accounts | {c.time} elapsed</div>
                </div>
                <div className="text-right w-24">
                  <div className="text-sm font-bold text-emerald-400">{c.recovered}</div>
                  <div className="text-[9px] text-slate-500">recovered</div>
                </div>
                <span className={`px-2 py-0.5 text-[9px] rounded border shrink-0 ${c.status === 'partial-recovery' || c.status === 'funds-locked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : c.status === 'cascading-block' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : c.status === 'crypto-traced' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
