export type GoLiveSeverity = 'blocker' | 'advisory';
export type GoLiveKind = 'auto' | 'signoff';
export type GoLiveState = 'pass' | 'warn' | 'fail' | 'unknown' | 'pending' | 'signed' | 'waived';
export type GoLiveDecisionType = 'signed' | 'waived' | 'revoked';
export type GoLiveVerdict = 'go' | 'go_with_risks' | 'no_go';

export interface GoLiveDecision {
  decision: GoLiveDecisionType;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface GoLiveItem {
  id: string;
  group: string;
  title: string;
  kind: GoLiveKind;
  severity: GoLiveSeverity;
  why: string;
  state: GoLiveState;
  detail: string;
  decision: GoLiveDecision | null;
}

export interface GoLiveReport {
  verdict: GoLiveVerdict;
  score: number;
  blockers_open: string[];
  advisories_open: string[];
  items: GoLiveItem[];
  can_decide: boolean;
  evaluated_at: string;
  sample?: boolean;
}

export const DONE_STATES: GoLiveState[] = ['pass', 'signed', 'waived'];

export function isGoLiveReport(v: unknown): v is GoLiveReport {
  const r = v as GoLiveReport;
  return !!r && typeof r === 'object' && typeof r.verdict === 'string' && typeof r.score === 'number' && Array.isArray(r.items);
}
