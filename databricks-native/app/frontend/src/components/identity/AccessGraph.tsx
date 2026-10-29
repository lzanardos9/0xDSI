import { useCallback, useEffect, useState } from 'react';
import { Share2, Crown, ShieldAlert, Users, Server, Filter } from 'lucide-react';
import { identityApi, type AccessResource, type AttackPath } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import { BandPill, PathChain } from './identityRiskUi';

function ResourceCard({ r, active, onClick }: { r: AccessResource; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all ${active ? 'border-teal-400/60 bg-teal-500/10 ring-2 ring-teal-500/30' : 'bg-[#0F1D32] border-slate-700/50 hover:border-slate-500/60 hover:-translate-y-0.5'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Crown size={14} className="text-amber-300 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-100 truncate">{r.name}</span>
        </div>
        {r.tier && <Tag>{r.tier}</Tag>}
      </div>
      <div className="flex items-end gap-4 mt-3">
        <div>
          <div className={`text-2xl font-semibold ${r.identities ? 'text-slate-100' : 'text-slate-500'}`}>{r.identities}</div>
          <div className="text-[11px] text-slate-500">identities can reach</div>
        </div>
        {r.via_takeover > 0 && (
          <div>
            <div className="text-2xl font-semibold text-red-300">{r.via_takeover}</div>
            <div className="text-[11px] text-slate-500">via takeover</div>
          </div>
        )}
        {r.min_hops !== null && (
          <div className="ml-auto text-right">
            <div className="text-sm text-slate-300">{r.min_hops}</div>
            <div className="text-[11px] text-slate-500">fewest hops</div>
          </div>
        )}
      </div>
    </button>
  );
}

export default function AccessGraph() {
  const [resources, setResources] = useState<AccessResource[]>([]);
  const [meta, setMeta] = useState<{ edges: number; access_version: string | null; updated_at: string | null } | null>(null);
  const [paths, setPaths] = useState<AttackPath[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [takeoverOnly, setTakeoverOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pathsLoading, setPathsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadResources = useCallback(() => {
    setLoading(true);
    setError('');
    identityApi
      .graphResources()
      .then((d) => { setResources(d.resources); setMeta(d.meta); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadResources, [loadResources]);

  useEffect(() => {
    let live = true;
    setPathsLoading(true);
    identityApi
      .graphPaths({ resource_id: resourceId, takeover_only: takeoverOnly })
      .then((d) => live && setPaths(d.paths))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setPathsLoading(false));
    return () => { live = false; };
  }, [resourceId, takeoverOnly]);

  const jewels = resources.filter((r) => r.crown_jewel);
  const others = resources.filter((r) => !r.crown_jewel);
  const selectedName = resources.find((r) => r.resource_id === resourceId)?.name;

  return (
    <div className="p-6 lg:p-8 bg-[#0A1628] min-h-full">
      <PageHeader
        icon={Share2}
        title="Access Graph & Attack Paths"
        subtitle="The shortest route from each person, workload or agent to your crown-jewel systems, through group nesting and takeover rights such as helpdesk password resets. Disabled accounts block a route."
        actions={meta ? <div className="text-xs text-slate-500">{meta.edges} access links · built {fmtTime(meta.updated_at)}</div> : undefined}
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={loadResources} /></div>}

      {loading ? (
        <Loading label="Loading access graph" />
      ) : resources.length === 0 ? (
        <Card><Empty title="No access data yet" hint="Drop resources, groups and edges into the identity access landing folder, then run the Identity 01 job." /></Card>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Crown size={15} className="text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-200">Crown jewels</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-6">
            {jewels.map((r) => (
              <ResourceCard key={r.resource_id} r={r} active={resourceId === r.resource_id}
                onClick={() => setResourceId(resourceId === r.resource_id ? '' : r.resource_id)} />
            ))}
          </div>

          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-6 text-xs text-slate-500">
              <Server size={13} />
              <span>Other mapped systems:</span>
              {others.map((r) => <Tag key={r.resource_id}>{r.name}</Tag>)}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/50">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">{selectedName ? `Paths to ${selectedName}` : 'All crown-jewel paths'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Takeover paths are listed first, then the shortest routes.</p>
              </div>
              <div className="flex items-center gap-2">
                {resourceId && (
                  <button onClick={() => setResourceId('')} className="px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
                    Show all
                  </button>
                )}
                <button onClick={() => setTakeoverOnly(!takeoverOnly)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${takeoverOnly ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-slate-700/60 text-slate-300 hover:bg-slate-800'}`}>
                  <Filter size={12} /> Takeover only
                </button>
              </div>
            </div>
            {pathsLoading ? (
              <Loading label="Loading paths" />
            ) : paths.length === 0 ? (
              <Empty title="No paths" hint="Nobody's active accounts reach this system with the current filter." />
            ) : (
              <div className="divide-y divide-slate-800">
                {paths.map((p) => (
                  <div key={p.path_id} className={`px-5 py-4 transition-colors hover:bg-slate-800/30 ${p.via_takeover ? 'border-l-2 border-red-400' : 'border-l-2 border-transparent'}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                      <Users size={13} className="text-slate-500" />
                      <span className="text-sm font-medium text-slate-100">{p.display_name || p.canonical_id}</span>
                      {p.band && <BandPill band={p.band} />}
                      <span className="text-xs text-slate-500">reaches</span>
                      <span className="text-sm text-slate-200">{p.resource_name || p.resource_id}</span>
                      <span className="text-xs text-slate-500">in {p.hops} hop{p.hops === 1 ? '' : 's'}</span>
                      {p.permission && <Tag tone="blue">{p.permission}</Tag>}
                      {p.via_takeover && <Tag tone="red"><ShieldAlert size={11} /> takeover</Tag>}
                    </div>
                    <PathChain path={p} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
