import { supabase } from './supabase';
import { DONE_STATES, type GoLiveDecision, type GoLiveDecisionType, type GoLiveItem, type GoLiveKind, type GoLiveReport, type GoLiveSeverity, type GoLiveState } from './goLiveTypes';

export * from './goLiveTypes';

interface CheckDef { id: string; group: string; title: string; kind: GoLiveKind; severity: GoLiveSeverity; why: string }

// Mirrors databricks-native/app/backend/golive.py CHECKS; keep both lists in step.
const CHECKS: CheckDef[] = [
  { id: 'config', group: 'Platform', title: 'Required settings present', kind: 'auto', severity: 'blocker', why: 'Warehouse, catalog and schema are configured and well-formed.' },
  { id: 'warehouse', group: 'Platform', title: 'SQL warehouse answers queries', kind: 'auto', severity: 'blocker', why: 'A bounded SELECT 1 canary returns within budget.' },
  { id: 'access_mode', group: 'Security', title: 'Queries run as the signed-in user', kind: 'auto', severity: 'advisory', why: 'With on-behalf-of user access, Unity Catalog row and column rules apply per person.' },
  { id: 'custody_key', group: 'Security', title: 'Chain-of-custody signing key loaded', kind: 'auto', severity: 'blocker', why: 'Live identity events are signed, not only hashed, so evidence is tamper-evident.' },
  { id: 'roles', group: 'Security', title: 'Admin and analyst roles assigned', kind: 'auto', severity: 'blocker', why: 'At least one admin and one analyst are mapped, so approvals can be separated.' },
  { id: 'identity_tables', group: 'Identity data', title: 'Identity tables exist', kind: 'auto', severity: 'blocker', why: 'Every table the Identity menu reads is present in the app schema.' },
  { id: 'identity_populated', group: 'Identity data', title: 'Identities resolved', kind: 'auto', severity: 'blocker', why: 'The resolver has produced canonical identities from at least one source.' },
  { id: 'identity_sources', group: 'Identity data', title: 'Identity sources reporting health', kind: 'auto', severity: 'advisory', why: 'Each connected identity provider writes a health row the overview can show.' },
  { id: 'lakewatch', group: 'Data sources', title: 'Lakewatch tables configured', kind: 'auto', severity: 'advisory', why: 'Lakewatch catalog, schema and tables are set so detections can be read.' },
  { id: 'llm', group: 'AI', title: 'Model serving endpoint configured', kind: 'auto', severity: 'advisory', why: 'AI summaries and answers have a primary model endpoint.' },
  { id: 'workflows', group: 'Automation', title: 'Webhook allowlist set', kind: 'auto', severity: 'advisory', why: 'Automation webhooks can only reach approved hosts.' },
  { id: 'uc_grants', group: 'Sign-off', title: 'Unity Catalog grants reviewed', kind: 'signoff', severity: 'blocker', why: 'USE CATALOG/SCHEMA and SELECT/MODIFY granted to the app principal and analyst groups, nothing broader.' },
  { id: 'user_consent', group: 'Sign-off', title: 'User authorization approved', kind: 'signoff', severity: 'blocker', why: 'Workspace admin enabled user authorization for apps and a pilot user approved the sql scope.' },
  { id: 'security_review', group: 'Sign-off', title: 'Security review completed', kind: 'signoff', severity: 'blocker', why: 'Threat model and penetration test findings are closed or accepted.' },
  { id: 'restore_test', group: 'Sign-off', title: 'Rollback and restore rehearsed', kind: 'signoff', severity: 'advisory', why: 'A rollback and a table restore (time travel) were rehearsed in staging.' },
  { id: 'runbook', group: 'Sign-off', title: 'On-call runbook and owners named', kind: 'signoff', severity: 'blocker', why: 'Owners, escalation path and the diagnostics section of the manual are known to on-call.' },
  { id: 'business_approval', group: 'Sign-off', title: 'Business owner approval', kind: 'signoff', severity: 'blocker', why: 'The accountable owner approves go-live for the agreed scope and date.' },
];

