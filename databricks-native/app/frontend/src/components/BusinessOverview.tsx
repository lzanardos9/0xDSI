import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Network,
  Server,
  Users,
  FileWarning,
  Activity,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Target,
  Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const BusinessOverview = () => {
  const [riskFactors, setRiskFactors] = useState<any[]>([]);
  const [overallScore, setOverallScore] = useState(0);

  useEffect(() => {
    loadSecurityScorecard();
  }, []);

  const loadSecurityScorecard = async () => {
    const factors = [
      {
        name: 'Network Security',
        score: 87,
        grade: 'B+',
        trend: 'up',
        finding: 3,
        critical: 0,
        description: 'Firewall rules, port scanning, intrusion detection',
        weight: 12,
      },
      {
        name: 'DNS Health',
        score: 92,
        grade: 'A',
        trend: 'stable',
        finding: 1,
        critical: 0,
        description: 'DNS configuration, DNSSEC, domain reputation',
        weight: 8,
      },
      {
        name: 'Patching Cadence',
        score: 78,
        grade: 'C+',
        trend: 'down',
        finding: 12,
        critical: 2,
        description: 'Software updates, vulnerability remediation timeline',
        weight: 15,
      },
      {
        name: 'IP Reputation',
        score: 94,
        grade: 'A',
        trend: 'up',
        finding: 2,
        critical: 0,
        description: 'Malicious activity, spam, botnet participation',
        weight: 10,
      },
      {
        name: 'Application Security',
        score: 81,
        grade: 'B',
        trend: 'up',
        finding: 8,
        critical: 1,
        description: 'Web application vulnerabilities, API security',
        weight: 13,
      },
      {
        name: 'Endpoint Security',
        score: 85,
        grade: 'B',
        trend: 'stable',
        finding: 6,
        critical: 1,
        description: 'Antivirus, EDR, device management',
        weight: 11,
      },
      {
        name: 'Hacker Chatter',
        score: 96,
        grade: 'A',
        trend: 'stable',
        finding: 1,
        critical: 0,
        description: 'Dark web mentions, credential leaks, threat intelligence',
        weight: 9,
      },
      {
        name: 'Social Engineering',
        score: 73,
        grade: 'C',
        trend: 'down',
        finding: 15,
        critical: 3,
        description: 'Phishing susceptibility, awareness training effectiveness',
        weight: 10,
      },
      {
        name: 'Information Leak',
        score: 89,
        grade: 'B+',
        trend: 'up',
        finding: 4,
        critical: 0,
        description: 'Data exposure, configuration files, sensitive information',
        weight: 7,
      },
      {
        name: 'Cubit Score',
        score: 91,
        grade: 'A-',
        trend: 'up',
        finding: 2,
        critical: 0,
        description: 'Third-party risk, supply chain security',
        weight: 5,
      },
    ];

    setRiskFactors(factors);

    const weightedScore = factors.reduce((acc, factor) => {
      return acc + (factor.score * factor.weight) / 100;
    }, 0);

    setOverallScore(Math.round(weightedScore));
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (grade.startsWith('B')) return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (grade.startsWith('C')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    if (grade.startsWith('D')) return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  };

  const getLetterGrade = (score: number) => {
    if (score >= 95) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'B-';
    if (score >= 70) return 'C+';
    if (score >= 65) return 'C';
    if (score >= 60) return 'C-';
    if (score >= 55) return 'D';
    return 'F';
  };

  const overallGrade = getLetterGrade(overallScore);
  const totalFindings = riskFactors.reduce((acc, f) => acc + f.finding, 0);
  const totalCritical = riskFactors.reduce((acc, f) => acc + f.critical, 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-xl p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Business Security Scorecard</h2>
            <p className="text-slate-400 text-lg">
              Comprehensive vendor and supply chain risk assessment
            </p>
            <p className="text-slate-500 text-sm mt-2">
              Based on 10 security risk factors with OSINT and web telemetry
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-slate-400 text-sm">Overall Rating</span>
              <div className={`px-4 py-2 rounded-lg font-bold text-2xl border ${getGradeColor(overallGrade)}`}>
                {overallGrade}
              </div>
            </div>
            <div className="text-slate-300 text-3xl font-bold">{overallScore} / 100</div>
            <div className="text-slate-500 text-xs mt-1">Weighted Score</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Total Findings</span>
              <FileWarning className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-white text-2xl font-bold">{totalFindings}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Critical Issues</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-white text-2xl font-bold">{totalCritical}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Risk Factors</span>
              <Target className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-white text-2xl font-bold">10</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs uppercase tracking-wider">Vendor Risk</span>
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-white text-2xl font-bold">Low</div>
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
          <h4 className="text-white font-semibold mb-3 flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span>Score Breakdown by Weight</span>
          </h4>
          <div className="space-y-2">
            {riskFactors.map((factor) => (
              <div key={factor.name} className="flex items-center space-x-2">
                <div className="w-32 text-slate-400 text-xs">{factor.name}</div>
                <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      factor.score >= 90
                        ? 'bg-green-500'
                        : factor.score >= 80
                        ? 'bg-blue-500'
                        : factor.score >= 70
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${factor.score}%` }}
                  />
                </div>
                <div className="w-12 text-white text-xs font-semibold text-right">{factor.score}</div>
                <div className="w-16 text-slate-500 text-xs text-right">{factor.weight}% weight</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {riskFactors.map((factor) => (
          <RiskFactorCard key={factor.name} factor={factor} />
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center space-x-2">
          <Lock className="w-5 h-5 text-blue-400" />
          <span>Commercial Security Scorecard Framework</span>
        </h3>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Framework:</span>
                <span className="text-slate-400 ml-2">10 Risk Factors</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Rating:</span>
                <span className="text-slate-400 ml-2">A–F Letter Grade</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Source Data:</span>
                <span className="text-slate-400 ml-2">OSINT & Web Telemetry</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Purpose:</span>
                <span className="text-slate-400 ml-2">Vendor/Supply-chain Risk</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Output:</span>
                <span className="text-slate-400 ml-2">Security Rating Report</span>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-slate-300 font-medium">Focus:</span>
                <span className="text-slate-400 ml-2">Business Risk Management</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RiskFactorCard = ({ factor }: { factor: any }) => {
  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (grade.startsWith('B')) return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    if (grade.startsWith('C')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    if (grade.startsWith('D')) return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  };

  const getTrendIcon = () => {
    if (factor.trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (factor.trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Activity className="w-4 h-4 text-slate-400" />;
  };

  const getIcon = () => {
    if (factor.name.includes('Network')) return <Network className="w-5 h-5" />;
    if (factor.name.includes('DNS')) return <Server className="w-5 h-5" />;
    if (factor.name.includes('Application')) return <Activity className="w-5 h-5" />;
    if (factor.name.includes('Social')) return <Users className="w-5 h-5" />;
    return <Shield className="w-5 h-5" />;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg border ${getGradeColor(factor.grade)}`}>{getIcon()}</div>
          <div>
            <h3 className="text-white font-semibold">{factor.name}</h3>
            <p className="text-slate-500 text-xs mt-1">{factor.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <div className={`px-3 py-1 rounded-lg border font-bold ${getGradeColor(factor.grade)}`}>
            {factor.grade}
          </div>
          {getTrendIcon()}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Score</span>
          <span className="text-white font-bold text-lg">{factor.score} / 100</span>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              factor.score >= 90
                ? 'bg-green-500'
                : factor.score >= 80
                ? 'bg-blue-500'
                : factor.score >= 70
                ? 'bg-yellow-500'
                : factor.score >= 60
                ? 'bg-orange-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${factor.score}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800">
          <div className="text-center">
            <div className="text-slate-400 text-xs mb-1">Findings</div>
            <div className="text-white font-semibold">{factor.finding}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400 text-xs mb-1">Critical</div>
            <div className={`font-semibold ${factor.critical > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {factor.critical}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-400 text-xs mb-1">Weight</div>
            <div className="text-white font-semibold">{factor.weight}%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessOverview;
