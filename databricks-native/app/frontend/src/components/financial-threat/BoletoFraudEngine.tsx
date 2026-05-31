import { useState, useEffect, useRef } from 'react';
import {
  FileText, AlertTriangle, Shield, Clock, Eye, Users, Lock,
  Target, Activity, Zap, Globe, ChevronRight, TrendingUp, Phone, MessageSquare
} from 'lucide-react';

interface BoletoFraud {
  id: string;
  type: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  technique: string;
  monthlyVolume: number;
  avgAmount: string;
  detectionMethod: string;
  indicators: string[];
  status: 'active-campaign' | 'detected' | 'mitigated';
}

interface SocialEngScenario {
  id: string;
  name: string;
  namePt: string;
  platform: string;
  icon: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  steps: string[];
  success_rate: string;
  monthly_attempts: number;
  avg_loss: string;
  demographic: string;
  defenses: string[];
}

const BOLETO_FRAUDS: BoletoFraud[] = [
  {
    id: 'bf-001', type: 'Boleto Malware Interception',
    description: 'Banking trojans (Grandoreiro, Guildma) intercept Boleto generation in browser, modifying the "linha digitavel" (barcode number) to redirect payment to attacker\'s bank account. The visual Boleto appears identical but the underlying payment routing data points to a mule account. Works on both PDF and HTML-rendered Boletos.',
    severity: 'critical',
    technique: 'Browser process injection + DOM manipulation of Boleto barcode fields + real-time bank routing code substitution',
    monthlyVolume: 34_500, avgAmount: 'R$ 3,450',
    detectionMethod: 'Barcode vs. digital line cross-validation + bank code anomaly detection',
    indicators: ['Modified "nosso numero" field', 'Bank routing code mismatch (banco cedente != liquidante)', 'DOM mutation on Boleto render page', 'Process injection into browser'],
    status: 'active-campaign'
  },
  {
    id: 'bf-002', type: 'Segundo Via Boleto (Duplicate Scam)',
    description: 'Scammer contacts victim claiming original Boleto "expired" or "had error," sending a second via (duplicate) with modified payment data. Uses real company branding, real CNPJ, and real due dates obtained from data breaches at utility companies and telecom providers. SERASA/SPC threats used as pressure.',
    severity: 'high',
    technique: 'Data breach of billing systems + Boleto forgery with authentic company templates + voice social engineering',
    monthlyVolume: 78_200, avgAmount: 'R$ 890',
    detectionMethod: 'Billing system authentication + customer callback verification + Boleto hash validation',
    indicators: ['Unsolicited contact claiming billing error', 'Different bank code from official provider', 'Pressure: "seu CPF sera negativado"', 'WhatsApp delivery vs official email'],
    status: 'active-campaign'
  },
  {
    id: 'bf-003', type: 'Boleto GRF Interception (Tax Fraud)',
    description: 'Interception of government tax payment Boletos (DARF, GPS, GRF/FGTS) via compromised accounting software. Targets SMBs using desktop contabilidade software with modified DLLs. Accountants unknowingly generate Boletos with redirected payment data for hundreds of client companies.',
    severity: 'critical',
    technique: 'Compromised accounting software update + batch Boleto modification across all client GRFs',
    monthlyVolume: 12_300, avgAmount: 'R$ 8,900',
    detectionMethod: 'Software integrity monitoring + GRF payment confirmation with Receita Federal API',
    indicators: ['Accounting software DLL modification', 'FGTS/DARF payment routing anomaly', 'Multiple clients affected simultaneously', 'Software update from unofficial source'],
    status: 'detected'
  },
  {
    id: 'bf-004', type: 'Email Boleto Swap (Man-in-the-Mailbox)',
    description: 'Attacker compromises vendor/supplier email account and intercepts legitimate Boleto attachments in email threads. Original PDF is replaced with modified version containing attacker\'s bank details. Targets B2B transactions where Boleto values are high (R$10K-500K).',
    severity: 'critical',
    technique: 'Business Email Compromise (BEC) + PDF metadata preservation + identical visual rendering',
    monthlyVolume: 5_800, avgAmount: 'R$ 67,000',
    detectionMethod: 'PDF hash verification + email header chain analysis + vendor payment baseline anomaly',
    indicators: ['Boleto bank code change in active email thread', 'PDF metadata shows different creation tool', 'Reply-to address subtle modification', 'Payment to new beneficiary in existing vendor thread'],
    status: 'active-campaign'
  },
  {
    id: 'bf-005', type: 'Condominium/HOA Boleto Fraud',
    description: 'Mass generation of fake condominium fee Boletos targeting apartment residents in major cities. Uses leaked sindico (property manager) data and real condominium addresses. Boletos arrive via physical mail or WhatsApp groups with authentic-looking headers and correct unit numbers.',
    severity: 'high',
    technique: 'Property registry data breach + Boleto batch generation + physical mail / WhatsApp delivery',
    monthlyVolume: 45_600, avgAmount: 'R$ 1,200',
    detectionMethod: 'Condominium management platform verification + bank code validation against registered administrator',
    indicators: ['Boleto bank differs from official administradora', 'Delivery via WhatsApp vs usual method', 'Due date differs from established cycle', 'Slightly different CNPJ or razao social'],
    status: 'active-campaign'
  },
];

