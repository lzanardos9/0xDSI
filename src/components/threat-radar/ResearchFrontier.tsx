import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BookOpen, Microscope, Cpu, FlaskConical, ChevronRight,
  ArrowUpRight, Lightbulb, Rocket, Clock, CheckCircle2, Eye,
  XCircle, Filter, Sparkles, GraduationCap, BrainCircuit,
  Shield, Target, Layers, TrendingUp
} from 'lucide-react';

type Publication = {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  venue_type: string;
  published_date: string;
  abstract: string;
  doi: string | null;
  arxiv_id: string | null;
  keywords: string[];
  relevance_score: number;
  category: string;
  mitre_techniques: string[];
  summary_tldr: string;
  status: string;
};

type Proposal = {
  id: string;
  publication_id: string;
  proposed_name: string;
  proposed_type: string;
  description: string;
  rationale: string;
  mitre_coverage: string[];
  implementation_complexity: string;
  estimated_days: number;
  priority_score: number;
  status: string;
  created_at: string;
  reviewed_by: string | null;
  review_notes: string | null;
};

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  detection_technique: { label: 'Detection', color: 'emerald', icon: Shield },
  novel_attack: { label: 'Novel Attack', color: 'red', icon: Target },
  evasion_method: { label: 'Evasion', color: 'amber', icon: Layers },
  ml_security: { label: 'ML Security', color: 'cyan', icon: BrainCircuit },
  threat_intelligence: { label: 'Threat Intel', color: 'blue', icon: Eye },
  incident_response: { label: 'IR/Forensics', color: 'teal', icon: Microscope },
  forensics: { label: 'Forensics', color: 'slate', icon: Microscope },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'DRAFT', cls: 'bg-slate-700/40 border-slate-600 text-slate-300' },
  under_review: { label: 'REVIEWING', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-200' },
  approved: { label: 'APPROVED', cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' },
  shipped: { label: 'SHIPPED', cls: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200' },
  dismissed: { label: 'DISMISSED', cls: 'bg-red-500/10 border-red-500/30 text-red-300' },
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  agent: { label: 'Agent', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  detection_rule: { label: 'Detection Rule', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  correlation_engine: { label: 'Correlation', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  pipeline: { label: 'Pipeline', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  ml_model: { label: 'ML Model', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const COMPLEXITY_COLOR: Record<string, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  research: 'text-red-400',
};

export default function ResearchFrontier() {
  const [papers, setPapers] = useState<Publication[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState<Publication | null>(null);
  const [view, setView] = useState<'papers' | 'proposals'>('papers');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [papersRes, proposalsRes] = await Promise.all([
      supabase.from('academic_publications').select('*').order('relevance_score', { ascending: false }),
      supabase.from('research_capability_proposals').select('*').order('priority_score', { ascending: false }),
    ]);
    setPapers(papersRes.data || []);
    setProposals(proposalsRes.data || []);
    setLoading(false);
  };

  const filteredPapers = useMemo(() => {
    let result = papers;
    if (categoryFilter !== 'all') result = result.filter(p => p.category === categoryFilter);
    return result;
  }, [papers, categoryFilter]);

  const filteredProposals = useMemo(() => {
    let result = proposals;
    if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
    return result;
  }, [proposals, statusFilter]);

  const paperProposals = useMemo(() => {
    if (!selectedPaper) return [];
    return proposals.filter(p => p.publication_id === selectedPaper.id);
  }, [selectedPaper, proposals]);

  const stats = useMemo(() => ({
    total: papers.length,
    actionable: papers.filter(p => p.status === 'actionable').length,
    proposals: proposals.length,
    approved: proposals.filter(p => p.status === 'approved').length,
    avgRelevance: papers.length ? Math.round(papers.reduce((s, p) => s + Number(p.relevance_score), 0) / papers.length) : 0,
  }), [papers, proposals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span>Loading research intelligence...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={BookOpen} label="Papers Ingested" value={stats.total} color="cyan" />
        <StatCard icon={Lightbulb} label="Actionable" value={stats.actionable} color="amber" />
        <StatCard icon={Rocket} label="Proposals" value={stats.proposals} color="emerald" />
        <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} color="green" />
        <StatCard icon={TrendingUp} label="Avg Relevance" value={`${stats.avgRelevance}%`} color="blue" />
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('papers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            view === 'papers'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
              : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Academic Papers
        </button>
        <button
          onClick={() => setView('proposals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            view === 'proposals'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
              : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          Capability Proposals ({proposals.length})
        </button>
      </div>

      {view === 'papers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
          {/* Paper List */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-slate-500" />
              {['all', 'detection_technique', 'novel_attack', 'evasion_method', 'ml_security', 'threat_intelligence', 'incident_response'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    categoryFilter === cat
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_META[cat]?.label || cat}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredPapers.map(paper => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  isSelected={selectedPaper?.id === paper.id}
                  proposalCount={proposals.filter(p => p.publication_id === paper.id).length}
                  onClick={() => setSelectedPaper(paper)}
                />
              ))}
            </div>
          </div>

          {/* Paper Detail */}
          {selectedPaper ? (
            <PaperDetail paper={selectedPaper} proposals={paperProposals} />
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a paper to see details and AI-proposed capabilities</p>
            </div>
          )}
        </div>
      ) : (
        <ProposalBoard proposals={filteredProposals} papers={papers} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof BookOpen; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/30 text-cyan-300',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/30 text-amber-300',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 text-emerald-300',
    green: 'from-green-500/10 to-green-500/5 border-green-500/30 text-green-300',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/30 text-blue-300',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function PaperCard({ paper, isSelected, proposalCount, onClick }: {
  paper: Publication;
  isSelected: boolean;
  proposalCount: number;
  onClick: () => void;
}) {
  const cat = CATEGORY_META[paper.category] || CATEGORY_META.detection_technique;
  const CatIcon = cat.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition group ${
        isSelected
          ? 'bg-cyan-500/10 border-cyan-500/40'
          : 'bg-slate-900/40 border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-1.5 rounded-lg bg-${cat.color}-500/15 border border-${cat.color}-500/30 shrink-0`}>
          <CatIcon className={`w-3.5 h-3.5 text-${cat.color}-400`} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white leading-tight line-clamp-2 group-hover:text-cyan-100 transition">
            {paper.title}
          </h4>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400">{paper.venue}</span>
            <span className="text-[10px] text-slate-600">|</span>
            <span className="text-[10px] text-slate-500">{paper.published_date}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-${cat.color}-500/15 text-${cat.color}-300 border border-${cat.color}-500/30`}>
              {cat.label}
            </span>
            <span className="text-[10px] text-slate-500">
              Relevance: <span className="text-white font-bold">{paper.relevance_score}%</span>
            </span>
            {proposalCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Lightbulb className="w-2.5 h-2.5" />
                {proposalCount} proposal{proposalCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 mt-1 transition ${isSelected ? 'text-cyan-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
      </div>
    </button>
  );
}

function PaperDetail({ paper, proposals }: { paper: Publication; proposals: Proposal[] }) {
  const cat = CATEGORY_META[paper.category] || CATEGORY_META.detection_technique;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-cyan-950/20">
        <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2 bg-${cat.color}-500/15 text-${cat.color}-300 border border-${cat.color}-500/30`}>
          {cat.label}
        </div>
        <h3 className="text-base font-bold text-white leading-snug">{paper.title}</h3>
        <p className="text-xs text-slate-400 mt-1.5">
          {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ` +${paper.authors.length - 3}` : ''}
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span className="font-medium text-slate-300">{paper.venue}</span>
          <span>{paper.published_date}</span>
          {paper.doi && (
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
              DOI <ArrowUpRight className="w-3 h-3" />
            </a>
          )}
          {paper.arxiv_id && (
            <a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
              arXiv <ArrowUpRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* TL;DR */}
      <div className="px-4 py-3 border-b border-slate-800 bg-cyan-500/5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">AI Summary</span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{paper.summary_tldr}</p>
      </div>

      {/* Abstract */}
      <div className="px-4 py-3 border-b border-slate-800">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Abstract</h4>
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-6">{paper.abstract}</p>
      </div>

      {/* MITRE + Keywords */}
      <div className="px-4 py-3 border-b border-slate-800 grid grid-cols-2 gap-3">
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">MITRE ATT&CK</h4>
          <div className="flex flex-wrap gap-1">
            {paper.mitre_techniques.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Keywords</h4>
          <div className="flex flex-wrap gap-1">
            {paper.keywords.slice(0, 5).map(k => (
              <span key={k} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/40 text-slate-300 border border-slate-600/40">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Proposals from this paper */}
      {proposals.length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-2 flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3" />
            AI-Proposed Capabilities ({proposals.length})
          </h4>
          <div className="space-y-2">
            {proposals.map(prop => (
              <ProposalMiniCard key={prop.id} proposal={prop} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalMiniCard({ proposal }: { proposal: Proposal }) {
  const typeMeta = TYPE_BADGE[proposal.proposed_type] || TYPE_BADGE.agent;
  const statusMeta = STATUS_BADGE[proposal.status] || STATUS_BADGE.draft;

  return (
    <div className="p-2.5 rounded-lg border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/50 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-xs font-bold text-white leading-tight">{proposal.proposed_name}</h5>
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{proposal.description}</p>
        </div>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold border ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${typeMeta.cls}`}>
          {typeMeta.label}
        </span>
        <span className={`text-[10px] ${COMPLEXITY_COLOR[proposal.implementation_complexity]}`}>
          {proposal.implementation_complexity}
        </span>
        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" /> {proposal.estimated_days}d
        </span>
        <span className="text-[10px] text-slate-500 ml-auto">
          Priority: <span className="text-white font-bold">{proposal.priority_score}</span>
        </span>
      </div>
    </div>
  );
}

function ProposalBoard({ proposals, papers, statusFilter, setStatusFilter }: {
  proposals: Proposal[];
  papers: Publication[];
  statusFilter: string;
  setStatusFilter: (s: string) => void;
}) {
  const columns = ['draft', 'under_review', 'approved', 'shipped'];

  const getPaper = (pubId: string) => papers.find(p => p.id === pubId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-500" />
        {['all', ...columns, 'dismissed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                : 'bg-slate-800/40 border border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {s === 'all' ? 'All' : (STATUS_BADGE[s]?.label || s)}
          </button>
        ))}
      </div>

      {/* Kanban-style board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {columns.map(col => {
          const colProposals = (statusFilter === 'all' ? proposals.filter(p => p.status === col) : proposals.filter(p => p.status === col));
          if (statusFilter !== 'all' && statusFilter !== col) return null;
          return (
            <div key={col} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    col === 'draft' ? 'text-slate-400' :
                    col === 'under_review' ? 'text-amber-300' :
                    col === 'approved' ? 'text-emerald-300' :
                    'text-cyan-300'
                  }`}>
                    {STATUS_BADGE[col]?.label || col}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{colProposals.length}</span>
                </div>
              </div>
              <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                {colProposals.map(prop => {
                  const paper = getPaper(prop.publication_id);
                  const typeMeta = TYPE_BADGE[prop.proposed_type] || TYPE_BADGE.agent;
                  return (
                    <div key={prop.id} className="p-2.5 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition">
                      <h5 className="text-xs font-bold text-white leading-tight mb-1">{prop.proposed_name}</h5>
                      <p className="text-[10px] text-slate-400 line-clamp-2 mb-2">{prop.rationale}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${typeMeta.cls}`}>
                          {typeMeta.label}
                        </span>
                        <span className={`text-[9px] ${COMPLEXITY_COLOR[prop.implementation_complexity]}`}>
                          {prop.implementation_complexity}
                        </span>
                        <span className="text-[9px] text-slate-500 ml-auto font-mono">
                          P{prop.priority_score}
                        </span>
                      </div>
                      {paper && (
                        <div className="mt-2 pt-1.5 border-t border-slate-700/40">
                          <span className="text-[9px] text-slate-500 flex items-center gap-1">
                            <BookOpen className="w-2.5 h-2.5" />
                            {paper.title.slice(0, 50)}...
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {colProposals.length === 0 && (
                  <div className="text-center py-4 text-slate-600 text-[10px]">No proposals</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
