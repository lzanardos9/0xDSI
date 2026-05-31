import { useState } from 'react';
import { Check, Circle, Loader2, Rocket, ShieldCheck, TestTube, FileText, Link2, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/llmGateway';

interface LifecyclePanelProps {
  creationId: string;
  initialStatus: string;
  shareToken: string | null;
  featureType: string;
}

const STAGES = [
  { id: 'draft', label: 'Draft', icon: FileText, color: 'slate' },
  { id: 'testing', label: 'Testing', icon: TestTube, color: 'amber' },
  { id: 'homologation', label: 'Homologation', icon: ShieldCheck, color: 'cyan' },
  { id: 'production', label: 'Production', icon: Rocket, color: 'emerald' },
];

export default function LifecyclePanel({ creationId, initialStatus, shareToken, featureType }: LifecyclePanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const stageIndex = STAGES.findIndex(s => s.id === status);

  const promote = async (stage: string) => {
    setPromoting(stage);
    try {
      const { data, error } = await callFunction('feature-lab', {
        action: 'promote',
        id: creationId,
        stage,
        notes,
      });
      if (!error && data) {
        const creationData = (data as Record<string, any>).creation;
        if (creationData) {
          setStatus(creationData.status);
          setNotes('');
        }
      }
    } finally {
      setPromoting(null);
    }
  };

  const copyShareLink = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}${window.location.pathname}?shared=${shareToken}`;
    navigator.clipboard.writeText(url);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <div className="bg-[#0a0e1a] border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket size={14} className="text-cyan-400" />
          <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Deployment Lifecycle</div>
        </div>
        <div className="text-[10px] font-mono text-slate-500">{featureType === 'backend' ? 'BACKEND / NOTEBOOK' : 'FRONTEND APP'}</div>
      </div>

      {/* Stage progression */}
      <div className="relative">
        <div className="absolute top-4 left-4 right-4 h-[2px] bg-slate-800" />
        <div
          className="absolute top-4 left-4 h-[2px] bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
          style={{ width: `calc(${(stageIndex / (STAGES.length - 1)) * 100}% - ${(stageIndex / (STAGES.length - 1)) * 32}px)` }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const done = i < stageIndex;
            const current = i === stageIndex;
            const next = i === stageIndex + 1;
            return (
              <div key={stage.id} className="flex flex-col items-center gap-2 relative z-10">
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                  done ? 'bg-emerald-500 border-emerald-500 text-white' :
                  current ? `bg-${stage.color}-500/20 border-${stage.color}-400 text-${stage.color}-300 ring-4 ring-${stage.color}-500/20` :
                  'bg-slate-900 border-slate-700 text-slate-600'
                }`}>
                  {done ? <Check size={14} /> : current ? <Icon size={14} /> : <Circle size={10} />}
                </div>
                <div className={`text-[10px] font-semibold ${
                  current ? `text-${stage.color}-300` : done ? 'text-emerald-400' : 'text-slate-600'
                }`}>{stage.label}</div>
                {next && stageIndex < STAGES.length - 1 && (
                  <button
                    onClick={() => promote(stage.id)}
                    disabled={promoting === stage.id}
                    className="absolute top-12 whitespace-nowrap text-[9px] font-bold px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                  >
                    {promoting === stage.id ? <Loader2 size={9} className="animate-spin inline" /> : `Promote ->`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {status !== 'production' && (
        <div className="pt-6 space-y-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Handoff notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={
              status === 'draft' ? 'Validation scenarios covered, test data used...' :
              status === 'testing' ? 'QA sign-off, stakeholders reviewed, edge cases verified...' :
              'Go-live approvers, runbook link, rollback plan...'
            }
            className="w-full bg-[#060912] border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/50"
            rows={2}
          />
        </div>
      )}

      {shareToken && (
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 size={12} className="text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500">Share token:</span>
            <span className="text-[10px] font-mono text-cyan-400">{shareToken}</span>
          </div>
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
          >
            {copiedShare ? <Check size={10} /> : <Copy size={10} />}
            {copiedShare ? 'Copied' : 'Copy shareable link'}
          </button>
        </div>
      )}
    </div>
  );
}