const SOCIAL_ENG_SCENARIOS: SocialEngScenario[] = [
  {
    id: 'se-001', name: 'Madonna Scam (Golpe da Celebridade)', namePt: 'Golpe da Celebridade / Madonna',
    platform: 'Instagram / TikTok', icon: 'celebrity', severity: 'high',
    description: 'Scammers create fake celebrity social media profiles (Madonna, Anitta, Neymar) and DM fans claiming they\'ve "won a contest" or offering "exclusive meet & greet." Victim must make PIX payment to "reserve their spot." Uses deepfake video messages for credibility.',
    steps: ['Fake celebrity profile targets fan followers', 'DM: "You won! Pay R$500 booking fee via PIX"', 'Deepfake video "from celebrity" confirming win', 'Urgency: "Only 2 spots left, transfer now"', 'Victim sends PIX to mule account', 'Profile disappears after collection'],
    success_rate: '12%', monthly_attempts: 234_000, avg_loss: 'R$ 780',
    demographic: 'Age 16-35, female-skewed, social media heavy users',
    defenses: ['Celebrity account verification badges', 'Payment request flagging from new contacts', 'Deepfake detection on video messages']
  },
  {
    id: 'se-002', name: 'Fake Auction / Leilao Falso', namePt: 'Golpe do Leilao Falso',
    platform: 'Fake websites / Instagram Ads', icon: 'auction', severity: 'critical',
    description: 'Fake online auction sites mimicking legitimate judicial auction platforms (e.g., fake Sodre Santoro, Zukerman, Mega Leiloes). Offer vehicles and property at 30-70% below market via "judicial seizure." Victims pay deposit via Boleto/PIX. Sites replicate real auction mechanics with countdown timers.',
    steps: ['Facebook/Instagram ad: "BMW seized, 60% off"', 'Redirected to pixel-perfect fake auction site', 'Registration requires CPF, address, phone', 'Fake bidding process with shill bidders', '"Winning" requires immediate PIX deposit (R$5-30K)', 'Boleto for "remaining balance" sent via email', 'Site disappears after payment period'],
    success_rate: '8%', monthly_attempts: 89_000, avg_loss: 'R$ 12,400',
    demographic: 'Age 30-55, male-skewed, bargain seekers',
    defenses: ['Domain age verification', 'CNPJ validation against official auction registry', 'Payment to CPF (not CNPJ) flag']
  },
  {
    id: 'se-003', name: 'WhatsApp Job Scam (Falsa Vaga)', namePt: 'Golpe da Falsa Vaga de Emprego',
    platform: 'WhatsApp / Telegram', icon: 'job', severity: 'high',
    description: 'Mass WhatsApp messages offering high-paying remote jobs at major companies (Amazon, Mercado Livre, Magazine Luiza). Victim must complete "training tasks" (rate products on fake platform) and make initial PIX "deposits" to "unlock higher-paying tasks." Classic advance-fee variant.',
    steps: ['WhatsApp message: "R$300/day rating products at home"', 'Directed to fake task platform', 'First tasks pay small amounts (R$20-50) to build trust', '"Premium tasks" require PIX deposit (R$200-2000)', 'Returns shown on dashboard but never withdrawable', 'Escalating deposit requirements until victim stops'],
    success_rate: '18%', monthly_attempts: 456_000, avg_loss: 'R$ 2,300',
    demographic: 'Age 18-45, unemployed or underemployed, all genders',
    defenses: ['Legitimate employer verification', 'Deposit-required job flag', 'Platform domain age check']
  },
  {
    id: 'se-004', name: 'Fake Investment Platform (Piramide Digital)', namePt: 'Golpe da Plataforma de Investimento',
    platform: 'Instagram / YouTube / Telegram', icon: 'investment', severity: 'critical',
    description: 'Fake crypto/forex investment platforms promising 2-5% daily returns. Uses Telegram groups with 50K+ members showing fake profit screenshots. Initial small investments return real profits (Ponzi). Victims recruit friends/family. Average victim invests R$8K before collapse.',
    steps: ['Instagram/YouTube ad: "I make R$5K/day trading"', 'Telegram group with "proof" screenshots', 'Platform shows dashboard with growing balance', 'Initial R$500 deposit returns R$600 (real payout)', 'Victim deposits R$5-20K for "VIP tier"', 'Platform freezes withdrawals after critical mass', 'Operators disappear with R$10M+'],
    success_rate: '15%', monthly_attempts: 167_000, avg_loss: 'R$ 8,900',
    demographic: 'Age 25-55, all demographics, crypto-curious',
    defenses: ['CVM (Brazilian SEC) unregistered platform check', 'Return rate anomaly detection', 'Ponzi pattern: early withdrawals < new deposits']
  },
  {
    id: 'se-005', name: 'Wrong PIX Refund Scam (PIX Errado)', namePt: 'Golpe do PIX Errado',
    platform: 'WhatsApp / SMS', icon: 'refund', severity: 'medium',
    description: 'Scammer deliberately sends small PIX (R$10-100) to victim, then contacts claiming "I sent to the wrong person, please refund to this other key." The refund key is different from the origin. After victim refunds, scammer files MED claim on the original transfer, recovering it too -- double collection.',
    steps: ['Scammer sends R$50 PIX to victim', 'Contacts victim: "I made a mistake, please refund"', 'Provides different PIX key for "refund"', 'Victim refunds to the new key', 'Scammer files MED claim on original R$50', 'Bank reverses original transfer (victim loses R$50 twice)', 'Net gain: R$100 per victim at scale'],
    success_rate: '34%', monthly_attempts: 890_000, avg_loss: 'R$ 150',
    demographic: 'All demographics, particularly elderly and low-tech users',
    defenses: ['Refund to same PIX key only', 'MED filing pattern detection', 'Consumer education on MED abuse']
  },
];