// This app has no Databricks deployment behind it, so automated checks show a sample staging snapshot.
const SAMPLE_AUTO: Record<string, [GoLiveState, string]> = {
  config: ['pass', 'All required settings present'],
  warehouse: ['pass', '412ms'],
  access_mode: ['warn', 'Runs as the app service principal; per-user Unity Catalog rules do not apply'],
  custody_key: ['pass', 'Signing key loaded'],
  roles: ['pass', '2 admin(s), 9 analyst(s)'],
  identity_tables: ['pass', 'All 30 present'],
  identity_populated: ['pass', '1,284 identities'],
  identity_sources: ['pass', '6 provider(s) reporting'],
  lakewatch: ['warn', 'LAKEWATCH_TABLES is not set'],
  llm: ['pass', 'databricks-meta-llama-3-3-70b-instruct'],
  workflows: ['warn', 'Workflow execution disabled'],
};

const byId = new Map(CHECKS.map((c) => [c.id, c]));

export function validateDecision(checkId: string, decision: GoLiveDecisionType, note: string): string {
  const check = byId.get(checkId);
  if (!check) return 'Unknown check';
  if (decision === 'signed' && check.kind !== 'signoff') return 'Automated checks cannot be signed; fix the cause or waive an advisory';
  if (decision === 'waived' && check.severity === 'blocker') return 'Blockers cannot be waived';
  if (decision !== 'revoked' && note.trim().length < 10) return 'Add a note of at least 10 characters with the evidence or reason';
  return '';
}

interface Row { check_id: string; decision: GoLiveDecisionType; note: string | null; decided_email: string | null; decided_at: string }

function evaluate(rows: Row[]): Omit<GoLiveReport, 'can_decide' | 'evaluated_at'> {
  const latest = new Map<string, Row>();
  [...rows].sort((a, b) => a.decided_at.localeCompare(b.decided_at)).forEach((r) => latest.set(r.check_id, r));
  const items: GoLiveItem[] = CHECKS.map((c) => {
    const row = latest.get(c.id);
    const decision: GoLiveDecision | null = row && row.decision !== 'revoked'
      ? { decision: row.decision, note: row.note, decided_by: row.decided_email, decided_at: row.decided_at }
      : null;
    let [state, detail]: [GoLiveState, string] = c.kind === 'auto'
      ? (SAMPLE_AUTO[c.id] ?? ['unknown', 'Not measured'])
      : decision?.decision === 'signed' ? ['signed', ''] : ['pending', 'Awaiting sign-off'];
    if (decision?.decision === 'waived' && c.severity === 'advisory' && state !== 'pass') state = 'waived';
    return { ...c, state, detail, decision };
  });
  const done = (i: GoLiveItem) => DONE_STATES.includes(i.state);
  const blockers_open = items.filter((i) => i.severity === 'blocker' && !done(i)).map((i) => i.id);
  const advisories_open = items.filter((i) => i.severity === 'advisory' && !done(i)).map((i) => i.id);
  const w = (i: GoLiveItem) => (i.severity === 'blocker' ? 3 : 1);
  const total = items.reduce((s, i) => s + w(i), 0);
  const earned = items.filter(done).reduce((s, i) => s + w(i), 0);
  return {
    verdict: blockers_open.length ? 'no_go' : advisories_open.length ? 'go_with_risks' : 'go',
    score: total ? Math.round((100 * earned) / total) : 0,
    blockers_open, advisories_open, items, sample: true,
  };
}

export const goLiveApi = {
  report: async (): Promise<GoLiveReport> => {
    const { data: session } = await supabase.auth.getSession();
    const signedIn = !!session.session;
    let rows: Row[] = [];
    if (signedIn) {
      const { data, error } = await supabase
        .from('go_live_signoffs')
        .select('check_id, decision, note, decided_email, decided_at')
        .order('decided_at', { ascending: true })
        .limit(1000);
      if (error) throw new Error('Could not load go-live decisions');
      rows = (data ?? []) as Row[];
    }
    return { ...evaluate(rows), can_decide: signedIn, evaluated_at: new Date().toISOString() };
  },
  decide: async (checkId: string, decision: GoLiveDecisionType, note: string): Promise<void> => {
    const problem = validateDecision(checkId, decision, note);
    if (problem) throw new Error(problem);
    const { error } = await supabase.from('go_live_signoffs').insert([{ check_id: checkId, decision, note: note.trim() }]);
    if (error) throw new Error('Could not save the decision. Make sure you are signed in.');
  },
};
