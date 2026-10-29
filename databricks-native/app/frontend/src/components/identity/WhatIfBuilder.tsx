import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import { identityApi, type ChangeType, type ScenarioChange, type WhatIfOptions } from '../../lib/identityApi';
import { ErrorBanner, Loading } from './identityUi';

const TYPE_LABEL: Record<ChangeType, string> = {
  remove_membership: 'Remove a member from a group',
  revoke_grant: 'Revoke a grant on a system',
  remove_takeover: 'Remove a takeover right (password reset, delegation)',
  disable_account: 'Disable an account',
  delete_group: 'Delete a group',
};

interface Choice { label: string; change: ScenarioChange }

function choicesFor(type: ChangeType, o: WhatIfOptions): Choice[] {
  switch (type) {
    case 'remove_membership':
      return o.memberships.map((m) => ({
        label: `${m.member_name || m.member}${m.member_kind === 'group' ? ' (group)' : ''}  from  ${m.group_name}`,
        change: { type, group: m.group, member: m.member },
      }));
    case 'revoke_grant':
      return o.grants.map((g) => ({
        label: `${g.source_name}  →  ${g.resource}${g.permission ? ` (${g.permission})` : ''}`,
        change: { type, source: g.source, resource_id: g.resource_id, ...(g.permission ? { permission: g.permission } : {}) },
      }));
    case 'remove_takeover':
      return o.takeovers.map((t) => ({
        label: `${t.source_name}  can take over  ${t.target_name}${t.permission ? ` (${t.permission})` : ''}`,
        change: { type, source: t.source, target: t.target },
      }));
    case 'disable_account':
      return o.accounts.map((a) => ({
        label: a.display_name ? `${a.display_name} · ${a.username}` : a.username || a.account,
        change: { type, account: a.account },
      }));
    case 'delete_group':
      return o.groups.map((g) => ({ label: `${g.name}${g.privileged ? ' (privileged)' : ''} · ${g.effective_member_count} members`, change: { type, group: g.group_key } }));
  }
}

const field = 'w-full bg-slate-900/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60';

export default function WhatIfBuilder({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, note: string | null) => void }) {
  const [options, setOptions] = useState<WhatIfOptions | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChangeType>('remove_membership');
  const [pick, setPick] = useState('');
  const [changes, setChanges] = useState<Choice[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    identityApi.whatifOptions().then(setOptions).catch((e: Error) => setError(e.message));
  }, []);

  const choices = useMemo(() => (options ? choicesFor(type, options) : []), [options, type]);

  const add = () => {
    const c = choices[Number(pick)];
    if (!c || changes.some((x) => JSON.stringify(x.change) === JSON.stringify(c.change))) return;
    setChanges([...changes, { label: `${TYPE_LABEL[type].split(' (')[0]}: ${c.label}`, change: c.change }]);
    setPick('');
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const ack = await identityApi.createScenario({ name: name.trim(), description: description.trim(), changes: changes.map((c) => c.change) });
      onCreated(ack.scenario_id, ack.triggered ? null : 'Saved. The simulator job could not be started right now, so it will be evaluated on the next scheduled identity run.');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0F1D32] border border-slate-700/60 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-100">New what-if scenario</h2>
            <p className="text-xs text-slate-400 mt-0.5">Nothing changes in any directory. The simulator only shows what would happen.</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <ErrorBanner message={error} />}
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Scenario name, e.g. Remove contractors from Tier0" className={field} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="Why are you considering this? (optional)" className={field} />
          </div>

          <div className="rounded-xl border border-slate-700/50 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-500">Add a change</div>
            {!options ? (
              !error && <Loading label="Loading current access" />
            ) : (
              <>
                <select value={type} onChange={(e) => { setType(e.target.value as ChangeType); setPick(''); }} className={field}>
                  {(Object.keys(TYPE_LABEL) as ChangeType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
                <div className="flex gap-2">
                  <select value={pick} onChange={(e) => setPick(e.target.value)} className={field} disabled={choices.length === 0}>
                    <option value="">{choices.length ? 'Choose…' : 'Nothing of this kind in the current access data'}</option>
                    {choices.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
                  </select>
                  <button onClick={add} disabled={pick === '' || changes.length >= 20}
                    className="inline-flex items-center gap-1.5 px-3 rounded-lg border border-teal-500/40 text-teal-200 text-sm hover:bg-teal-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                    <Plus size={14} /> Add
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            {changes.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4">No changes yet. Add up to 20.</div>
            ) : changes.map((c, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-slate-200">
                <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
                <span className="flex-1 min-w-0 truncate" title={c.label}>{c.label}</span>
                <button onClick={() => setChanges(changes.filter((_, j) => j !== i))} className="p-1 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !name.trim() || changes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 text-slate-950 text-sm font-medium hover:bg-teal-400 disabled:opacity-40 disabled:hover:bg-teal-500 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />} Run simulation
          </button>
        </div>
      </div>
    </div>
  );
}