export default function BoletoFraudEngine() {
  const [view, setView] = useState<'boleto' | 'social' | 'heatmap'>('boleto');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(iv);
  }, []);

  // Brazil heatmap
  useEffect(() => {
    if (view !== 'heatmap') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 420;
    let frame = 0;

    const states = [
      { name: 'SP', x: W * 0.52, y: H * 0.62, incidents: 234_000, size: 28 },
      { name: 'RJ', x: W * 0.58, y: H * 0.55, incidents: 156_000, size: 22 },
      { name: 'MG', x: W * 0.50, y: H * 0.50, incidents: 89_000, size: 18 },
      { name: 'BA', x: W * 0.58, y: H * 0.38, incidents: 67_000, size: 16 },
      { name: 'RS', x: W * 0.42, y: H * 0.78, incidents: 45_000, size: 14 },
      { name: 'PR', x: W * 0.44, y: H * 0.68, incidents: 56_000, size: 15 },
      { name: 'PE', x: W * 0.65, y: H * 0.30, incidents: 78_000, size: 17 },
      { name: 'CE', x: W * 0.63, y: H * 0.22, incidents: 54_000, size: 14 },
      { name: 'PA', x: W * 0.48, y: H * 0.18, incidents: 34_000, size: 12 },
      { name: 'DF', x: W * 0.47, y: H * 0.48, incidents: 43_000, size: 13 },
      { name: 'GO', x: W * 0.44, y: H * 0.50, incidents: 32_000, size: 11 },
      { name: 'SC', x: W * 0.43, y: H * 0.73, incidents: 28_000, size: 10 },
      { name: 'MA', x: W * 0.55, y: H * 0.18, incidents: 23_000, size: 10 },
      { name: 'AM', x: W * 0.32, y: H * 0.15, incidents: 18_000, size: 9 },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Title
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('BRAZIL - FINANCIAL FRAUD DENSITY MAP (REAL-TIME)', 20, 20);

      // Draw state hotspots
      states.forEach((s, i) => {
        const pulse = Math.sin((frame + i * 20) * 0.05) * 0.3 + 0.7;
        const intensity = s.incidents / 234_000;

        // Outer glow
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2.5);
        glow.addColorStop(0, `rgba(239, 68, 68, ${intensity * 0.3 * pulse})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(s.x - s.size * 3, s.y - s.size * 3, s.size * 6, s.size * 6);

        // Inner circle
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${intensity * 0.4})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(239, 68, 68, ${intensity * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // State label
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, s.x, s.y - s.size - 5);

        // Incident count
        ctx.fillStyle = '#F87171';
        ctx.font = '8px monospace';
        ctx.fillText(`${(s.incidents / 1000).toFixed(0)}K`, s.x, s.y + 4);

        // Random event sparks
        if (frame % 30 === i % 30) {
          const angle = Math.random() * Math.PI * 2;
          const dist = s.size + 10;
          ctx.beginPath();
          ctx.arc(s.x + Math.cos(angle) * dist, s.y + Math.sin(angle) * dist, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#FBBF24';
          ctx.fill();
        }
      });

      // Legend
      ctx.fillStyle = '#475569';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Size = incident volume | Brightness = fraud density', 20, H - 15);

      // Live counter
      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      const total = states.reduce((a, s) => a + s.incidents, 0);
      ctx.fillText(`${total.toLocaleString()} incidents/month`, W - 20, 20);

      frame++;
      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  const VIEWS = [
    { id: 'boleto' as const, label: 'Boleto Fraud', icon: FileText },
    { id: 'social' as const, label: 'Social Engineering', icon: MessageSquare },
    { id: 'heatmap' as const, label: 'Brazil Fraud Map', icon: Globe },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { l: 'Boleto Frauds (MTD)', v: '176K', c: 'text-red-400' },
          { l: 'Social Eng. Attempts', v: '1.8M', c: 'text-orange-400' },
          { l: 'Value at Risk', v: 'R$ 2.1B', c: 'text-amber-400' },
          { l: 'Blocked (24h)', v: '89,456', c: 'text-emerald-400' },
          { l: 'Recovery Rate', v: '31%', c: 'text-cyan-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{s.l}</div>
            <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {VIEWS.map(v => {
          const Icon = v.icon;
          return (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${view === v.id ? 'text-amber-300 border-amber-400 bg-amber-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{v.label}
            </button>
          );
        })}
      </div>

      {/* Boleto Fraud */}
      {view === 'boleto' && (
        <div className="space-y-3">
          {BOLETO_FRAUDS.map(b => (
            <div key={b.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${b.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <FileText size={14} className="text-amber-400" />
                    <span className="text-sm font-bold text-white">{b.type}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${b.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : b.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{b.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${b.status === 'active-campaign' ? 'bg-red-500/10 text-red-400 border-red-500/20' : b.status === 'detected' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>{b.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">{b.description}</p>
                  <div className="mt-2 px-3 py-2 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-[10px] text-cyan-400 font-semibold mb-1">TECHNIQUE</div>
                    <div className="text-[10px] text-slate-300">{b.technique}</div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">Detection: <span className="text-emerald-400">{b.detectionMethod}</span></div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {b.indicators.map((ind, i) => (
                      <span key={i} className="px-2 py-0.5 text-[9px] rounded bg-red-500/5 text-red-400/80 border border-red-500/10 font-mono">{ind}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-lg font-bold text-red-400">{b.monthlyVolume.toLocaleString()}</div>
                  <div className="text-[9px] text-slate-600">cases/month</div>
                  <div className="text-sm font-bold text-amber-400 mt-1">{b.avgAmount}</div>
                  <div className="text-[9px] text-slate-600">avg amount</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Social Engineering */}
      {view === 'social' && (
        <div className="space-y-4">
          <div className="px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <div className="text-xs text-amber-400 font-bold">70% of all Brazilian bank fraud losses originate from social engineering attacks</div>
            <div className="text-[10px] text-amber-300/70 mt-1">Source: IronVest Research, BCB Fraud Reports 2025-2026</div>
          </div>
          {SOCIAL_ENG_SCENARIOS.map(s => (
            <div key={s.id} className={`bg-[#0b0f1e] border rounded-xl p-5 ${s.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-white">{s.name}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${s.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : s.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{s.severity}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{s.namePt} -- Platform: {s.platform}</div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-lg font-bold text-red-400">{s.monthly_attempts.toLocaleString()}</div>
                    <div className="text-[9px] text-slate-600">attempts/mo</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-400">{s.avg_loss}</div>
                    <div className="text-[9px] text-slate-600">avg loss</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-cyan-400">{s.success_rate}</div>
                    <div className="text-[9px] text-slate-600">success</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{s.description}</p>

              {/* Attack flow steps */}
              <div className="bg-slate-800/20 rounded-lg border border-slate-700/30 p-3 mb-3">
                <div className="text-[10px] text-cyan-400 font-semibold mb-2">ATTACK FLOW</div>
                <div className="flex flex-wrap gap-1">
                  {s.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50">
                        <span className="text-[9px] font-bold text-cyan-400">{i + 1}</span>
                        <span className="text-[9px] text-slate-300">{step}</span>
                      </div>
                      {i < s.steps.length - 1 && <ChevronRight size={10} className="text-slate-600 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Target: <span className="text-slate-300">{s.demographic}</span></span>
                <div className="flex gap-1">
                  {s.defenses.map((d, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/5 text-emerald-400/80 border border-emerald-500/10">{d}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Heatmap */}
      {view === 'heatmap' && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 overflow-hidden">
          <canvas ref={canvasRef} className="w-full" style={{ height: 420 }} />
        </div>
      )}
    </div>
  );
}
