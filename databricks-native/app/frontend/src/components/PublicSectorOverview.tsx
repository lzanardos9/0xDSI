import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Network,
  Server,
  Users,
  Eye,
  Activity,
  CheckCircle2,
  Target,
  Lock,
  Zap,
  Clock,
  Award,
  FileWarning,
  Radio,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const PublicSectorOverview = () => {
  const [defenseDomains, setDefenseDomains] = useState<any[]>([]);
  const [cmaiScore, setCmaiScore] = useState(0);
  const [readinessTier, setReadinessTier] = useState('');

  useEffect(() => {
    loadMilitaryGradeScorecard();
  }, []);

  const loadMilitaryGradeScorecard = async () => {
    const domains = [
      {
        name: 'Network Defense Posture',
        score: 92,
        tier: 'RT-1',
        tierLabel: 'Excellent',
        status: 'operational',
        mttc: 1.2,
        description: 'Network segmentation, cross-domain guard assurance, IP reputation',
        derivedFrom: ['Network Security', 'IP Reputation', 'DNS Health'],
        additions: 'Zero-trust network architecture, microsegmentation',
      },
      {
        name: 'System & Software Resilience',
        score: 87,
        tier: 'RT-2',
        tierLabel: 'Ready',
        status: 'minor-delay',
        mttc: 3.4,
        description: 'Secure boot, firmware assurance, SBOM compliance',
        derivedFrom: ['Patching Cadence', 'Application Security', 'Endpoint Security'],
        additions: 'Hardware root of trust, signed firmware validation',
      },
      {
        name: 'Intelligence & Threat Awareness',
        score: 78,
        tier: 'RT-2',
        tierLabel: 'Ready',
        status: 'elevated',
        mttc: 5.8,
        description: 'HUMINT/OSINT fusion, SIGINT correlation',
        derivedFrom: ['Hacker Chatter', 'Cubit Score'],
        additions: 'Classified threat feeds, nation-state actor tracking',
      },
      {
        name: 'Information & Personnel Protection',
        score: 65,
        tier: 'RT-3',
        tierLabel: 'Watch',
        status: 'exposure',
        mttc: 8.1,
        description: 'Insider threat detection, zero-trust authentication',
        derivedFrom: ['Social Engineering', 'Information Leak'],
        additions: 'Continuous vetting, behavioral analytics',
      },
      {
        name: 'Mission Continuity & Response',
        score: 94,
        tier: 'RT-1',
        tierLabel: 'Excellent',
        status: 'operational',
        mttc: 0.9,
        description: 'Incident containment, supply-chain risk propagation models',
        derivedFrom: ['Cross-factor composite'],
        additions: 'Resilience recovery index, continuity of operations',
      },
    ];

    setDefenseDomains(domains);

    const avgScore = domains.reduce((acc, d) => acc + d.score, 0) / domains.length;
    const cmai = Math.round(avgScore * 100) / 100;
    setCmaiScore(cmai);

    if (cmai >= 90) setReadinessTier('RT-1 (Excellent)');
    else if (cmai >= 80) setReadinessTier('RT-2 (Ready)');
    else if (cmai >= 70) setReadinessTier('RT-3 (Watch)');
    else if (cmai >= 60) setReadinessTier('RT-4 (Limited)');
    else setReadinessTier('RT-5 (Critical)');
  };

  const getTierColor = (tier: string) => {
    if (tier === 'RT-1') return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (tier === 'RT-2') return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (tier === 'RT-3') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    if (tier === 'RT-4') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  };

  const getStatusConfig = (status: string) => {
    if (status === 'operational') return { label: 'Full Operational', color: 'text-green-400 bg-green-500/10' };
    if (status === 'minor-delay') return { label: 'Minor Patch Delay', color: 'text-blue-400 bg-blue-500/10' };
    if (status === 'elevated') return { label: 'Elevated Chatter', color: 'text-yellow-400 bg-yellow-500/10' };
    if (status === 'exposure') return { label: 'Phishing Exposure', color: 'text-orange-400 bg-orange-500/10' };
    return { label: 'Unknown', color: 'text-slate-400 bg-slate-500/10' };
  };

  const avgMTTC = (
    defenseDomains.reduce((acc, d) => acc + d.mttc, 0) / defenseDomains.length
  ).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-xl p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center space-x-3">
              <Shield className="w-8 h-8 text-cyan-400" />
              <span>Military-Grade Cyber Scorecard</span>
            </h2>
            <p className="text-slate-400 text-lg">
              DoD/IC Cyber Mission Assurance Index for Public Sector
            </p>
            <p className="text-slate-500 text-sm mt-2">
              5 Defense Domains | OSINT + Classified + Insider Telemetry
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-slate-400 text-sm">Readiness Tier</span>
              <div className={`px-4 py-2 rounded-lg font-bold text-xl border ${getTierColor('RT-2')}`}>
                {readinessTier.split(' ')[0]}
              </div>
            </div>
            <div className="text-slate-300 text-3xl font-bold">{cmaiScore} / 100</div>
            <div className="text-slate-500 text-xs mt-1">CMAI Score</div>
            <div className={`mt-3 px-3 py-1 rounded-md text-xs font-semibold ${
              cmaiScore >= 80 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              Mission Ready (Amber+)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Domains</span>
              <Target className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-white text-2xl font-bold">5</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Avg MTTC</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-white text-2xl font-bold">{avgMTTC}h</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">RT-1 Domains</span>
              <Award className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-white text-2xl font-bold">2</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">RMF Status</span>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-white text-xl font-bold">ATO</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">ZTA Level</span>
              <Lock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-white text-xl font-bold">L3</div>
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
          <h4 className="text-white font-semibold mb-3 flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Defense Domain Readiness</span>
          </h4>
          <div className="space-y-2">
            {defenseDomains.map((domain) => (
              <div key={domain.name} className="flex items-center space-x-2">
                <div className="w-48 text-slate-300 text-xs font-medium">{domain.name}</div>
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      domain.score >= 90
                        ? 'bg-green-500'
                        : domain.score >= 80
                        ? 'bg-blue-500'
                        : domain.score >= 70
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${domain.score}%` }}
                  />
                </div>
                <div className="w-12 text-white text-xs font-semibold text-right">{domain.score}</div>
                <div className={`w-16 text-xs font-bold px-2 py-1 rounded border ${getTierColor(domain.tier)}`}>
                  {domain.tier}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {defenseDomains.map((domain) => (
          <DefenseDomainCard key={domain.name} domain={domain} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span>Military-Grade Framework</span>
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Framework:</span>
                <span className="text-slate-400 ml-2">5 Defense Domains</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Rating:</span>
                <span className="text-slate-400 ml-2">RT-1 → RT-5 (Readiness Tiers)</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Source Data:</span>
                <span className="text-slate-400 ml-2">OSINT + Classified + Insider Telemetry</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Purpose:</span>
                <span className="text-slate-400 ml-2">Mission Assurance & Cyber Readiness</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Output:</span>
                <span className="text-slate-400 ml-2">Cyber Mission Assurance Index (CMAI)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
            <Radio className="w-5 h-5 text-blue-400" />
            <span>Integration Points</span>
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">NIST 800-53 / DoD RMF</span>
                <p className="text-slate-400 text-xs mt-1">Risk management framework integration</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Zero-Trust Architecture</span>
                <p className="text-slate-400 text-xs mt-1">DoD ZTA maturity model alignment</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">DISA STIG Compliance</span>
                <p className="text-slate-400 text-xs mt-1">Security technical implementation guides</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">JWICS / SIPRNet / NIPRNet</span>
                <p className="text-slate-400 text-xs mt-1">Cross-domain dashboard integration</p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">AI Fusion Engines</span>
                <p className="text-slate-400 text-xs mt-1">Adaptive risk scoring with ML/AI</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <Eye className="w-5 h-5 text-purple-400" />
          <span>Comparison: Commercial vs Military-Grade</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Layer</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Civilian (Commercial)</th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Military-Grade (DoD/IC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="py-3 px-4 text-slate-300 font-medium">Framework</td>
                <td className="py-3 px-4 text-slate-400">10 Risk Factors</td>
                <td className="py-3 px-4 text-cyan-400">5 Defense Domains</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300 font-medium">Rating</td>
                <td className="py-3 px-4 text-slate-400">A–F</td>
                <td className="py-3 px-4 text-cyan-400">RT-1 → RT-5</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300 font-medium">Source Data</td>
                <td className="py-3 px-4 text-slate-400">OSINT & web telemetry</td>
                <td className="py-3 px-4 text-cyan-400">OSINT + classified + insider telemetry</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300 font-medium">Purpose</td>
                <td className="py-3 px-4 text-slate-400">Vendor/Supply-chain risk</td>
                <td className="py-3 px-4 text-cyan-400">Mission assurance & cyber readiness</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300 font-medium">Output</td>
                <td className="py-3 px-4 text-slate-400">Security rating report</td>
                <td className="py-3 px-4 text-cyan-400">Cyber Mission Assurance Index (CMAI)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DefenseDomainCard = ({ domain }: { domain: any }) => {
  const getTierColor = (tier: string) => {
    if (tier === 'RT-1') return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (tier === 'RT-2') return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (tier === 'RT-3') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    if (tier === 'RT-4') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  };

  const getStatusConfig = (status: string) => {
    if (status === 'operational') return { label: 'Full Operational', color: 'text-green-400 bg-green-500/10' };
    if (status === 'minor-delay') return { label: 'Minor Patch Delay', color: 'text-blue-400 bg-blue-500/10' };
    if (status === 'elevated') return { label: 'Elevated Chatter', color: 'text-yellow-400 bg-yellow-500/10' };
    if (status === 'exposure') return { label: 'Phishing Exposure', color: 'text-orange-400 bg-orange-500/10' };
    return { label: 'Unknown', color: 'text-slate-400 bg-slate-500/10' };
  };

  const getIcon = () => {
    if (domain.name.includes('Network')) return <Network className="w-5 h-5" />;
    if (domain.name.includes('System')) return <Server className="w-5 h-5" />;
    if (domain.name.includes('Intelligence')) return <Eye className="w-5 h-5" />;
    if (domain.name.includes('Personnel')) return <Users className="w-5 h-5" />;
    if (domain.name.includes('Mission')) return <Target className="w-5 h-5" />;
    return <Shield className="w-5 h-5" />;
  };

  const statusConfig = getStatusConfig(domain.status);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1">
          <div className={`p-2 rounded-lg border ${getTierColor(domain.tier)}`}>{getIcon()}</div>
          <div className="flex-1">
            <h3 className="text-white font-semibold text-lg">{domain.name}</h3>
            <p className="text-slate-500 text-xs mt-1">{domain.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <div className={`px-3 py-1 rounded-lg border font-bold text-sm ${getTierColor(domain.tier)}`}>
            {domain.tier}
          </div>
          <div className="text-slate-400 text-xs">{domain.tierLabel}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs mb-1">Score</div>
          <div className="text-white font-bold text-xl">{domain.score} / 100</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 text-xs mb-1">MTTC</div>
          <div className="text-white font-bold text-xl">{domain.mttc} hrs</div>
        </div>
      </div>

      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            domain.score >= 90
              ? 'bg-green-500'
              : domain.score >= 80
              ? 'bg-blue-500'
              : domain.score >= 70
              ? 'bg-yellow-500'
              : domain.score >= 60
              ? 'bg-orange-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${domain.score}%` }}
        />
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className={`px-3 py-2 rounded-lg ${statusConfig.color}`}>
          <div className="text-xs font-semibold">Mission Readiness: {statusConfig.label}</div>
        </div>

        <div>
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">Derived From</div>
          <div className="flex flex-wrap gap-2">
            {domain.derivedFrom.map((source: string) => (
              <span
                key={source}
                className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs border border-slate-700"
              >
                {source}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Military Additions</div>
          <p className="text-slate-300 text-xs">{domain.additions}</p>
        </div>
      </div>
    </div>
  );
};

export default PublicSectorOverview;
