import { useState } from 'react';
import {
  Fingerprint,
  CreditCard,
  Network,
  AlertTriangle,
  ShieldCheck,
  FlaskConical,
  Activity,
  UserX,
  Briefcase,
  Zap,
  Bug,
  FileText,
} from 'lucide-react';
import IdentityTrustScores from './IdentityTrustScores';
import TransactionRiskMonitor from './TransactionRiskMonitor';
import IdentityGraphExplorer from './IdentityGraphExplorer';
import ThreatDetections from './ThreatDetections';
import ThreatSimulations from './ThreatSimulations';
import ResponseDecisions from './ResponseDecisions';
import InsiderCredentialSelling from './InsiderCredentialSelling';
import FinancialCases from './FinancialCases';
import PixFraudIntelligence from './PixFraudIntelligence';
import BrazilBankingTrojans from './BrazilBankingTrojans';
import BoletoFraudEngine from './BoletoFraudEngine';

const TABS = [
  { id: 'pix-fraud', label: 'PIX Fraud Intel', icon: Zap, description: 'Brazil PIX fraud taxonomy & live monitoring' },
  { id: 'banking-trojans', label: 'Banking Trojans', icon: Bug, description: 'Grandoreiro, Coyote, Casbaneiro & LATAM malware' },
  { id: 'boleto-social', label: 'Boleto & Social Eng.', icon: FileText, description: 'Boleto fraud & social engineering attack flows' },
  { id: 'identity', label: 'Identity Trust', icon: Fingerprint, description: 'Behavioral identity scoring' },
  { id: 'transactions', label: 'Transaction Risk', icon: CreditCard, description: 'Real-time PIX/transfer monitoring' },
  { id: 'graph', label: 'Identity Graph', icon: Network, description: 'Relationship intelligence' },
  { id: 'detections', label: 'Threat Detections', icon: AlertTriangle, description: 'AI-powered threat analysis' },
  { id: 'credential-selling', label: 'Credential Selling', icon: UserX, description: 'Insider selling detection' },
  { id: 'cases', label: 'Cases', icon: Briefcase, description: 'Case management system' },
  { id: 'simulations', label: 'Simulations', icon: FlaskConical, description: 'Monte Carlo attack modeling' },
  { id: 'responses', label: 'Response Log', icon: ShieldCheck, description: 'Orchestration decisions' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function FinancialThreatIntel() {
  const [activeTab, setActiveTab] = useState<TabId>('pix-fraud');

  return (
    <div className="space-y-0">
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#1e293b]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Activity size={20} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Financial Threat Intelligence
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Brazil-focused financial threat intelligence -- PIX fraud, banking trojans & social engineering
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider">LIVE</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
                0xDSI PLATFORM
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 mt-4 -mb-4 overflow-x-auto pb-px">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-200
                    ${isActive
                      ? 'bg-[#0f1629] text-cyan-300 border border-[#1e293b] border-b-transparent'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
                    }
                  `}
                >
                  <Icon size={14} className={isActive ? 'text-cyan-400' : ''} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-px bg-cyan-500/50" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-[#0f1629]/50">
          {activeTab === 'pix-fraud' && <PixFraudIntelligence />}
          {activeTab === 'banking-trojans' && <BrazilBankingTrojans />}
          {activeTab === 'boleto-social' && <BoletoFraudEngine />}
          {activeTab === 'identity' && <IdentityTrustScores />}
          {activeTab === 'transactions' && <TransactionRiskMonitor />}
          {activeTab === 'graph' && <IdentityGraphExplorer />}
          {activeTab === 'detections' && <ThreatDetections />}
          {activeTab === 'credential-selling' && <InsiderCredentialSelling />}
          {activeTab === 'cases' && <FinancialCases />}
          {activeTab === 'simulations' && <ThreatSimulations />}
          {activeTab === 'responses' && <ResponseDecisions />}
        </div>
      </div>
    </div>
  );
}
