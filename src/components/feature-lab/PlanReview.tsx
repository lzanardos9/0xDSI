import { CheckCircle2, ChevronRight, Zap, Target, Users, ShieldCheck, TestTube, Layers, Loader2, RefreshCw, XCircle, Globe, FileCode, ArrowLeftRight } from 'lucide-react';
import ArchitectureDiagram from './ArchitectureDiagram';
import BMADAgentPanel from './BMADAgentPanel';

interface PlanReviewProps {
  plan: any;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onSwitchType?: (next: 'app' | 'backend') => void;
  executing: boolean;
}

export default function PlanReview({ plan, onApprove, onReject, onRegenerate, onSwitchType, executing }: PlanReviewProps) {
  const featureType = plan.feature_type || 'app';
  const oppositeType: 'app' | 'backend' = featureType === 'app' ? 'backend' : 'app';
  const nodes = plan.architecture_diagram?.nodes || [];
  const links = plan.architecture_diagram?.links || [];
  const dbxFeatures = plan.databricks_features || [];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5 border border-cyan-500/20 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-mono font-bold text-cyan-400 tracking-wider">
                ARCHITECTURE PROPOSAL
              </div>
              <div className="px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-[9px] font-mono font-bold text-orange-400 tracking-wider flex items-center gap-1">
                <Layers size={9} />DATABRICKS-NATIVE
              </div>
              <div className={`px-2 py-0.5 rounded-full border text-[9px] font-mono tracking-wider flex items-center gap-1 ${
                featureType === 'backend'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
              }`}>
                {featureType === 'backend' ? <FileCode size={9} /> : <Globe size={9} />}
                {featureType === 'backend' ? `BACKEND / ${(plan.code_language || 'python').toUpperCase()}` : 'VISUAL APP'}
              </div>
              {onSwitchType && (
                <button
                  onClick={() => onSwitchType(oppositeType)}
                  disabled={executing}
                  className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-mono text-slate-300 tracking-wider flex items-center gap-1 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors disabled:opacity-50"
                  title={`Regenerate plan as ${oppositeType === 'app' ? 'Visual App' : 'Backend Code'}`}
                >
                  <ArrowLeftRight size={9} />
                  Switch to {oppositeType === 'app' ? 'Visual App' : 'Backend Code'}
                </button>
              )}
            </div>
            <div className="text-xl font-bold text-white mb-2">{plan.title || 'Untitled Feature'}</div>
            <div className="text-sm text-slate-300 leading-relaxed mb-2">{plan.summary}</div>
            {plan.business_value && (
              <div className="flex items-start gap-2 mt-3 text-xs text-slate-400 leading-relaxed">
                <Target size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><span className="font-semibold text-emerald-400">Why it matters: </span>{plan.business_value}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={onApprove}
              disabled={executing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-xs font-bold hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              {executing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {executing ? 'Building...' : 'Approve & Build'}
            </button>
            <button
              onClick={onRegenerate}
              disabled={executing}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={12} />Revise plan
            </button>
            <button
              onClick={onReject}
              disabled={executing}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-slate-500 text-xs font-semibold hover:text-slate-300 transition-colors disabled:opacity-60"
            >
              <XCircle size={12} />Cancel
            </button>
          </div>
        </div>
      </div>

      {/* BMAD agent track */}
      {plan.bmad && <BMADAgentPanel bmad={plan.bmad} />}

      {/* Architecture diagram */}
      {nodes.length > 0 && (
        <div className="bg-[#0a0e1a] border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Layers size={14} className="text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Architecture Diagram</div>
                <div className="text-[10px] text-slate-500">{nodes.length} components / {links.length} data flows</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span>{dbxFeatures.length} Databricks products</span>
            </div>
          </div>
          <ArchitectureDiagram nodes={nodes} links={links} />
        </div>
      )}

      {/* Databricks features */}
      {dbxFeatures.length > 0 && (
        <div className="bg-gradient-to-br from-orange-500/5 to-transparent border border-orange-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center">
              <Layers size={14} className="text-orange-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Databricks Lakehouse Integration</div>
              <div className="text-[10px] text-slate-500">Production-grade services wired into this feature</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {dbxFeatures.map((f: any, i: number) => (
              <div key={i} className="bg-[#0a0e1a] border border-orange-500/20 rounded-lg p-3 hover:border-orange-500/40 transition-colors">
                <div className="text-xs font-bold text-orange-300 mb-1">{f.name}</div>
                <div className="text-[11px] text-slate-300 mb-1">{f.purpose}</div>
                {f.why && <div className="text-[10px] text-slate-500 italic">{f.why}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Components + interactions + wow */}
      <div className="grid grid-cols-3 gap-4">
        {plan.components?.length > 0 && (
          <PlanSection title="Components" icon={<Layers size={12} className="text-cyan-400" />} items={plan.components} accent="cyan" />
        )}
        {plan.user_interactions?.length > 0 && (
          <PlanSection title="Interactions" icon={<Users size={12} className="text-blue-400" />} items={plan.user_interactions} accent="blue" />
        )}
        {plan.wow_factors?.length > 0 && (
          <PlanSection title="Wow Factors" icon={<Zap size={12} className="text-emerald-400" />} items={plan.wow_factors} accent="emerald" />
        )}
      </div>

      {/* Test + homologation plan */}
      <div className="grid grid-cols-2 gap-4">
        {plan.test_plan?.length > 0 && (
          <PlanSection title="Test Plan" icon={<TestTube size={12} className="text-amber-400" />} items={plan.test_plan} accent="amber" />
        )}
        {plan.homologation_checklist?.length > 0 && (
          <PlanSection title="Homologation Checklist" icon={<ShieldCheck size={12} className="text-teal-400" />} items={plan.homologation_checklist} accent="teal" />
        )}
      </div>
    </div>
  );
}

function PlanSection({ title, icon, items, accent }: { title: string; icon: React.ReactNode; items: string[]; accent: string }) {
  const accentMap: Record<string, string> = {
    cyan: 'text-cyan-400',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    teal: 'text-teal-400',
  };
  return (
    <div className="bg-[#0a0e1a] border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div className={`text-[10px] font-bold uppercase tracking-wider ${accentMap[accent]}`}>{title}</div>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-relaxed">
            <ChevronRight size={10} className="text-slate-600 mt-0.5 shrink-0" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
