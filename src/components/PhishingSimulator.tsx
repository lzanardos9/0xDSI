import { useState, useEffect } from 'react';
import {
  Target, Brain, Users, Mail, Shield, Activity,
  AlertTriangle, Crosshair, Eye, Zap, TrendingUp,
  Clock, CheckCircle2, XCircle, Send, RefreshCw,
  BarChart3, Fingerprint, ChevronRight, Skull
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TabId = 'campaigns' | 'lures' | 'targets' | 'results' | 'psychprofiles';

interface Campaign {
  id: string;
  name: string;
  threat_actor: string;
  status: 'draft' | 'active' | 'completed' | 'paused';
  targets_count: number;
  click_rate: number;
  created_at: string;
}

interface LureTemplate {
  id: string;
  name: string;
  cognitive_bias: string;
  psychological_vector: string;
  threat_actor: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  success_rate: number;
}

interface TargetProfile {
  id: string;
  display_name: string;
  department: string;
  risk_score: number;
  dominant_bias: string;
  big_five: { openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number };
  dark_triad: { machiavellianism: number; narcissism: number; psychopathy: number };
  stress_level: number;
  vulnerability_index: number;
}

const THREAT_ACTORS = [
  { name: 'APT29 (Cozy Bear)', style: 'Sophisticated spear-phishing with geopolitical lures', color: 'text-red-400' },
  { name: 'Lazarus Group', style: 'Job offer / recruitment themed lures', color: 'text-amber-400' },
  { name: 'Scattered Spider', style: 'IT helpdesk impersonation, MFA fatigue', color: 'text-cyan-400' },
  { name: 'Fancy Bear (APT28)', style: 'Military/government impersonation', color: 'text-blue-400' },
  { name: 'FIN7', style: 'Financial/invoice-based social engineering', color: 'text-emerald-400' },
];

const COGNITIVE_BIASES = [
  { name: 'Authority', description: 'Impersonating authority figures', icon: Shield, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { name: 'Urgency', description: 'Time pressure manipulation', icon: Clock, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { name: 'Curiosity', description: 'Information gap exploitation', icon: Eye, color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  { name: 'Fear', description: 'Threat-based compliance', icon: AlertTriangle, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { name: 'Reciprocity', description: 'Obligation exploitation', icon: RefreshCw, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { name: 'Social Proof', description: 'Herd behavior leverage', icon: Users, color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  { name: 'Scarcity', description: 'Limited availability pressure', icon: Zap, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { name: 'Flattery', description: 'Ego manipulation', icon: TrendingUp, color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
];

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'campaigns', label: 'Campaigns', icon: Crosshair },
  { id: 'lures', label: 'Lure Generator', icon: Mail },
  { id: 'targets', label: 'Target Profiles', icon: Users },
  { id: 'results', label: 'Results & Analytics', icon: BarChart3 },
  { id: 'psychprofiles', label: 'Psych Exploitation', icon: Brain },
];

const PhishingSimulator = () => {
  const [activeTab, setActiveTab] = useState<TabId>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [targets, setTargets] = useState<TargetProfile[]>([]);
  const [selectedThreatActor, setSelectedThreatActor] = useState(THREAT_ACTORS[0].name);
  const [selectedBias, setSelectedBias] = useState('Authority');
  const [generatingLure, setGeneratingLure] = useState(false);
  const [generatedLure, setGeneratedLure] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
    loadTargets();
  }, []);

  const loadCampaigns = async () => {
    const { data } = await supabase.from('phishing_campaigns').select('*').order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setCampaigns(data);
    } else {
      setCampaigns([
        { id: '1', name: 'Q1 Executive Spear-Phish', threat_actor: 'APT29 (Cozy Bear)', status: 'active', targets_count: 24, click_rate: 18.5, created_at: '2026-05-28' },
        { id: '2', name: 'IT Helpdesk MFA Fatigue', threat_actor: 'Scattered Spider', status: 'active', targets_count: 156, click_rate: 12.3, created_at: '2026-05-30' },
        { id: '3', name: 'Finance Invoice Fraud', threat_actor: 'FIN7', status: 'completed', targets_count: 45, click_rate: 22.1, created_at: '2026-05-15' },
        { id: '4', name: 'Recruitment Lure Campaign', threat_actor: 'Lazarus Group', status: 'draft', targets_count: 89, click_rate: 0, created_at: '2026-06-01' },
        { id: '5', name: 'Military Intel Harvest', threat_actor: 'Fancy Bear (APT28)', status: 'paused', targets_count: 12, click_rate: 8.3, created_at: '2026-05-20' },
      ]);
    }
  };

  const loadTargets = async () => {
    const { data } = await supabase.from('social_engineering_risk_scores').select('*');
    if (data && data.length > 0) {
      setTargets(data.map((d: any) => ({
        id: d.id,
        display_name: d.user_id?.slice(0, 8) || 'User',
        department: 'Engineering',
        risk_score: d.composite_score || 0,
        dominant_bias: d.dominant_bias || 'Authority',
        big_five: { openness: 0.7, conscientiousness: 0.5, extraversion: 0.6, agreeableness: 0.8, neuroticism: 0.4 },
        dark_triad: { machiavellianism: 0.3, narcissism: 0.4, psychopathy: 0.1 },
        stress_level: 0.5,
        vulnerability_index: d.composite_score || 65,
      })));
    } else {
      setTargets([
        { id: '1', display_name: 'Sarah Chen', department: 'Finance', risk_score: 82, dominant_bias: 'Authority', big_five: { openness: 0.8, conscientiousness: 0.4, extraversion: 0.7, agreeableness: 0.9, neuroticism: 0.6 }, dark_triad: { machiavellianism: 0.2, narcissism: 0.3, psychopathy: 0.1 }, stress_level: 0.7, vulnerability_index: 78 },
        { id: '2', display_name: 'Mike Rodriguez', department: 'Engineering', risk_score: 45, dominant_bias: 'Curiosity', big_five: { openness: 0.9, conscientiousness: 0.7, extraversion: 0.5, agreeableness: 0.6, neuroticism: 0.3 }, dark_triad: { machiavellianism: 0.4, narcissism: 0.5, psychopathy: 0.2 }, stress_level: 0.3, vulnerability_index: 42 },
        { id: '3', display_name: 'Lisa Park', department: 'HR', risk_score: 71, dominant_bias: 'Social Proof', big_five: { openness: 0.6, conscientiousness: 0.5, extraversion: 0.8, agreeableness: 0.9, neuroticism: 0.5 }, dark_triad: { machiavellianism: 0.1, narcissism: 0.2, psychopathy: 0.1 }, stress_level: 0.6, vulnerability_index: 68 },
        { id: '4', display_name: 'James Walker', department: 'Executive', risk_score: 91, dominant_bias: 'Flattery', big_five: { openness: 0.5, conscientiousness: 0.3, extraversion: 0.9, agreeableness: 0.4, neuroticism: 0.7 }, dark_triad: { machiavellianism: 0.7, narcissism: 0.8, psychopathy: 0.3 }, stress_level: 0.8, vulnerability_index: 89 },
        { id: '5', display_name: 'Anna Kowalski', department: 'Legal', risk_score: 34, dominant_bias: 'Fear', big_five: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.7, neuroticism: 0.8 }, dark_triad: { machiavellianism: 0.2, narcissism: 0.1, psychopathy: 0.1 }, stress_level: 0.9, vulnerability_index: 55 },
      ]);
    }
  };

  const generateLure = () => {
    setGeneratingLure(true);
    setGeneratedLure(null);
    setTimeout(() => {
      const lures: Record<string, Record<string, string>> = {
        'APT29 (Cozy Bear)': {
          'Authority': 'Subject: [URGENT] National Security Briefing - Your Clearance Required\n\nDear {target},\n\nThe Office of the Director of National Intelligence requires your immediate review of classified material relating to ongoing operations. Your security clearance has been flagged for renewal.\n\nPlease authenticate via the secure portal below within 4 hours to maintain access.\n\n[AUTHENTICATE NOW]\n\nThis communication is classified TOP SECRET//SCI.',
          'Curiosity': 'Subject: Confidential - Eyes Only: Project NIGHTSHADE Update\n\nThe attached intelligence summary contains information relevant to your current assignment. Due to compartmentalization protocols, this link will expire in 2 hours.\n\n[VIEW CLASSIFIED BRIEF]',
          'Fear': 'Subject: CRITICAL: Your credentials compromised in SolarWinds-class incident\n\nOur threat intel team has confirmed your Active Directory credentials were exfiltrated in an ongoing supply chain attack. Immediate password rotation is required.\n\n[SECURE YOUR ACCOUNT]',
        },
        'Scattered Spider': {
          'Authority': 'Subject: IT Security - Mandatory MFA Reset (Action Required)\n\nHi {target},\n\nThis is Alex from IT Security. We\'re rolling out enhanced MFA following a recent incident. Your account has been flagged for immediate migration.\n\nPlease click below to re-enroll your authenticator app. If not completed by EOD, your access will be suspended.\n\n[RESET MFA NOW]\n\nThanks,\nIT Security Team',
          'Urgency': 'Subject: [CRITICAL] Your Okta session expires in 15 minutes\n\nAutomatic system notification: Your SSO session will terminate due to policy enforcement. All active work will be lost.\n\n[EXTEND SESSION]',
          'Social Proof': 'Subject: Re: Team MFA migration - you\'re the last one!\n\nHey {target}, just following up - everyone else on the team already completed their MFA migration. Can you do yours today? Link below.\n\n[COMPLETE MIGRATION]',
        },
        'Lazarus Group': {
          'Curiosity': 'Subject: Exclusive Opportunity - Senior Blockchain Architect at {company}\n\nDear {target},\n\nI came across your profile and was impressed by your experience. We have an exciting senior role that offers $350K+ TC with remote flexibility.\n\nPlease review the job description and complete the initial assessment.\n\n[VIEW OPPORTUNITY]\n\nBest,\nRecruiter @ Top Talent Partners',
          'Flattery': 'Subject: You\'ve been nominated for Industry Leader Award 2026\n\nCongratulations! Based on peer nominations, you\'ve been selected as a finalist for the Global Technology Leadership Award.\n\n[ACCEPT NOMINATION]',
        },
        'FIN7': {
          'Authority': 'Subject: Invoice #INV-2026-4891 - Payment Overdue - Legal Action Pending\n\nDear Accounts Payable,\n\nThis is a final notice regarding unpaid invoice #INV-2026-4891 ($47,832.00). If payment is not received within 24 hours, this matter will be escalated to collections.\n\n[VIEW INVOICE & PAY NOW]\n\nAccounts Receivable Department',
          'Fear': 'Subject: Wire Transfer Alert - $89,500 flagged for fraud review\n\nA wire transfer initiated from your account has been flagged by our fraud detection system. If you did not authorize this transaction, click immediately to halt processing.\n\n[CANCEL TRANSFER]',
        },
      };

      const actorLures = lures[selectedThreatActor] || lures['APT29 (Cozy Bear)'];
      const lure = actorLures[selectedBias] || actorLures[Object.keys(actorLures)[0]] || 'Generated lure content...';
      setGeneratedLure(lure);
      setGeneratingLure(false);
    }, 1500);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'draft': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      case 'paused': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const renderCampaigns = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Active Campaigns</h3>
        <button className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors flex items-center gap-2">
          <Target className="w-4 h-4" />
          New Campaign
        </button>
      </div>
      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-sm font-semibold text-white">{campaign.name}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(campaign.status)}`}>
                    {campaign.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Skull className="w-3 h-3 text-red-400" />{campaign.threat_actor}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{campaign.targets_count} targets</span>
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{campaign.click_rate}% click rate</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
            </div>
            {campaign.status === 'active' && (
              <div className="mt-3 pt-3 border-t border-slate-700/30">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full transition-all" style={{ width: `${campaign.click_rate * 3}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500">{Math.round(campaign.targets_count * campaign.click_rate / 100)} compromised</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderLureGenerator = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Threat Actor TTP</h3>
          <div className="space-y-2">
            {THREAT_ACTORS.map((actor) => (
              <button
                key={actor.name}
                onClick={() => setSelectedThreatActor(actor.name)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedThreatActor === actor.name
                    ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                    : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'
                }`}
              >
                <div className={`text-sm font-medium ${actor.color}`}>{actor.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{actor.style}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Cognitive Bias Vector</h3>
          <div className="grid grid-cols-2 gap-2">
            {COGNITIVE_BIASES.map((bias) => {
              const Icon = bias.icon;
              return (
                <button
                  key={bias.name}
                  onClick={() => setSelectedBias(bias.name)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedBias === bias.name
                      ? `${bias.color} ring-1 ring-white/10`
                      : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  <div className="text-xs font-medium text-white">{bias.name}</div>
                  <div className="text-[10px] text-slate-500">{bias.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={generateLure}
          disabled={generatingLure}
          className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg text-white text-sm font-medium hover:from-red-500 hover:to-orange-500 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {generatingLure ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {generatingLure ? 'Generating...' : 'Generate Adversarial Lure'}
        </button>
      </div>

      {generatedLure && (
        <div className="bg-slate-900/60 border border-red-500/20 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Generated Phishing Lure</span>
          </div>
          <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{generatedLure}</pre>
          <div className="mt-4 flex items-center gap-3">
            <button className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors flex items-center gap-1">
              <Send className="w-3 h-3" /> Deploy to Campaign
            </button>
            <button className="px-3 py-1.5 bg-slate-700/50 border border-slate-600/30 rounded-lg text-slate-400 text-xs font-medium hover:bg-slate-700/70 transition-colors">
              Save Template
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderTargets = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Target Vulnerability Profiles</h3>
      <div className="grid gap-3">
        {targets.map((target) => (
          <div key={target.id} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 flex items-center justify-center">
                  <Fingerprint className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">{target.display_name}</h4>
                  <p className="text-xs text-slate-500">{target.department}</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${target.vulnerability_index > 70 ? 'text-red-400' : target.vulnerability_index > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {target.vulnerability_index}
                </div>
                <div className="text-[10px] text-slate-500">Vulnerability Index</div>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {Object.entries(target.big_five).map(([trait, value]) => (
                <div key={trait} className="text-center">
                  <div className="h-12 bg-slate-700/30 rounded relative overflow-hidden">
                    <div className="absolute bottom-0 w-full bg-gradient-to-t from-cyan-500/40 to-cyan-500/10 rounded transition-all" style={{ height: `${value * 100}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-500 capitalize mt-1 block">{trait.slice(0, 4)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/20">
                Bias: {target.dominant_bias}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/20">
                Stress: {Math.round(target.stress_level * 100)}%
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/20 text-slate-400 border border-slate-500/20">
                Dark Triad: {Math.round((target.dark_triad.machiavellianism + target.dark_triad.narcissism + target.dark_triad.psychopathy) / 3 * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderResults = () => {
    const metrics = [
      { label: 'Total Sent', value: '1,247', change: '+156', color: 'text-blue-400' },
      { label: 'Click Rate', value: '16.8%', change: '+2.1%', color: 'text-amber-400' },
      { label: 'Credential Harvest', value: '8.3%', change: '+0.8%', color: 'text-red-400' },
      { label: 'Report Rate', value: '42.1%', change: '+5.3%', color: 'text-emerald-400' },
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">{m.label}</div>
              <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">{m.change} this week</div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Bias Effectiveness Matrix</h4>
          <div className="grid grid-cols-4 gap-3">
            {COGNITIVE_BIASES.slice(0, 8).map((bias, i) => {
              const effectiveness = [72, 89, 54, 91, 38, 63, 77, 45][i];
              return (
                <div key={bias.name} className="text-center">
                  <div className="h-20 bg-slate-700/30 rounded-lg relative overflow-hidden mb-1">
                    <div
                      className={`absolute bottom-0 w-full rounded-lg transition-all ${effectiveness > 70 ? 'bg-gradient-to-t from-red-500/50 to-red-500/10' : effectiveness > 50 ? 'bg-gradient-to-t from-amber-500/50 to-amber-500/10' : 'bg-gradient-to-t from-emerald-500/50 to-emerald-500/10'}`}
                      style={{ height: `${effectiveness}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{effectiveness}%</span>
                  </div>
                  <span className="text-[9px] text-slate-500">{bias.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Threat Actor Success Rates</h4>
          <div className="space-y-3">
            {THREAT_ACTORS.map((actor, i) => {
              const rate = [24.5, 18.2, 31.7, 15.8, 27.3][i];
              return (
                <div key={actor.name} className="flex items-center gap-3">
                  <span className={`text-xs font-medium w-36 ${actor.color}`}>{actor.name.split(' (')[0]}</span>
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: `${rate * 3}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-12 text-right">{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPsychProfiles = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-red-900/20 to-orange-900/10 border border-red-500/20 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-semibold text-white">Psychological Exploitation Engine</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Correlates Big Five personality traits, Dark Triad indicators, UEBA stress signals, and cognitive bias susceptibility
          to generate hyper-personalized social engineering vectors targeting individual psychological vulnerabilities.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">High Neuroticism + Stress</div>
            <div className="text-xs text-red-400 font-medium">Fear/Urgency vectors</div>
            <div className="text-[10px] text-slate-500 mt-1">91% success when combined</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">High Narcissism + Extraversion</div>
            <div className="text-xs text-amber-400 font-medium">Flattery/Authority vectors</div>
            <div className="text-[10px] text-slate-500 mt-1">87% success when combined</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Low Conscientiousness + High Openness</div>
            <div className="text-xs text-cyan-400 font-medium">Curiosity/Scarcity vectors</div>
            <div className="text-[10px] text-slate-500 mt-1">74% success when combined</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {targets.slice(0, 4).map((target) => {
          const bestVector = target.big_five.neuroticism > 0.6 ? 'Fear' : target.dark_triad.narcissism > 0.5 ? 'Flattery' : 'Curiosity';
          const susceptibility = Math.round(target.vulnerability_index * (1 + target.stress_level * 0.3));
          return (
            <div key={target.id} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-red-400">{target.display_name[0]}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{target.display_name}</div>
                    <div className="text-[10px] text-slate-500">{target.department}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-400">{Math.min(susceptibility, 99)}%</div>
                  <div className="text-[10px] text-slate-500">Susceptibility</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Best Attack Vector</span>
                  <span className="text-red-400 font-medium">{bestVector}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Stress Amplifier</span>
                  <span className="text-amber-400 font-medium">+{Math.round(target.stress_level * 30)}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Recommended TTP</span>
                  <span className="text-cyan-400 font-medium">{target.vulnerability_index > 70 ? 'APT29' : 'Scattered Spider'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-600/20 border border-red-500/30 flex items-center justify-center">
              <Target className="w-5 h-5 text-red-400" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-400 rounded-full border-2 border-[#0A1628] animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Red Team Phishing Simulator</h1>
            <p className="text-xs text-slate-500">AI-powered adversarial phishing with psychological exploitation vectors</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-red-900/30 border-red-500/40 text-white shadow-lg shadow-red-900/10'
                  : 'bg-slate-800/20 border-slate-700/30 text-slate-400 hover:text-slate-300 hover:border-slate-600/40'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-red-400' : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[600px]">
        {activeTab === 'campaigns' && renderCampaigns()}
        {activeTab === 'lures' && renderLureGenerator()}
        {activeTab === 'targets' && renderTargets()}
        {activeTab === 'results' && renderResults()}
        {activeTab === 'psychprofiles' && renderPsychProfiles()}
      </div>
    </div>
  );
};

export default PhishingSimulator;
