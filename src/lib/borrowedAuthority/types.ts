export type ObaEvent = {
  event_id: string;
  branch: string;
  execution_id: string;
  agent_id: string;
  source_system: string;
  event_type: string;
  event_time: string;
  ingest_time: string;
  arrival_seq: number;
  trace_id: string;
  tenant_id: string;
  dedupe_key: string;
  trust: 'high' | 'medium' | 'low' | string;
  payload: Record<string, unknown>;
};

export type ObaAuthorization = {
  authorization_id: string;
  issuer: string;
  issuer_type: 'human_admin' | 'change_management' | 'autonomous_agent' | string;
  subject_agent: string;
  execution_id: string;
  operation: string;
  resource: string;
  valid_from: string | null;
  valid_until: string | null;
  signature_valid: boolean;
  status: string;
  ingest_time: string;
  arrival_seq: number;
  note: string;
};

export type StageMatch = {
  key: string;
  label: string;
  matched: boolean;
  eventId?: string;
  detail?: string;
  atEventTime?: string;
};

export type AuthResolution = {
  authorization_id: string | null;
  covered: boolean;
  reason: string;
};

export type BranchVerdict = {
  branch: string;
  title: string;
  agent: string;
  execution: string;
  kind: 'control' | 'provisional' | 'attack';
  status: 'BENIGN' | 'PROVISIONAL' | 'WITHDRAWN' | 'CONFIRMED_MALICIOUS';
  stages: StageMatch[];
  completeness: number;
  currentStageLabel: string;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  matchedEventIds: string[];
  narrative: string;
};

export type EvidenceFamily = {
  source_system: string;
  count: number;
  trust: string;
  eventIds: string[];
};

export type Conflict = {
  kind: string;
  label: string;
  detail: string;
  resolution: string;
};

export type FuseResult = {
  totalObservations: number;
  distinctObservations: number;
  duplicatesRemoved: number;
  families: EvidenceFamily[];
  independentFamilies: number;
  conflicts: Conflict[];
  belief: number;
  plausibility: number;
  uncertainty: number;
  beliefLabel: string;
};

export type HypothesisScore = {
  id: string;
  label: string;
  description: string;
  score: number;
  supporting: string[];
  against: string[];
};

export type NegativeSignal = {
  label: string;
  state: 'confirmed_absence' | 'telemetry_unavailable';
  detail: string;
};

export type ConfluenceResult = {
  hypotheses: HypothesisScore[];
  winner: HypothesisScore;
  verdict: string;
  rationale: string[];
  negatives: NegativeSignal[];
};

export type AnalysisResult = {
  branches: BranchVerdict[];
  fuse: FuseResult;
  confluence: ConfluenceResult;
  reorderedC: ObaEvent[];
  arrivalC: ObaEvent[];
  lateEvidenceCount: number;
  includeLateEvidence: boolean;
};
