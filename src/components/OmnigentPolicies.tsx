import { useEffect, useState } from 'react';
import {
  Network, ShieldCheck, Ban, HelpCircle, Plus, Pencil, Trash2,
  Save, X, Power, AlertTriangle, Loader2, ListChecks, Workflow,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import OmnigentArchitecture from './OmnigentArchitecture';

interface OmnigentPolicy {
  id: string;
  agent_key: string;
  agent_name: string;
  action_type: string;
  target_glob: string;
  decision: 'ALLOW' | 'DENY' | 'ASK';
  priority: number;
  enabled: boolean;
  rationale: string;
  created_by: string;
  provenance: string;
  created_at: string;
  updated_at: string;
}

type Draft = {
  agent_key: string;
  agent_name: string;
  action_type: string;
  target_glob: string;
  decision: 'ALLOW' | 'DENY' | 'ASK';
  priority: number;
  enabled: boolean;
  rationale: string;
};

const DECISION_META: Record<string, { tone: string; Icon: typeof ShieldCheck; blurb: string }> = {
  ALLOW: { tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10', Icon: ShieldCheck, blurb: 'runner may proceed to the chokepoint' },
  DENY: { tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10', Icon: Ban, blurb: 'runner refuses; action never attempted' },
  ASK: { tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10', Icon: HelpCircle, blurb: 'runner must get a human decision first' },
};

const SELECT_COLS =
  'id, agent_key, agent_name, action_type, target_glob, decision, priority, enabled, rationale, created_by, provenance, created_at, updated_at';

const EMPTY_DRAFT: Draft = {
  agent_key: '', agent_name: '', action_type: '*', target_glob: '*',
  decision: 'ASK', priority: 100, enabled: true, rationale: '',
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${tone}`}>
      {children}
    </span>
  );
}

export default function OmnigentPolicies() {
  const [policies, setPolicies] = useState<OmnigentPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [subView, setSubView] = useState<'policies' | 'architecture'>('policies');

  const load = async () => {
    const { data, error: err } = await supabase
      .from('ecp_omnigent_policies')
      .select(SELECT_COLS)
      .order('priority', { ascending: false })
      .order('agent_key', { ascending: true });
    if (err) {
      setError('Could not load policies. Please try again.');
      setPolicies([]);
    } else {
      setError(null);
      setPolicies((data as OmnigentPolicy[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('ecp_omnigent_policies')
        .select(SELECT_COLS)
        .order('priority', { ascending: false })
        .order('agent_key', { ascending: true });
      if (!active) return;
      if (err) {
        setError('Could not load policies. Please try again.');
        setPolicies([]);
      } else {
        setPolicies((data as OmnigentPolicy[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const startCreate = () => {
    setDraft(EMPTY_DRAFT);
    setCreating(true);
    setEditingId(null);
  };

  const startEdit = (p: OmnigentPolicy) => {
    setDraft({
      agent_key: p.agent_key, agent_name: p.agent_name, action_type: p.action_type,
      target_glob: p.target_glob, decision: p.decision, priority: p.priority,
      enabled: p.enabled, rationale: p.rationale,
    });
    setEditingId(p.id);
    setCreating(false);
  };

  const cancelForm = () => { setCreating(false); setEditingId(null); setDraft(EMPTY_DRAFT); };

  const draftValid =
    draft.agent_key.trim() !== '' &&
    draft.agent_name.trim() !== '' &&
    draft.action_type.trim() !== '' &&
    draft.target_glob.trim() !== '' &&
    Number.isFinite(draft.priority);

  const save = async () => {
    if (!draftValid) { setError('Agent key, agent name, action and target are required.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      agent_key: draft.agent_key.trim(),
      agent_name: draft.agent_name.trim(),
      action_type: draft.action_type.trim(),
      target_glob: draft.target_glob.trim(),
      decision: draft.decision,
      priority: Math.trunc(draft.priority),
      enabled: draft.enabled,
      rationale: draft.rationale.trim(),
    };
    let err;
    if (editingId) {
      ({ error: err } = await supabase
        .from('ecp_omnigent_policies')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId));
    } else {
      ({ error: err } = await supabase.from('ecp_omnigent_policies').insert(payload));
    }
    setSaving(false);
    if (err) {
      const msg = (err as { message?: string }).message ?? '';
      setError(
        /duplicate|unique/i.test(msg)
          ? 'A rule for that agent, action and target already exists. Edit that one instead.'
          : 'Could not save the policy. Please try again.'
      );
      return;
    }
    cancelForm();
    await load();
  };

  const toggleEnabled = async (p: OmnigentPolicy) => {
    setError(null);
    const { error: err } = await supabase
      .from('ecp_omnigent_policies')
      .update({ enabled: !p.enabled, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (err) { setError('Could not update the policy. Please try again.'); return; }
    await load();
  };

  const remove = async (id: string) => {
    setError(null);
    const { error: err } = await supabase.from('ecp_omnigent_policies').delete().eq('id', id);
    setConfirmDelete(null);
    if (err) { setError('Could not delete the policy. Please try again.'); return; }
    await load();
  };

  const formOpen = creating || editingId !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubView('policies')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
            subView === 'policies' ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 border border-transparent hover:text-slate-200'
          }`}
        >
          <ListChecks size={13} />Policies
        </button>
        <button
          onClick={() => setSubView('architecture')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
            subView === 'architecture' ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 border border-transparent hover:text-slate-200'
          }`}
        >
          <Workflow size={13} />How it works
        </button>
      </div>

      {subView === 'architecture' ? (
        <OmnigentArchitecture />
      ) : (
      <>
      <div className="bg-[#0b0f1e] border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
            <Network size={13} />Omnigent policy bindings — runner-level ALLOW / DENY / ASK
          </div>
          {!formOpen && (
            <button
              onClick={startCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 transition-colors"
            >
              <Plus size={13} />New policy
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
          These rules let an operator constrain an agent's action paths <span className="text-slate-200">outside the agent's own code</span>.
          Each binding maps an agent, an action and a target pattern to one runner verdict: <span className="text-emerald-300">ALLOW</span> lets the
          action proceed to the enforcement chokepoint (which still checks the authority kernel, the human approval and the capability lease),
          <span className="text-rose-300"> DENY</span> refuses it before it is ever attempted, and <span className="text-amber-300">ASK</span> requires
          a human decision. Resolution is <span className="text-slate-200">deny-by-default</span>, highest priority wins, and ties break to the most
          restrictive verdict. Every rule below is a real, editable record resolved by the code in
          <span className="font-mono text-amber-200"> _shared/omnigent_pep.py</span>.
        </p>
        <p className="text-[11px] text-amber-200/80 leading-relaxed mt-2 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Honest status: authoring a rule here does not yet mean a live Omnigent runner is mediating that agent. These bindings are resolved
          in code and verified by tests; no agent is marked fully governed until a real runner enforces them against a live workspace.
        </p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-[11px] text-rose-200 flex items-center gap-2">
          <AlertTriangle size={13} />{error}
        </div>
      )}

      {formOpen && (
        <div className="bg-[#0b0f1e] border border-cyan-500/30 rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold text-white">{editingId ? 'Edit policy' : 'New policy'}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] text-slate-500">Agent key <span className="text-slate-600">(&quot;*&quot; = any agent)</span></span>
              <input value={draft.agent_key} onChange={(e) => setDraft({ ...draft, agent_key: e.target.value })}
                placeholder="vanguard_response" className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50" />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Agent name</span>
              <input value={draft.agent_name} onChange={(e) => setDraft({ ...draft, agent_name: e.target.value })}
                placeholder="VANGUARD Response" className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Action type <span className="text-slate-600">(&quot;*&quot; = any action)</span></span>
              <input value={draft.action_type} onChange={(e) => setDraft({ ...draft, action_type: e.target.value })}
                placeholder="isolate_host" className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50" />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Target pattern <span className="text-slate-600">(glob, e.g. 10.* or *)</span></span>
              <input value={draft.target_glob} onChange={(e) => setDraft({ ...draft, target_glob: e.target.value })}
                placeholder="*" className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50" />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Decision</span>
              <select value={draft.decision} onChange={(e) => setDraft({ ...draft, decision: e.target.value as Draft['decision'] })}
                className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50">
                <option value="ALLOW">ALLOW — proceed to chokepoint</option>
                <option value="ASK">ASK — require a human decision</option>
                <option value="DENY">DENY — refuse the action path</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500">Priority <span className="text-slate-600">(higher wins)</span></span>
              <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50" />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] text-slate-500">Rationale <span className="text-slate-600">(why this binding exists)</span></span>
            <textarea value={draft.rationale} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} rows={2}
              className="mt-1 w-full bg-[#060912] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              className="accent-cyan-500" />
            Enabled (disabled rules are ignored by the resolver)
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving || !draftValid}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{editingId ? 'Save changes' : 'Create policy'}
            </button>
            <button onClick={cancelForm} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg border border-slate-600/40 text-slate-300 hover:bg-slate-500/10 transition-colors">
              <X size={13} />Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-6 text-[11px] text-slate-500 flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" />Loading policies…
        </div>
      )}

      {!loading && policies.length === 0 && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-[11px] text-slate-500">
          No policies yet. Add one to start constraining agent action paths.
        </div>
      )}

      {!loading && policies.map((p) => {
        const dm = DECISION_META[p.decision] ?? DECISION_META.ASK;
        const DIcon = dm.Icon;
        return (
          <div key={p.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${p.enabled ? 'border-[#1e293b]' : 'border-[#1e293b] opacity-60'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <DIcon size={16} className={dm.tone.split(' ')[0]} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{p.agent_name}</span>
                    <span className="text-[11px] font-mono text-cyan-300">{p.agent_key}</span>
                    <span className="text-[11px] font-mono text-slate-400">{p.action_type}</span>
                    <span className="text-[11px] text-slate-500">→ {p.target_glob}</span>
                  </div>
                  {p.rationale && <div className="text-[11px] text-slate-500 mt-0.5">{p.rationale}</div>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={dm.tone}><DIcon size={11} />{p.decision}</Badge>
                <Badge tone="text-slate-400 border-slate-500/30 bg-slate-500/10">priority {p.priority}</Badge>
                {!p.enabled && <Badge tone="text-slate-400 border-slate-500/30 bg-slate-500/10">disabled</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => toggleEnabled(p)} title={p.enabled ? 'Disable' : 'Enable'}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-600/40 text-slate-300 hover:bg-slate-500/10 transition-colors">
                <Power size={12} />{p.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => startEdit(p)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 transition-colors">
                <Pencil size={12} />Edit
              </button>
              {confirmDelete === p.id ? (
                <>
                  <button onClick={() => remove(p.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 transition-colors">
                    <Trash2 size={12} />Confirm delete
                  </button>
                  <button onClick={() => setConfirmDelete(null)}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-600/40 text-slate-300 hover:bg-slate-500/10 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(p.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-colors">
                  <Trash2 size={12} />Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
      </>
      )}
    </div>
  );
}
