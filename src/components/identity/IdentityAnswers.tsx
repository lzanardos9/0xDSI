import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, HelpCircle, History, MessageSquareText, Send, ShieldOff, Sparkles } from 'lucide-react';
import { identityApi, type AnswerHistoryItem, type AnswerIntent, type AnswerResult } from '../../lib/identityApi';
import { Card, ErrorBanner, PageHeader, Tag, fmtTime } from './identityUi';

const VIEW_LABEL: Record<string, string> = {
  id_risk: 'Identity Risk', id_graph: 'Access Graph', id_timeline: 'Identity Timeline', id_groups: 'Group Context',
  id_federation: 'Federation Posture', id_remediation: 'Identity Remediation', id_explorer: 'Identity Explorer',
};
const KIND_WORD = { identity: 'person or account', resource: 'system', group: 'group', trust: 'trust or partner' };

function Sources({ r }: { r: AnswerResult }) {
  const [open, setOpen] = useState(false);
  const cites = r.answer?.citations || [];
  if (!cites.length) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
        <BookOpen size={11} /> {cites.length} source row{cites.length > 1 ? 's' : ''} <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {cites.map((c, i) => (
            <li key={`${c.key}-${i}`} className="text-[11px] text-slate-400"><span className="font-mono text-slate-500">{c.source}</span> · {c.label || c.key}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultCard({ r, examples, onAsk, onNavigate }: {
  r: AnswerResult; examples: string[]; onAsk: (q: string) => void; onNavigate?: (v: string) => void;
}) {
  const a = r.answer;
  const goto = (view: string | null | undefined) => view && onNavigate && (
    <button onClick={() => onNavigate(view)} className="inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200 transition-colors">
      Open {VIEW_LABEL[view] || view} <ArrowRight size={12} />
    </button>
  );
  const chips = (list: string[]) => (
    <div className="flex flex-wrap gap-2 mt-3">
      {list.map((q) => (
        <button key={q} onClick={() => onAsk(q)} className="px-2.5 py-1 rounded-lg border border-slate-700/60 text-xs text-slate-300 hover:border-teal-500/50 hover:text-teal-200 transition-colors">{q}</button>
      ))}
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex justify-end mb-2">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-teal-600/20 border border-teal-500/30 px-4 py-2 text-sm text-teal-50">{r.question}</div>
      </div>
      <Card className="p-4">
        {r.status === 'answer' && a && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {r.entity && <Tag tone="blue">{r.entity.label}</Tag>}
              <span className="text-[11px] text-slate-500">{r.as_of ? `Data as of ${fmtTime(r.as_of)}` : ''}</span>
            </div>
            <div className="text-base font-semibold text-slate-100">{a.headline}</div>
            {a.sentences.map((s, i) => <p key={i} className="text-sm text-slate-400 mt-1 leading-relaxed">{s}</p>)}
            {a.rows.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/60 text-slate-500">
                    <tr>{a.columns.map((c) => <th key={c} className="text-left font-medium px-3 py-2 whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {a.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                        {row.map((v, j) => <td key={j} className={`px-3 py-2 align-top ${j === 0 ? 'text-slate-200' : 'text-slate-400'}`}>{v ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {a.truncated > 0 && <div className="text-[11px] text-slate-500 mt-2">{a.truncated} more not shown.</div>}
            <div className="flex items-center justify-between mt-3">{goto(a.link?.view)}<span /></div>
            <Sources r={r} />
          </>
        )}
        {r.status === 'refused' && (
          <div className="flex gap-3">
            <ShieldOff size={16} className="text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm text-amber-100">{r.reason}</div>
              <div className="mt-2">{goto(r.link)}</div>
            </div>
          </div>
        )}
        {r.status === 'clarify' && (
          <div>
            <div className="flex gap-2 text-sm text-slate-200"><HelpCircle size={16} className="text-teal-300 mt-0.5" /> More than one match. Which did you mean?</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {(r.options || []).map((o) => (
                <button key={`${o.kind}-${o.id}`} onClick={() => onAsk(`${r.question} ${o.label}`)}
                  className="px-3 py-1.5 rounded-lg border border-teal-500/40 bg-teal-500/5 text-xs text-teal-100 hover:bg-teal-500/15 transition-colors">
                  {o.label} <span className="text-slate-500">({KIND_WORD[o.kind]})</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {r.status === 'need_entity' && (
          <div>
            <div className="flex gap-2 text-sm text-slate-200"><HelpCircle size={16} className="text-teal-300 mt-0.5" />
              Which {(r.kinds || []).map((k) => KIND_WORD[k]).join(' or ')} do you mean? Name it in the question.</div>
            {chips(examples.slice(0, 3))}
          </div>
        )}
        {r.status === 'no_match' && (
          <div>
            <div className="flex gap-2 text-sm text-slate-200"><HelpCircle size={16} className="text-slate-400 mt-0.5" />
              I can only answer approved identity questions. Try one of these:</div>
            {chips(examples.slice(0, 4))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function IdentityAnswers({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [intents, setIntents] = useState<AnswerIntent[]>([]);
  const [maxLen, setMaxLen] = useState(300);
  const [history, setHistory] = useState<AnswerHistoryItem[]>([]);
  const [thread, setThread] = useState<AnswerResult[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(() => {
    identityApi.answerHistory().then((d) => setHistory(d.questions)).catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    identityApi.answerCatalog().then((c) => { setIntents(c.intents); setMaxLen(c.max_question); }).catch((e: Error) => setError(e.message));
    loadHistory();
  }, [loadHistory]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await identityApi.ask(text);
      setThread((t) => [...t, r].slice(-20));
      setQuestion('');
      loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const examples = intents.flatMap((i) => i.examples);

  return (
    <div className="p-6 lg:p-8 bg-[#0A1628] min-h-full">
      <PageHeader
        icon={MessageSquareText}
        title="Identity Answers"
        subtitle="Ask about people, systems, groups and partner trusts in plain words. Answers come only from the identity datalake, list the rows they used, and every question is logged."
      />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4 min-w-0">
          {thread.length === 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 text-sm text-slate-200 mb-1"><Sparkles size={15} className="text-teal-300" /> Things you can ask</div>
              <div className="text-xs text-slate-500 mb-4">No free-form database access: each question maps to one approved, read-only answer.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {intents.map((i) => (
                  <button key={i.intent} onClick={() => ask(i.examples[0])}
                    className="text-left rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2.5 hover:border-teal-500/50 hover:bg-teal-500/5 transition-all group">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 group-hover:text-teal-300 transition-colors">{i.title}</div>
                    <div className="text-sm text-slate-200 mt-0.5">{i.examples[0]}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {thread.map((r) => <ResultCard key={r.question_id} r={r} examples={examples} onAsk={ask} onNavigate={onNavigate} />)}
          {busy && <div className="text-xs text-slate-500 pl-1 animate-pulse">Looking it up</div>}
          {error && <ErrorBanner message={error} />}
          <div ref={end} />
          <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
            className="sticky bottom-4 flex items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/90 backdrop-blur px-3 py-2 shadow-xl shadow-black/30 focus-within:border-teal-500/60 transition-colors">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={maxLen}
              placeholder="Who can reach Domain Controllers?" aria-label="Your question"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none py-1.5" />
            <button type="submit" disabled={busy || !question.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-sm text-white transition-colors disabled:opacity-40">
              <Send size={13} /> Ask
            </button>
          </form>
        </div>

        <Card className="overflow-hidden self-start">
          <div className="px-4 py-2.5 border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><History size={12} /> Your recent questions</div>
          {history.length === 0 ? <div className="px-4 py-4 text-xs text-slate-500">Nothing asked yet.</div> : (
            <div className="divide-y divide-slate-800">
              {history.map((h) => (
                <button key={h.question_id} onClick={() => ask(h.question)} className="w-full text-left px-4 py-2.5 hover:bg-slate-800/50 transition-colors">
                  <div className="text-xs text-slate-300 line-clamp-2">{h.question}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{h.status === 'answer' ? 'answered' : h.status.replace('_', ' ')} · {fmtTime(h.asked_at)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
