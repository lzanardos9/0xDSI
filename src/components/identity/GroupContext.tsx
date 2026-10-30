import { useCallback, useEffect, useState } from 'react';
import { UsersRound, Search, Crown, Layers, UserX, UserCheck, ShieldAlert, ChevronRight, CornerDownRight } from 'lucide-react';
import { identityApi, type GroupDetail, type GroupSummary } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, StatePill, Tag, fmtTime, providerLabel } from './identityUi';
import { SEVERITY_TONE } from './identityRiskUi';

const FINDING_TEXT: Record<string, string> = {
  hidden_privilege_nesting: 'Hidden privilege through nesting',
  group_owner_departed: 'Group owner has left',
  group_no_owner: 'Group has no owner',
  member_outside_purpose: 'Member outside the group purpose',
  inactive_members: 'Inactive accounts still members',
};

const OWNER_STATUS: Record<GroupSummary['owner_status'], { label: string; tone: 'green' | 'red' | 'amber' | 'slate' | 'blue' }> = {
  active: { label: 'Owner active', tone: 'green' },
  departed: { label: 'Owner departed', tone: 'red' },
  none: { label: 'No owner', tone: 'amber' },
  unresolved: { label: 'Owner not found', tone: 'amber' },
  team: { label: 'Team owned', tone: 'blue' },
};

