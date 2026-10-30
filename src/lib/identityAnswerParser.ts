// Mirror of databricks-native/app/backend/identity_answer_parser.py; the rules themselves come from its catalogue.
import type { AnswerEntity, AnswerKind } from './identityTypes';

export interface LexiconEntry extends AnswerEntity { aliases: string[] }

export interface AnswerCatalog {
  version: string;
  max_question: number;
  refusals: { rule: string; pattern: string; reason: string; link?: string }[];
  intents: { intent: string; title: string; entity: AnswerKind[]; patterns: string[]; examples: string[] }[];
  default_intent: Record<AnswerKind, string>;
  lexicon: LexiconEntry[];
}

export interface Parsed {
  status: 'answer' | 'refused' | 'clarify' | 'need_entity' | 'no_match';
  intent?: string | null;
  entity?: AnswerEntity | null;
  options?: AnswerEntity[];
  kinds?: AnswerKind[];
  reason?: string;
  link?: string | null;
  rule?: string;
}

const KINDS: AnswerKind[] = ['identity', 'resource', 'group', 'trust'];

export function normalize(text: string): string {
  const tokens = (text || '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').split(' ')
    .map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean);
  return ` ${tokens.join(' ')} `;
}

export function parse(question: string, c: AnswerCatalog): Parsed {
  const q = normalize(question);
  for (const r of c.refusals) {
    if (new RegExp(r.pattern).test(q.trim())) return { status: 'refused', reason: r.reason, link: r.link ?? null, rule: r.rule };
  }

  const hits: { n: number; e: LexiconEntry }[] = [];
  for (const e of c.lexicon) {
    const n = Math.max(0, ...e.aliases.filter((a) => q.includes(` ${a} `)).map((a) => a.length));
    if (n) hits.push({ n, e });
  }
  let intent = c.intents.find((i) => i.patterns.some((p) => new RegExp(p).test(q)));
  const byName = (name: string) => c.intents.find((i) => i.intent === name);
  const strip = (e: LexiconEntry): AnswerEntity => ({ kind: e.kind, id: e.id, label: e.label });

  const pick = (kinds: AnswerKind[]): [LexiconEntry | null, LexiconEntry[]] => {
    const found = hits.filter((h) => kinds.includes(h.e.kind));
    if (!found.length) return [null, []];
    const top = Math.max(...found.map((h) => h.n));
    const best = found.filter((h) => h.n === top).map((h) => h.e)
      .sort((a, b) => (a.kind === b.kind ? (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) : a.kind < b.kind ? -1 : 1));
    return [best.length === 1 ? best[0] : null, best];
  };

  if (intent && !intent.entity.length) return { status: 'answer', intent: intent.intent, entity: null };
  let entity: LexiconEntry | null;
  let tied: LexiconEntry[];
  if (intent) {
    [entity, tied] = pick(intent.entity);
    if (!entity && !tied.length && hits.length) {
      [entity, tied] = pick(KINDS);
      if (entity) intent = byName(c.default_intent[entity.kind]);
    }
  } else {
    [entity, tied] = pick(KINDS);
    if (entity) intent = byName(c.default_intent[entity.kind]);
  }
  if (tied.length && !entity) return { status: 'clarify', intent: intent ? intent.intent : null, options: tied.slice(0, 6).map(strip) };
  if (!intent) return { status: 'no_match' };
  if (!entity) return { status: 'need_entity', intent: intent.intent, kinds: intent.entity };
  return { status: 'answer', intent: intent.intent, entity: strip(entity) };
}
