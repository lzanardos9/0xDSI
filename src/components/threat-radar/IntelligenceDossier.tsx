import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BookOpen, Brain, Cpu, Target, ExternalLink, CheckCircle2, XCircle, Loader2, AlertTriangle, Flame,
  ShieldAlert, Sparkles, Send, Code2, Database,
} from 'lucide-react';
import GraphPatternPreview from './GraphPatternPreview';
import RuleFlowGraph from './RuleFlowGraph';

type Item = any;
type Proposal = any;
type Hit = any;

export default function IntelligenceDossier({
  item, onRefresh, onPromote,
}: {
  item: Item;
  onRefresh: () => void;
  onPromote: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'article' | 'pov' | 'defense' | 'exposure'>('pov');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    load();
  }, [item?.id]);

  const load = async () => {
    if (!item?.id) return;
    setLoading(true);
    const [p, h] = await Promise.all([
      supabase.from('threat_radar_proposals').select('*').eq('item_id', item.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('threat_radar_exposure_hits').select('*').eq('item_id', item.id).order('discovered_at', { ascending: false }),
    ]);
    setProposal(p.data);
    setHits(h.data || []);
    setLoading(false);
  };

  const runProbe = async () => {
    setProbing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/threat-radar-probe`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      });
      await load();
      onRefresh();
    } finally { setProbing(false); }
  };

  const runAnalyze = async () => {
    setReAnalyzing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/threat-radar-analyze`;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      });
      await load();
      onRefresh();
    } finally { setReAnalyzing(false); }
  };

  const promote = async () => {
    if (!proposal) return;
    setPromoting(true);
    try {
      const ruleRow: any = {
        rule_name: proposal.proposal_name,
        description: proposal.description,
        severity: proposal.severity,
        rule_type: 'correlation',
        engine_type: proposal.engine_type || 'hybrid',
        confidence_score: proposal.confidence || 0.75,
        is_active: false,
        created_from: 'threat_radar',
        metadata: {
          source: 'threat_radar',
          item_id: item.id,
          article_url: item.url,
          proposal_id: proposal.id,
          graph_pattern: proposal.graph_pattern,
          mitre_techniques: proposal.mitre_techniques,
          detection_rule: proposal.detection_rule,
          hunt_query: proposal.hunt_query,
        },
      };
      const { data: insertedRule, error } = await supabase.from('correlation_rules').insert(ruleRow).select('id').maybeSingle();
      if (error) throw error;
      await supabase.from('threat_radar_proposals').update({
        status: 'promoted', promoted_rule_id: insertedRule?.id, reviewed_at: new Date().toISOString(),
      }).eq('id', proposal.id);
      onPromote(`Promoted to staged correlation rule`);
      await load();
    } catch (e: any) {
      onPromote(`Promotion failed: ${e.message}`);
    } finally { setPromoting(false); }
  };

  const reject = async () => {
    if (!proposal) return;
    await supabase.from('threat_radar_proposals').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', proposal.id);
    onPromote('Proposal rejected');
    await load();
  };

  if (!item) return null;
  const sevColor = item.severity === 'critical' ? 'red' : item.severity === 'high' ? 'orange' : item.severity === 'low' ? 'emerald' : 'amber';
  const sevHex = { red: '#ef4444', orange: '#fb923c', amber: '#eab308', emerald: '#10b981' }[sevColor];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden flex flex-col h-[calc(100vh-340px)] min-h-[600px]">
      <div className="relative p-5 border-b border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950/80">
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${sevHex}, transparent)` }} />
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-1">
              <span className="font-bold uppercase tracking-wider">{item.source_name}</span>
              <span>•</span>
              <span>{new Date(item.published_at).toLocaleString()}</span>
              <span>•</span>
              <span className="font-mono">confidence {(Number(item.confidence) * 100).toFixed(0)}%</span>
            </div>
            <h2 className="text-lg font-bold text-white leading-snug mb-2">{item.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider`} style={{ borderColor: sevHex + '80', background: sevHex + '20', color: sevHex }}>{item.severity}</span>
              <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-[10px] font-semibold text-slate-300">{(item.family || 'unclassified').replace(/_/g, ' ')}</span>
              {(item.cves || []).slice(0, 4).map((c: string) => (
                <span key={c} className="px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-[10px] font-mono text-red-300">{c}</span>
              ))}
              {(item.mitre_techniques || []).slice(0, 4).map((t: string) => (
                <span key={t} className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-mono text-cyan-300">ATT&CK {t}</span>
              ))}
            </div>
          </div>
          <a href={item.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300" title="Open source">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="flex items-center border-b border-slate-800 -mb-5 -mx-5 px-5">
          {[
            { key: 'pov', label: 'Point of View', icon: Brain },
            { key: 'defense', label: 'Proposed Defense', icon: Target },
            { key: 'exposure', label: `Are We Bleeding? ${hits.length ? `(${hits.length})` : ''}`, icon: ShieldAlert },
            { key: 'article', label: 'Article', icon: BookOpen },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition ${
                tab === t.key ? 'border-emerald-400 text-emerald-200' : 'border-transparent text-slate-500 hover:text-slate-200'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        {tab === 'pov' && (
          <div className="space-y-4">
            {item.analysis_status !== 'analyzed' ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                This item has not been analyzed yet.
                <button onClick={runAnalyze} disabled={reAnalyzing} className="ml-3 px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold">
                  {reAnalyzing ? 'Analyzing...' : 'Analyze now'}
                </button>
              </div>
            ) : (
              <>
                <Section icon={Brain} title="Agent's Point of View" accent="emerald">
                  <p className="text-sm text-slate-300 leading-relaxed">{item.point_of_view || '-'}</p>
                </Section>
                <Section icon={Flame} title="Why We Should Care" accent="orange">
                  <p className="text-sm text-slate-300 leading-relaxed">{item.why_care || '-'}</p>
                </Section>
                <Section icon={Cpu} title="Hypothesized Attacker Chain" accent="cyan">
                  <p className="text-sm text-slate-300 leading-relaxed">{item.attack_chain || '-'}</p>
                </Section>
                <div className="flex items-center gap-2">
                  <button onClick={runAnalyze} disabled={reAnalyzing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    {reAnalyzing ? 'Re-analyzing...' : 'Re-analyze with LLM'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'defense' && (
          <div className="space-y-4">
            {!proposal ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                No proposal yet. <button onClick={runAnalyze} className="text-emerald-300 underline ml-1">Generate one</button>.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Generated Correlation Rule</div>
                    <div className="text-base font-semibold text-white">{proposal.proposal_name}</div>
                  </div>
                  <span className={`px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${
                    proposal.status === 'promoted' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' :
                    proposal.status === 'rejected' ? 'border-red-500/50 bg-red-500/15 text-red-200' :
                    'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  }`}>{proposal.status}</span>
                </div>

                <Section icon={Sparkles} title="Rationale" accent="emerald">
                  <p className="text-xs text-slate-300 leading-relaxed">{proposal.rationale}</p>
                </Section>

                <GraphPatternPreview pattern={proposal.graph_pattern || {}} />

                {(proposal.graph_pattern?.rule_logic || proposal.graph_pattern?.rule_flow) && (
                  <RuleFlowGraph flow={proposal.graph_pattern.rule_logic || proposal.graph_pattern.rule_flow} />
                )}

                <Section icon={Code2} title="Detection Rule (DSL)" accent="cyan">
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 rounded-md p-3 border border-slate-800 overflow-x-auto whitespace-pre-wrap">{proposal.detection_rule}</pre>
                </Section>

                <Section icon={Database} title="Hunt Query" accent="amber">
                  <pre className="text-[11px] font-mono text-slate-300 bg-slate-950 rounded-md p-3 border border-slate-800 overflow-x-auto whitespace-pre-wrap">{proposal.hunt_query}</pre>
                </Section>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={promote}
                    disabled={promoting || proposal.status === 'promoted'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500/30 to-cyan-500/25 hover:from-emerald-500/40 hover:to-cyan-500/35 border border-emerald-500/50 text-emerald-100 text-xs font-semibold disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {promoting ? 'Promoting...' : proposal.status === 'promoted' ? 'Promoted' : 'Promote to Production'}
                  </button>
                  <button
                    onClick={reject}
                    disabled={proposal.status === 'rejected'}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-200 text-xs font-semibold disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'exposure' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Exposure Probe Against Our Data</div>
                <div className="text-sm text-white">
                  Status: <span className={`font-bold ${
                    item.exposure_status === 'active' ? 'text-red-300' :
                    item.exposure_status === 'at_risk' ? 'text-orange-300' :
                    item.exposure_status === 'indicators' ? 'text-amber-300' :
                    item.exposure_status === 'clean' ? 'text-emerald-300' : 'text-slate-400'
                  }`}>{(item.exposure_status || 'unprobed').toUpperCase()}</span>
                  <span className="ml-3 text-slate-400">{hits.length} hits</span>
                </div>
              </div>
              <button onClick={runProbe} disabled={probing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold">
                {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {probing ? 'Probing...' : 'Re-probe environment'}
              </button>
            </div>

            {hits.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <div className="text-sm font-semibold text-emerald-200">No evidence of exposure found</div>
                <div className="text-[11px] text-slate-400 mt-1">The agent searched assets, events, alerts, vulnerabilities, and user behavior. Run "Re-probe" to rescan.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {hits.map((h: any) => (
                  <div key={h.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-slate-700 transition">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        h.hit_severity === 'critical' ? 'border-red-500/50 bg-red-500/15 text-red-200' :
                        h.hit_severity === 'high' ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' :
                        'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      }`}>{h.hit_severity}</span>
                      <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800/60 text-[9px] font-bold uppercase tracking-wider text-slate-300">{h.hit_type.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">{new Date(h.discovered_at).toLocaleString()}</span>
                    </div>
                    <div className="text-[12px] text-slate-200 font-medium mb-1">{h.evidence_summary}</div>
                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-500">{h.entity_type}:</span> <span className="text-slate-200">{h.entity_name}</span>
                      <span className="mx-2 text-slate-600">|</span>
                      <span className="text-slate-500">matched</span> <span className="font-mono text-amber-300">{h.matched_value}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'article' && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Summary</div>
              <p className="text-sm text-slate-300 leading-relaxed">{item.summary || '-'}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Excerpt</div>
              <div className="text-[12.5px] text-slate-400 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-lg p-3 max-h-96 overflow-y-auto">{item.content || item.summary || '(no content captured)'}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold">
                <ExternalLink className="w-3.5 h-3.5" />
                Open original article
              </a>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children, accent }: any) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/30 from-emerald-500/5',
    orange: 'border-orange-500/30 from-orange-500/5',
    cyan: 'border-cyan-500/30 from-cyan-500/5',
    amber: 'border-amber-500/30 from-amber-500/5',
  };
  const iconMap: Record<string, string> = {
    emerald: 'text-emerald-300',
    orange: 'text-orange-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br to-slate-950/80 p-4 ${colorMap[accent]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconMap[accent]}`} />
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-300">{title}</div>
      </div>
      {children}
    </div>
  );
}