function GroupDetailView({ groupKey, onOpen }: { groupKey: string; onOpen: (name: string) => void }) {
  const [data, setData] = useState<GroupDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    identityApi.groupDetail(groupKey).then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [groupKey]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Card><Loading label="Loading group" /></Card>;
  const g = data.group;
  const owner = OWNER_STATUS[g.owner_status] || OWNER_STATUS.unresolved;
  const open = data.findings.filter((f) => f.status === 'open');

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">{g.name}</h2>
          {g.privileged && <Tag tone="red"><Crown size={11} /> privileged</Tag>}
          <Tag>{providerLabel(g.provider)}</Tag>
        </div>
        {g.purpose && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{g.purpose}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <div className="text-[11px] text-slate-500">Owner</div>
            <div className="text-slate-200 truncate">{g.owner || '—'}</div>
            <div className="mt-1"><Tag tone={owner.tone}>{owner.label}</Tag></div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Department</div>
            <div className="text-slate-200">{g.department || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Members</div>
            <div className="text-slate-200">{g.direct_member_count} direct · {g.effective_member_count} effective</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Nesting depth</div>
            <div className="text-slate-200">{g.nesting_depth}</div>
          </div>
        </div>
        {(g.parent_groups.length > 0 || g.child_groups.length > 0) && (
          <div className="mt-4 space-y-2 text-xs">
            {g.parent_groups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 w-20">Nested in</span>
                {g.parent_groups.map((n) => (
                  <button key={n} onClick={() => onOpen(n)} className="px-2 py-0.5 rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 transition-colors">{n}</button>
                ))}
              </div>
            )}
            {g.child_groups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 w-20">Contains</span>
                {g.child_groups.map((n) => (
                  <button key={n} onClick={() => onOpen(n)} className="px-2 py-0.5 rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 transition-colors">{n}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {open.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Findings</h3>
          <div className="space-y-2">
            {open.map((f) => (
              <div key={f.finding_id} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={SEVERITY_TONE[f.severity] || 'slate'}>{f.severity}</Tag>
                  <span className="text-sm text-slate-200">{FINDING_TEXT[f.finding_type] || f.finding_type}</span>
                  <span className="ml-auto text-[11px] text-slate-500">since {fmtTime(f.first_seen)}</span>
                </div>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{f.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">What this group grants</h3>
        {g.grants.length === 0 && g.can_take_over.length === 0 ? (
          <div className="text-sm text-slate-400">No direct grants. Access may still come from parent groups.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {g.grants.map((r) => (
              <span key={`${r.resource_id}-${r.permission}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${r.crown_jewel ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-slate-600/50 bg-slate-800/60 text-slate-200'}`}>
                {r.crown_jewel && <Crown size={11} />}
                {r.resource}{r.permission ? ` · ${r.permission}` : ''}
              </span>
            ))}
            {g.can_take_over.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 text-xs">
                <ShieldAlert size={11} /> can take over {k}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-200">Members</h3>
          <p className="text-xs text-slate-500 mt-0.5">Includes everyone who gets this group through nested groups.</p>
        </div>
        {data.members.length === 0 ? (
          <Empty title="No members" hint="This group has no direct or nested members." />
        ) : (
          <div className="divide-y divide-slate-800">
            {data.members.map((m) => (
              <div key={m.account_key} className="px-5 py-3 flex flex-wrap items-center gap-3">
                {m.direct ? <UserCheck size={14} className="text-slate-400" /> : <CornerDownRight size={14} className="text-sky-400" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-100 truncate">{m.display_name || m.username || m.account_key}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {m.username}{m.department ? ` · ${m.department}` : ''}
                    {!m.direct && m.via.length > 0 && <span className="text-sky-300"> · via {m.via.join(' → ')}</span>}
                  </div>
                </div>
                {m.persona_type && m.persona_type !== 'standard' && <Tag tone={m.persona_type === 'privileged' ? 'amber' : 'slate'}>{m.persona_type}</Tag>}
                <StatePill state={m.normalized_state} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function GroupContext() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [search, setSearch] = useState('');
  const [findingsOnly, setFindingsOnly] = useState(false);
  const [privilegedOnly, setPrivilegedOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    identityApi
      .groups({ search, findings_only: findingsOnly, privileged_only: privilegedOnly })
      .then((d) => {
        setGroups(d.groups);
        setSelected((cur) => cur ?? d.groups[0]?.group_key ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, findingsOnly, privilegedOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openByName = (name: string) => {
    const hit = groups.find((g) => g.name === name);
    if (hit) setSelected(hit.group_key);
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, Icon: typeof Crown) => (
    <button onClick={() => set(!on)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${on ? 'border-teal-500/50 bg-teal-500/10 text-teal-200' : 'border-slate-700/60 text-slate-400 hover:bg-slate-800'}`}>
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div className="identity-page">
      <PageHeader
        icon={UsersRound}
        title="Group Context"
        subtitle="Who owns each group, what it is for, what it grants and who really gets it once nesting is unrolled. Flags groups with departed owners, hidden privilege and members who do not fit."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,400px)_1fr] gap-6">
        <Card className="overflow-hidden self-start">
          <div className="p-3 border-b border-slate-700/50 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, owner or purpose"
                className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60" />
            </div>
            <div className="flex gap-2">
              {toggle(findingsOnly, setFindingsOnly, 'With findings', ShieldAlert)}
              {toggle(privilegedOnly, setPrivilegedOnly, 'Privileged', Crown)}
            </div>
          </div>
          {loading && groups.length === 0 ? (
            <Loading />
          ) : groups.length === 0 ? (
            <Empty title="No groups" hint="No groups match, or the access feed has not been loaded yet." />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-800">
              {groups.map((g) => {
                const active = g.group_key === selected;
                const owner = OWNER_STATUS[g.owner_status] || OWNER_STATUS.unresolved;
                return (
                  <button key={g.group_key} onClick={() => setSelected(g.group_key)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${active ? 'bg-teal-500/10' : 'hover:bg-slate-800/50'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {g.privileged && <Crown size={12} className="text-amber-300 flex-shrink-0" />}
                        <span className="text-sm text-slate-100 truncate">{g.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <Tag>{providerLabel(g.provider)}</Tag>
                        {g.owner_status !== 'active' && g.owner_status !== 'team' && <Tag tone={owner.tone}>{owner.label}</Tag>}
                        {g.nesting_depth > 0 && <Tag tone="blue"><Layers size={10} /> depth {g.nesting_depth}</Tag>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-slate-300">{g.effective_member_count}</div>
                      <div className="text-[10px] text-slate-500">members</div>
                    </div>
                    {g.open_findings > 0 ? (
                      <Tag tone={g.worst_severity ? SEVERITY_TONE[g.worst_severity] : 'slate'}>
                        {g.owner_status === 'departed' ? <UserX size={10} /> : <ShieldAlert size={10} />} {g.open_findings}
                      </Tag>
                    ) : <span className="w-8" />}
                    <ChevronRight size={14} className={active ? 'text-teal-300' : 'text-slate-600'} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <div>
          {selected ? <GroupDetailView groupKey={selected} onOpen={openByName} /> : (
            <Card><Empty title="Pick a group" hint="Select a group on the left to see its owner, grants and members." /></Card>
          )}
        </div>
      </div>
    </div>
  );
}
