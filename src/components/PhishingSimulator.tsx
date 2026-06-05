import { useState, useEffect, useCallback } from 'react';
import {
  Target, Brain, Users, Mail, Shield, Activity,
  AlertTriangle, Crosshair, Eye, Zap, TrendingUp,
  Clock, CheckCircle2, XCircle, Send, RefreshCw,
  BarChart3, Fingerprint, ChevronRight, Skull,
  ChevronDown, ChevronUp, Loader2, Sparkles,
  FileText, Lock, Briefcase, Heart, Flame
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TabId = 'campaigns' | 'targeted' | 'lures' | 'results' | 'psychprofiles';

interface RealUser {
  full_name: string;
  email: string;
  department: string;
  title: string;
  risk_score: number;
  openness_score: number;
  conscientiousness_score: number;
  extraversion_score: number;
  agreeableness_score: number;
  neuroticism_score: number;
  narcissism_score: number;
  machiavellianism_score: number;
  psychopathy_score: number;
  stress_level: number;
  burnout_risk: number;
  impulsivity_score: number;
  frustration_level: number;
  communication_style: string;
  overall_psychological_risk_score: number;
  risk_classification: string;
  dominant_emotion: string;
  is_social_engineering_risk: boolean;
  deception_likelihood_score: number;
  emotional_stability: number;
}

interface GeneratedPhish {
  subject: string;
  body: string;
  pretext: string;
  exploitedBiases: string[];
  threatActor: string;
  deliveryVector: string;
  urgencyLevel: number;
  estimatedSuccessRate: number;
  psychologicalHooks: string[];
  technicalPayload: string;
  timingRecommendation: string;
}

interface Campaign {
  id: string;
  name: string;
  threat_actor: string;
  status: 'draft' | 'active' | 'completed' | 'paused';
  targets_count: number;
  click_rate: number;
  created_at: string;
}

const THREAT_ACTORS = [
  { name: 'APT29 (Cozy Bear)', style: 'Sophisticated spear-phishing with geopolitical lures', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  { name: 'Lazarus Group', style: 'Job offer / recruitment themed lures', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  { name: 'Scattered Spider', style: 'IT helpdesk impersonation, MFA fatigue', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10' },
  { name: 'Fancy Bear (APT28)', style: 'Military/government impersonation', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  { name: 'FIN7', style: 'Financial/invoice-based social engineering', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
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
  { id: 'targeted', label: 'Targeted Attack', icon: Fingerprint },
  { id: 'lures', label: 'Lure Generator', icon: Mail },
  { id: 'results', label: 'Results & Analytics', icon: BarChart3 },
  { id: 'psychprofiles', label: 'Psych Exploitation', icon: Brain },
];

function deriveBestBiases(user: RealUser): string[] {
  const biases: { name: string; score: number }[] = [];
  if (user.neuroticism_score > 60) biases.push({ name: 'Fear', score: user.neuroticism_score + user.stress_level * 0.3 });
  if (user.stress_level > 60) biases.push({ name: 'Urgency', score: user.stress_level + user.frustration_level * 0.2 });
  if (user.narcissism_score > 50) biases.push({ name: 'Flattery', score: user.narcissism_score + user.extraversion_score * 0.2 });
  if (user.agreeableness_score > 55) biases.push({ name: 'Social Proof', score: user.agreeableness_score });
  if (user.openness_score > 55) biases.push({ name: 'Curiosity', score: user.openness_score });
  if (user.conscientiousness_score < 40) biases.push({ name: 'Scarcity', score: 100 - user.conscientiousness_score });
  if (user.machiavellianism_score > 50) biases.push({ name: 'Reciprocity', score: user.machiavellianism_score });
  biases.push({ name: 'Authority', score: 50 + (100 - user.emotional_stability) * 0.3 });
  return biases.sort((a, b) => b.score - a.score).slice(0, 3).map(b => b.name);
}

function deriveBestThreatActor(user: RealUser): string {
  if (user.department === 'Finance' || user.department === 'Finance Operations') return 'FIN7';
  if (user.narcissism_score > 55 || user.title.includes('Lead') || user.title.includes('Senior')) return 'Lazarus Group';
  if (user.stress_level > 70 && user.department === 'IT Operations') return 'Scattered Spider';
  if (user.risk_score > 70) return 'APT29 (Cozy Bear)';
  return 'Scattered Spider';
}

function generateTargetedPhish(user: RealUser): GeneratedPhish {
  const biases = deriveBestBiases(user);
  const actor = deriveBestThreatActor(user);
  const firstName = user.full_name.split(' ')[0];
  const baseSuccess = Math.min(95, 35 + (user.overall_psychological_risk_score * 0.4) + (user.stress_level * 0.15) + ((100 - user.emotional_stability) * 0.1));

  const templates: Record<string, () => GeneratedPhish> = {
    'FIN7': () => {
      const isInvoice = user.neuroticism_score > 60;
      return {
        subject: isInvoice
          ? `[URGENT] Wire Transfer Alert - $${(Math.random() * 80000 + 15000).toFixed(0)} flagged for immediate review`
          : `Re: Q3 Budget Reconciliation - Discrepancy Found - ${firstName} Action Required`,
        body: isInvoice
          ? `Hi ${firstName},\n\nOur fraud monitoring system flagged an outgoing wire transfer of $${(Math.random() * 80000 + 15000).toFixed(0)} from your cost center (CC-${user.department.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 900) + 100}) that exceeds your authorization threshold.\n\nIf you DID NOT authorize this transfer, you must cancel it within the next 45 minutes before it clears.\n\nIf you DID authorize it, please confirm by verifying your identity below.\n\n[REVIEW TRANSFER DETAILS]\n\nRegards,\nTreasury Operations - Automated Alert System\n\nRef: TXN-${Date.now().toString(36).toUpperCase()}`
          : `${firstName},\n\nDuring our monthly reconciliation, we found a $${(Math.random() * 12000 + 3000).toFixed(0)} discrepancy linked to PO-${Math.floor(Math.random() * 9000) + 1000} under your approval chain.\n\nThe CFO's office needs this resolved before the board meeting Thursday. I've attached the reconciliation report - can you pull up the original authorization in SAP and verify?\n\nThe portal link below will take you directly to the flagged transactions:\n\n[ACCESS RECONCILIATION PORTAL]\n\nPlease complete review within 2 hours to avoid escalation to the audit committee.\n\n- Finance Systems Team`,
        pretext: `Leverages ${firstName}'s financial role and ${user.stress_level > 70 ? 'high stress environment' : 'professional obligation'} to create urgency around monetary authorization`,
        exploitedBiases: biases,
        threatActor: 'FIN7',
        deliveryVector: 'Email (spoofed internal treasury domain)',
        urgencyLevel: user.stress_level > 70 ? 95 : 78,
        estimatedSuccessRate: Math.round(baseSuccess),
        psychologicalHooks: [
          `High neuroticism (${user.neuroticism_score}/100) = amplified fear of financial consequences`,
          `Stress level ${user.stress_level}/100 reduces critical evaluation time`,
          user.conscientiousness_score < 40 ? 'Low conscientiousness = likely to act without verifying' : 'Professional obligation to respond to financial discrepancies',
          `Frustration level ${user.frustration_level}/100 = reduced cognitive bandwidth for analysis`
        ],
        technicalPayload: 'Credential harvester mimicking internal SSO portal with SAP branding',
        timingRecommendation: user.burnout_risk > 70 ? 'Send at 4:45 PM (end of day, decision fatigue peak)' : 'Send Monday 9:15 AM (inbox overload, rapid triage mode)',
      };
    },
    'Lazarus Group': () => ({
      subject: user.narcissism_score > 55
        ? `Confidential: You've been nominated for the ${user.department} Innovation Award 2026`
        : `Exclusive opportunity - ${user.title} role at Series D startup ($${Math.floor(Math.random() * 200 + 250)}K+ TC)`,
      body: user.narcissism_score > 55
        ? `Dear ${firstName},\n\nI'm reaching out from the Industry Leadership Council. Your contributions to ${user.department} have been recognized by your peers, and you've been nominated for our 2026 Innovation Excellence Award.\n\nPrevious recipients include CTOs from Fortune 100 companies. The nomination committee was particularly impressed by your architectural leadership.\n\nTo accept your nomination and complete the verification process:\n\n[ACCEPT NOMINATION]\n\nThe ceremony is invitation-only, held at the Four Seasons, San Francisco. Travel and accommodation will be arranged.\n\nPlease respond within 48 hours as we have limited finalist slots.\n\nWarm regards,\nDr. Katherine Morrison\nChair, Industry Leadership Council`
        : `Hi ${firstName},\n\nI'm a senior recruiter at Apex Search Partners. We're conducting a confidential search for a ${user.title} at a well-funded Series D company disrupting the ${user.department.toLowerCase()} space.\n\nComp band: $${Math.floor(Math.random() * 200 + 250)}K base + significant equity (0.3-0.8% pre-IPO)\n\nYour background is an exceptional match. Would you be open to a brief, confidential call?\n\nI've prepared a detailed role overview:\n\n[VIEW OPPORTUNITY DETAILS]\n\nThis search closes Friday - they're looking to extend offers next week.\n\nBest,\nAlex Chen\nManaging Director, Apex Search Partners`,
      pretext: `Targets ${firstName}'s ${user.narcissism_score > 55 ? 'narcissistic tendencies and need for recognition' : 'career ambition and openness to new opportunities'}`,
      exploitedBiases: biases,
      threatActor: 'Lazarus Group',
      deliveryVector: 'LinkedIn InMail + follow-up email',
      urgencyLevel: 62,
      estimatedSuccessRate: Math.round(baseSuccess * (user.narcissism_score > 55 ? 1.15 : 1.0)),
      psychologicalHooks: [
        `Narcissism ${user.narcissism_score}/100 = ${user.narcissism_score > 55 ? 'highly susceptible to flattery and recognition' : 'moderate ego appeal effective'}`,
        `Openness ${user.openness_score}/100 = ${user.openness_score > 50 ? 'receptive to novel opportunities' : 'may need stronger hook'}`,
        `Extraversion ${user.extraversion_score}/100 = networking-oriented, likely to engage`,
        user.burnout_risk > 60 ? `Burnout risk ${user.burnout_risk}/100 = actively seeking escape/change` : `Professional ambition as primary motivator`
      ],
      technicalPayload: 'Malicious PDF "role overview" with embedded DLL sideload (CVE-2024-XXXX)',
      timingRecommendation: user.frustration_level > 60 ? 'Send after negative performance review cycle (detected via communication sentiment)' : 'Send mid-week when engagement is highest',
    }),
    'Scattered Spider': () => ({
      subject: user.stress_level > 70
        ? `[CRITICAL] Your account will be locked in 15 minutes - MFA policy violation`
        : `IT Security: Mandatory password rotation - ${firstName}, you're overdue`,
      body: user.stress_level > 70
        ? `Hi ${firstName},\n\nThis is an automated alert from IT Security.\n\nYour account (${user.email}) has been flagged for an MFA policy violation. Per our updated security policy (SEC-2026-041), accounts with non-compliant MFA configurations will be LOCKED in 15 minutes.\n\nThis will affect:\n- Email access\n- VPN connectivity\n- All SSO applications (Slack, Jira, GitHub, etc.)\n- Badge access systems\n\nTo resolve immediately:\n\n[RE-ENROLL MFA NOW]\n\nIf you believe this is in error, you can appeal after re-enrollment. Note: IT cannot manually override the lockout timer.\n\nIT Security Operations\nRef: INC-${Math.floor(Math.random() * 9000) + 1000}`
        : `Hey ${firstName},\n\nThis is Mike from the IT Security team. I noticed you haven't completed the mandatory password rotation that was due last Friday.\n\nI've been getting pressure from management to get everyone compliant before the audit next week. You're one of the last 3 people in ${user.department} who hasn't done it.\n\nCan you take 2 minutes to update it? I set up a quick link that takes you straight to the portal:\n\n[UPDATE PASSWORD]\n\nThanks! Let me know if you hit any issues.\n\n- Mike R.\nIT Security Team`,
      pretext: `Exploits ${firstName}'s ${user.stress_level > 70 ? 'elevated stress state to create panic-driven compliance' : 'social obligation and fear of being non-compliant'}`,
      exploitedBiases: biases,
      threatActor: 'Scattered Spider',
      deliveryVector: user.stress_level > 70 ? 'Email + SMS confirmation code request (multi-channel)' : 'Casual email mimicking internal IT comms style',
      urgencyLevel: user.stress_level > 70 ? 92 : 65,
      estimatedSuccessRate: Math.round(baseSuccess * 1.05),
      psychologicalHooks: [
        `Stress level ${user.stress_level}/100 = ${user.stress_level > 70 ? 'severely impaired judgment under time pressure' : 'moderate susceptibility to urgency tactics'}`,
        `Emotional stability ${user.emotional_stability}/100 = ${user.emotional_stability < 40 ? 'highly reactive to threats' : 'may need stronger urgency cue'}`,
        `Social proof leverage: "last 3 people in ${user.department}" creates conformity pressure`,
        user.impulsivity_score > 60 ? `Impulsivity ${user.impulsivity_score}/100 = likely to click without verifying` : 'May pause to verify - add phone call follow-up'
      ],
      technicalPayload: 'Adversary-in-the-middle (AitM) proxy capturing session tokens + MFA codes',
      timingRecommendation: user.stress_level > 70 ? 'Send during peak workload (11:30 AM, multiple meetings scheduled)' : 'Send Friday 4 PM (end-of-week compliance fatigue)',
    }),
    'APT29 (Cozy Bear)': () => ({
      subject: `[CONFIDENTIAL] Security Incident Affecting ${user.department} - Immediate Action Required`,
      body: `${firstName},\n\nThis is a confidential notification from the CISO's office.\n\nWe've identified a sophisticated intrusion that may have compromised credentials for ${user.department} team members. Your account was flagged during our forensic analysis.\n\nDue to the sensitivity of this investigation:\n- Do NOT discuss with colleagues (active investigation)\n- Do NOT change your password through normal channels (attacker may have password reset monitoring)\n- Use ONLY the secure remediation portal below\n\n[ACCESS SECURE REMEDIATION PORTAL]\n\nA senior analyst will guide you through the verification process. Expected time: 3-5 minutes.\n\nThis notification is being sent to affected individuals only. Failure to complete remediation within 4 hours will result in precautionary account suspension.\n\nDeputy CISO - Incident Response Team\nClassification: INTERNAL - CONFIDENTIAL\nCase: IR-2026-${Math.floor(Math.random() * 900) + 100}`,
      pretext: `Weaponizes ${firstName}'s fear response and respect for authority while isolating them from peer verification through secrecy requirement`,
      exploitedBiases: biases,
      threatActor: 'APT29 (Cozy Bear)',
      deliveryVector: 'Internal-appearing email (compromised vendor relay) with TLS certificate validation',
      urgencyLevel: 88,
      estimatedSuccessRate: Math.round(baseSuccess * 1.1),
      psychologicalHooks: [
        `Neuroticism ${user.neuroticism_score}/100 + Fear vector = amplified threat response`,
        `Authority compliance: "CISO's office" + classification markings trigger obedience`,
        `Isolation tactic: "Do NOT discuss" prevents peer verification that ${user.agreeableness_score > 50 ? 'this highly agreeable user would normally seek' : 'could expose the lure'}`,
        `${user.dominant_emotion === 'anxiety' ? 'Pre-existing anxiety state primes fear response' : user.dominant_emotion === 'frustration' ? 'Frustration state reduces analytical thinking' : 'Neutral emotional state still vulnerable to authority + urgency combo'}`
      ],
      technicalPayload: 'Credential harvester + session hijack via evilginx2 proxy infrastructure',
      timingRecommendation: 'Send during actual security incident (piggyback on real alert fatigue)',
    }),
    'Fancy Bear (APT28)': () => ({
      subject: `Invitation: ${user.department} Strategy Review with Board Members - ${firstName} Required`,
      body: `Dear ${firstName},\n\nYou've been selected to present your team's Q3 achievements at the upcoming Board Strategy Review.\n\nThe executive team specifically requested your attendance based on your recent contributions. This is a significant opportunity for visibility with senior leadership.\n\nMeeting Details:\n- Date: Next Thursday, 2:00 PM EST\n- Duration: 45 minutes (your slot: 10 min presentation + 5 min Q&A)\n- Attendees: CEO, CFO, Board Chair, 3 independent directors\n\nPlease review the briefing materials and confirm attendance:\n\n[ACCESS BRIEFING MATERIALS & CONFIRM]\n\nNote: Presentation template and talking points are pre-loaded. Please customize with your metrics by Tuesday EOD.\n\nRegards,\nExecutive Office Coordination`,
      pretext: `Leverages ${firstName}'s ${user.narcissism_score > 50 ? 'narcissistic need for recognition and status' : 'professional ambition'} combined with authority of board-level invitation`,
      exploitedBiases: biases,
      threatActor: 'Fancy Bear (APT28)',
      deliveryVector: 'Spoofed executive assistant email with calendar invite attachment',
      urgencyLevel: 70,
      estimatedSuccessRate: Math.round(baseSuccess * 0.95),
      psychologicalHooks: [
        `Flattery vector: "specifically requested your attendance" targets narcissism (${user.narcissism_score}/100)`,
        `Career advancement hook exploits ambition in ${user.title} role`,
        `Authority + Social Proof: Board members + CEO create irresistible compliance pressure`,
        `Time constraint (Tuesday EOD) creates just enough urgency without triggering suspicion`
      ],
      technicalPayload: '.ics calendar invite with embedded macro in attached "briefing doc" (.docm)',
      timingRecommendation: 'Send Monday morning to maximize engagement window before "Tuesday deadline"',
    }),
  };

  const generator = templates[actor] || templates['APT29 (Cozy Bear)'];
  return generator();
}

const PhishingSimulator = () => {
  const [activeTab, setActiveTab] = useState<TabId>('targeted');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<RealUser | null>(null);
  const [generatedPhish, setGeneratedPhish] = useState<GeneratedPhish | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [selectedThreatActor, setSelectedThreatActor] = useState(THREAT_ACTORS[0].name);
  const [selectedBias, setSelectedBias] = useState('Authority');
  const [generatingLure, setGeneratingLure] = useState(false);
  const [generatedLure, setGeneratedLure] = useState<string | null>(null);

  useEffect(() => {
    loadRealUsers();
    loadCampaigns();
  }, []);

  const loadRealUsers = async () => {
    const { data } = await supabase.rpc('get_users_with_psych_profiles').select('*');
    if (data && data.length > 0) {
      setRealUsers(data);
    } else {
      const { data: joined } = await supabase
        .from('user_psychological_profiles')
        .select(`
          user_id,
          openness_score, conscientiousness_score, extraversion_score,
          agreeableness_score, neuroticism_score, narcissism_score,
          machiavellianism_score, psychopathy_score, stress_level,
          burnout_risk, impulsivity_score, frustration_level,
          communication_style, overall_psychological_risk_score,
          risk_classification, dominant_emotion, is_social_engineering_risk,
          deception_likelihood_score, emotional_stability
        `)
        .order('overall_psychological_risk_score', { ascending: false })
        .limit(20);

      if (joined && joined.length > 0) {
        const userIds = joined.map((j: any) => j.user_id);
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, department, title, risk_score')
          .in('id', userIds);

        if (profiles) {
          const merged = joined.map((j: any) => {
            const profile = profiles.find((p: any) => p.id === j.user_id);
            return {
              ...j,
              full_name: profile?.full_name || 'Unknown',
              email: profile?.email || 'unknown@company.com',
              department: profile?.department || 'Unknown',
              title: profile?.title || 'Employee',
              risk_score: parseFloat(profile?.risk_score) || 50,
            };
          });
          setRealUsers(merged);
        }
      }
    }
  };

  const loadCampaigns = async () => {
    setCampaigns([
      { id: '1', name: 'Q2 Executive Spear-Phish (Psych-Targeted)', threat_actor: 'APT29 (Cozy Bear)', status: 'active', targets_count: 11, click_rate: 36.4, created_at: '2026-05-28' },
      { id: '2', name: 'IT Ops MFA Fatigue - Stress-Timed', threat_actor: 'Scattered Spider', status: 'active', targets_count: 6, click_rate: 50.0, created_at: '2026-05-30' },
      { id: '3', name: 'Finance Invoice Fraud - Burnout Window', threat_actor: 'FIN7', status: 'completed', targets_count: 4, click_rate: 75.0, created_at: '2026-05-15' },
      { id: '4', name: 'Recruitment Lure - Narcissism Targets', threat_actor: 'Lazarus Group', status: 'active', targets_count: 5, click_rate: 40.0, created_at: '2026-06-01' },
      { id: '5', name: 'Board Invitation - Authority Vector', threat_actor: 'Fancy Bear (APT28)', status: 'draft', targets_count: 3, click_rate: 0, created_at: '2026-06-03' },
    ]);
  };

  const handleGeneratePhish = useCallback((user: RealUser) => {
    setSelectedUser(user);
    setIsGenerating(true);
    setGeneratedPhish(null);
    setGenerationStep(0);

    const steps = [
      { delay: 400, step: 1 },
      { delay: 900, step: 2 },
      { delay: 1400, step: 3 },
      { delay: 1900, step: 4 },
      { delay: 2400, step: 5 },
    ];

    steps.forEach(({ delay, step }) => {
      setTimeout(() => setGenerationStep(step), delay);
    });

    setTimeout(() => {
      const phish = generateTargetedPhish(user);
      setGeneratedPhish(phish);
      setIsGenerating(false);
      setGenerationStep(0);
    }, 2800);
  }, []);

  const generateLure = () => {
    setGeneratingLure(true);
    setGeneratedLure(null);
    setTimeout(() => {
      const lures: Record<string, Record<string, string>> = {
        'APT29 (Cozy Bear)': {
          'Authority': 'Subject: [URGENT] National Security Briefing - Your Clearance Required\n\nDear {target},\n\nThe Office of the Director of National Intelligence requires your immediate review of classified material relating to ongoing operations.\n\n[AUTHENTICATE NOW]',
          'Curiosity': 'Subject: Confidential - Eyes Only: Project NIGHTSHADE Update\n\nThe attached intelligence summary contains information relevant to your current assignment. This link will expire in 2 hours.\n\n[VIEW CLASSIFIED BRIEF]',
          'Fear': 'Subject: CRITICAL: Your credentials compromised in supply chain attack\n\nOur threat intel team confirmed your AD credentials were exfiltrated. Immediate rotation required.\n\n[SECURE YOUR ACCOUNT]',
        },
        'Scattered Spider': {
          'Authority': 'Subject: IT Security - Mandatory MFA Reset (Action Required)\n\nHi {target},\n\nThis is Alex from IT Security. We\'re rolling out enhanced MFA following a recent incident.\n\n[RESET MFA NOW]',
          'Urgency': 'Subject: [CRITICAL] Your Okta session expires in 15 minutes\n\nAutomatic notification: Your SSO session will terminate. All active work will be lost.\n\n[EXTEND SESSION]',
          'Social Proof': 'Subject: Re: Team MFA migration - you\'re the last one!\n\nHey, everyone else already completed their migration. Link below.\n\n[COMPLETE MIGRATION]',
        },
        'Lazarus Group': {
          'Curiosity': 'Subject: Exclusive Opportunity - Senior Architect at stealth startup ($350K+ TC)\n\nI came across your profile and was impressed. We have an exciting senior role.\n\n[VIEW OPPORTUNITY]',
          'Flattery': 'Subject: You\'ve been nominated for Industry Leader Award 2026\n\nBased on peer nominations, you\'ve been selected as a finalist.\n\n[ACCEPT NOMINATION]',
        },
        'FIN7': {
          'Authority': 'Subject: Invoice #INV-2026-4891 - Payment Overdue - Legal Action Pending\n\nFinal notice regarding unpaid invoice ($47,832.00). Escalation in 24 hours.\n\n[VIEW INVOICE & PAY NOW]',
          'Fear': 'Subject: Wire Transfer Alert - $89,500 flagged for fraud\n\nA wire transfer from your account was flagged. Click immediately to halt.\n\n[CANCEL TRANSFER]',
        },
        'Fancy Bear (APT28)': {
          'Authority': 'Subject: Classified Briefing Invitation - NATO Cybersecurity Summit\n\nYour expertise has been requested for a classified pre-summit briefing.\n\n[ACCESS SECURE BRIEFING ROOM]',
          'Curiosity': 'Subject: Leaked: Internal assessment of your organization\'s security posture\n\nA confidential assessment was leaked to a Telegram channel. Verify exposure.\n\n[VIEW LEAKED DOCUMENT]',
        },
      };
      const actorLures = lures[selectedThreatActor] || lures['APT29 (Cozy Bear)'];
      const lure = actorLures[selectedBias] || actorLures[Object.keys(actorLures)[0]] || 'Generated lure...';
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

  const renderTargetedAttack = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-red-900/20 via-slate-900/40 to-orange-900/10 border border-red-500/20 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/30 to-orange-500/20 border border-red-500/30 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Psychological Profile-Based Targeting Engine</h3>
            <p className="text-xs text-slate-400">Select a user to generate a hyper-personalized phishing attack vector based on their psychological profile, stress indicators, cognitive biases, and behavioral patterns</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200">Target Selection - Real User Profiles</h4>
            <span className="text-[10px] text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">{realUsers.length} profiles loaded</span>
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
            {realUsers.map((user) => {
              const biases = deriveBestBiases(user);
              const isSelected = selectedUser?.email === user.email;
              return (
                <button
                  key={user.email}
                  onClick={() => handleGeneratePhish(user)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20 shadow-lg shadow-red-900/10'
                      : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        user.overall_psychological_risk_score >= 70 ? 'bg-red-500/20 border border-red-500/30' :
                        user.overall_psychological_risk_score >= 55 ? 'bg-amber-500/20 border border-amber-500/30' :
                        'bg-slate-700/50 border border-slate-600/30'
                      }`}>
                        <span className={`text-xs font-bold ${
                          user.overall_psychological_risk_score >= 70 ? 'text-red-400' :
                          user.overall_psychological_risk_score >= 55 ? 'text-amber-400' :
                          'text-slate-400'
                        }`}>{user.full_name.split(' ').map(n => n[0]).join('')}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{user.full_name}</div>
                        <div className="text-[10px] text-slate-500">{user.title} - {user.department}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold tabular-nums ${
                        user.overall_psychological_risk_score >= 70 ? 'text-red-400' :
                        user.overall_psychological_risk_score >= 55 ? 'text-amber-400' :
                        'text-emerald-400'
                      }`}>{user.overall_psychological_risk_score}</div>
                      <div className="text-[9px] text-slate-600">VULN SCORE</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {[
                      { label: 'O', val: user.openness_score },
                      { label: 'C', val: user.conscientiousness_score },
                      { label: 'E', val: user.extraversion_score },
                      { label: 'A', val: user.agreeableness_score },
                      { label: 'N', val: user.neuroticism_score },
                    ].map((t) => (
                      <div key={t.label} className="text-center">
                        <div className="h-6 bg-slate-700/40 rounded-sm relative overflow-hidden">
                          <div className={`absolute bottom-0 w-full rounded-sm ${
                            t.val > 65 ? 'bg-red-500/50' : t.val > 45 ? 'bg-amber-500/40' : 'bg-emerald-500/40'
                          }`} style={{ height: `${t.val}%` }} />
                        </div>
                        <span className="text-[8px] text-slate-600">{t.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {biases.map((b) => (
                      <span key={b} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        {b}
                      </span>
                    ))}
                    {user.stress_level > 65 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        HIGH STRESS
                      </span>
                    )}
                    {user.is_social_engineering_risk && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/15 text-red-300 border border-red-500/25">
                        SE RISK
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {isGenerating && (
            <div className="bg-slate-800/40 border border-red-500/20 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
                <span className="text-sm font-semibold text-white">Generating Targeted Attack Vector...</span>
              </div>
              {[
                { step: 1, label: 'Analyzing Big Five personality traits', icon: Brain },
                { step: 2, label: 'Mapping Dark Triad indicators', icon: Skull },
                { step: 3, label: 'Correlating stress & burnout signals', icon: Flame },
                { step: 4, label: 'Selecting optimal cognitive bias vector', icon: Target },
                { step: 5, label: 'Crafting personalized payload', icon: Mail },
              ].map((s) => {
                const Icon = s.icon;
                const isActive = generationStep === s.step;
                const isDone = generationStep > s.step;
                return (
                  <div key={s.step} className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all ${
                    isActive ? 'bg-red-500/10 border border-red-500/20' : isDone ? 'opacity-60' : 'opacity-30'
                  }`}>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-red-400 animate-spin flex-shrink-0" />
                    ) : (
                      <Icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    )}
                    <span className={`text-xs ${isActive ? 'text-white font-medium' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {generatedPhish && selectedUser && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-red-500/30 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-red-500/10 to-orange-500/5 px-5 py-3 border-b border-red-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Generated Targeted Phish</span>
                  </div>
                  <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] font-bold text-red-300">
                    {generatedPhish.estimatedSuccessRate}% SUCCESS RATE
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-700/30">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Target:</span>
                      <span className="text-xs font-medium text-white">{selectedUser.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Actor:</span>
                      <span className="text-xs font-medium text-red-400">{generatedPhish.threatActor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Vector:</span>
                      <span className="text-xs text-cyan-400">{generatedPhish.deliveryVector}</span>
                    </div>
                  </div>

                  <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700/20">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] text-slate-500">SUBJECT:</span>
                      <span className="text-xs font-medium text-white">{generatedPhish.subject}</span>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{generatedPhish.body}</pre>
                  </div>

                  <div className="bg-slate-800/40 rounded-lg p-4 border border-amber-500/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pretext Analysis</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{generatedPhish.pretext}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/20">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1.5">Exploited Biases</span>
                      <div className="flex flex-wrap gap-1">
                        {generatedPhish.exploitedBiases.map((b) => (
                          <span key={b} className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">{b}</span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/20">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1.5">Urgency Level</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            generatedPhish.urgencyLevel > 80 ? 'bg-red-500' :
                            generatedPhish.urgencyLevel > 60 ? 'bg-amber-500' : 'bg-blue-500'
                          }`} style={{ width: `${generatedPhish.urgencyLevel}%` }} />
                        </div>
                        <span className="text-xs font-bold text-white tabular-nums">{generatedPhish.urgencyLevel}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 rounded-lg p-4 border border-cyan-500/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Psychological Attack Hooks</span>
                    </div>
                    <ul className="space-y-2">
                      {generatedPhish.psychologicalHooks.map((hook, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                          <span className="text-xs text-slate-400 leading-relaxed">{hook}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/20">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Technical Payload</span>
                      <span className="text-xs text-red-400">{generatedPhish.technicalPayload}</span>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/20">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Optimal Timing</span>
                      <span className="text-xs text-emerald-400">{generatedPhish.timingRecommendation}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors flex items-center gap-2">
                      <Send className="w-3.5 h-3.5" /> Deploy to Campaign
                    </button>
                    <button
                      onClick={() => handleGeneratePhish(selectedUser)}
                      className="px-4 py-2 bg-slate-700/50 border border-slate-600/30 rounded-lg text-slate-300 text-xs font-medium hover:bg-slate-700/70 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                    <button className="px-4 py-2 bg-slate-700/50 border border-slate-600/30 rounded-lg text-slate-300 text-xs font-medium hover:bg-slate-700/70 transition-colors flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Export Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isGenerating && !generatedPhish && (
            <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700/40 flex items-center justify-center mb-4">
                <Target className="w-7 h-7 text-slate-600" />
              </div>
              <h4 className="text-sm font-medium text-slate-400 mb-1">Select a Target Profile</h4>
              <p className="text-xs text-slate-600 max-w-sm">Click any user from the list to generate a hyper-personalized phishing attack crafted from their psychological vulnerability profile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderCampaigns = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Psych-Targeted Campaigns</h3>
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
                    <div className="h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full transition-all" style={{ width: `${campaign.click_rate}%` }} />
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

      <button
        onClick={generateLure}
        disabled={generatingLure}
        className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg text-white text-sm font-medium hover:from-red-500 hover:to-orange-500 transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {generatingLure ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        {generatingLure ? 'Generating...' : 'Generate Adversarial Lure'}
      </button>

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

  const renderResults = () => {
    const metrics = [
      { label: 'Total Sent', value: '1,247', change: '+156', color: 'text-blue-400' },
      { label: 'Click Rate', value: '36.8%', change: '+12.1%', color: 'text-amber-400' },
      { label: 'Credential Harvest', value: '24.3%', change: '+8.8%', color: 'text-red-400' },
      { label: 'Report Rate', value: '18.1%', change: '-5.3%', color: 'text-emerald-400' },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-red-900/10 to-transparent border border-red-500/10 rounded-xl p-4">
          <p className="text-xs text-slate-400">
            <span className="text-red-400 font-semibold">Psych-targeted campaigns show 2.2x higher success rate</span> vs generic phishing.
            Users with stress levels above 70 and neuroticism above 60 are 3.1x more likely to click within the first 5 minutes.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">{m.label}</div>
              <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              <div className={`text-[10px] mt-0.5 ${m.change.startsWith('+') ? 'text-red-400' : 'text-emerald-400'}`}>{m.change} vs generic</div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Bias Effectiveness vs Psychological Profile Match</h4>
          <div className="grid grid-cols-4 gap-3">
            {COGNITIVE_BIASES.slice(0, 8).map((bias, i) => {
              const generic = [18, 22, 14, 25, 12, 16, 19, 11][i];
              const targeted = [72, 89, 54, 91, 38, 63, 77, 45][i];
              return (
                <div key={bias.name} className="text-center">
                  <div className="h-20 bg-slate-700/30 rounded-lg relative overflow-hidden mb-1 flex items-end">
                    <div className="w-1/2 relative h-full flex items-end justify-center">
                      <div className="w-3/4 bg-slate-600/50 rounded-sm" style={{ height: `${generic}%` }} />
                    </div>
                    <div className="w-1/2 relative h-full flex items-end justify-center">
                      <div className={`w-3/4 rounded-sm ${targeted > 70 ? 'bg-red-500/60' : targeted > 50 ? 'bg-amber-500/60' : 'bg-emerald-500/60'}`} style={{ height: `${targeted}%` }} />
                    </div>
                  </div>
                  <span className="text-[9px] text-slate-500">{bias.name}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/30">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-slate-600/50 rounded-sm" /><span className="text-[10px] text-slate-500">Generic</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-red-500/60 rounded-sm" /><span className="text-[10px] text-slate-500">Psych-Targeted</span></div>
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-4">User Susceptibility Rankings (Post-Campaign)</h4>
          <div className="space-y-2">
            {realUsers.slice(0, 6).map((user, i) => (
              <div key={user.email} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-800/30">
                <span className="text-[10px] text-slate-600 w-4">#{i + 1}</span>
                <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400">{user.full_name.split(' ').map(n => n[0]).join('')}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{user.full_name}</div>
                  <div className="text-[10px] text-slate-500">{user.department}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${
                      user.overall_psychological_risk_score > 70 ? 'bg-red-500' :
                      user.overall_psychological_risk_score > 55 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} style={{ width: `${user.overall_psychological_risk_score}%` }} />
                  </div>
                  <span className={`text-xs font-mono font-bold ${
                    user.overall_psychological_risk_score > 70 ? 'text-red-400' :
                    user.overall_psychological_risk_score > 55 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{user.overall_psychological_risk_score}</span>
                </div>
              </div>
            ))}
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
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Low Conscientiousness + Impulsivity</div>
            <div className="text-xs text-cyan-400 font-medium">Curiosity/Scarcity vectors</div>
            <div className="text-[10px] text-slate-500 mt-1">74% success when combined</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {realUsers.slice(0, 6).map((user) => {
          const biases = deriveBestBiases(user);
          const actor = deriveBestThreatActor(user);
          const susceptibility = Math.min(99, Math.round(35 + (user.overall_psychological_risk_score * 0.4) + (user.stress_level * 0.15) + ((100 - user.emotional_stability) * 0.1)));
          return (
            <div key={user.email} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    susceptibility > 70 ? 'bg-red-500/20 border border-red-500/30' :
                    susceptibility > 55 ? 'bg-amber-500/20 border border-amber-500/30' :
                    'bg-slate-700/50 border border-slate-600/30'
                  }`}>
                    <span className={`text-xs font-bold ${
                      susceptibility > 70 ? 'text-red-400' : susceptibility > 55 ? 'text-amber-400' : 'text-slate-400'
                    }`}>{user.full_name.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{user.full_name}</h4>
                    <p className="text-[10px] text-slate-500">{user.title} - {user.department}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${susceptibility > 70 ? 'text-red-400' : susceptibility > 55 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {susceptibility}%
                  </div>
                  <div className="text-[9px] text-slate-500">Susceptibility</div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {[
                  { label: 'Open', val: user.openness_score },
                  { label: 'Consc', val: user.conscientiousness_score },
                  { label: 'Extra', val: user.extraversion_score },
                  { label: 'Agree', val: user.agreeableness_score },
                  { label: 'Neuro', val: user.neuroticism_score },
                ].map((t) => (
                  <div key={t.label} className="text-center">
                    <div className="h-10 bg-slate-700/30 rounded relative overflow-hidden">
                      <div className={`absolute bottom-0 w-full rounded ${
                        t.val > 65 ? 'bg-gradient-to-t from-red-500/50 to-red-500/10' :
                        t.val > 45 ? 'bg-gradient-to-t from-amber-500/40 to-amber-500/10' :
                        'bg-gradient-to-t from-emerald-500/40 to-emerald-500/10'
                      }`} style={{ height: `${t.val}%` }} />
                    </div>
                    <span className="text-[8px] text-slate-600 mt-0.5 block">{t.label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Best Attack Vector</span>
                  <span className="text-red-400 font-medium">{biases[0]}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Recommended TTP</span>
                  <span className="text-cyan-400 font-medium">{actor.split(' (')[0]}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Stress Amplifier</span>
                  <span className="text-amber-400 font-medium">+{Math.round(user.stress_level * 0.3)}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {biases.map((b) => (
                  <span key={b} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">{b}</span>
                ))}
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-500/20 text-slate-400 border border-slate-500/20">
                  DT: {Math.round((user.narcissism_score + user.machiavellianism_score + user.psychopathy_score) / 3)}%
                </span>
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
            <p className="text-xs text-slate-500">AI-powered adversarial phishing with psychological exploitation vectors - real user targeting</p>
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
        {activeTab === 'targeted' && renderTargetedAttack()}
        {activeTab === 'lures' && renderLureGenerator()}
        {activeTab === 'results' && renderResults()}
        {activeTab === 'psychprofiles' && renderPsychProfiles()}
      </div>
    </div>
  );
};

export default PhishingSimulator;
