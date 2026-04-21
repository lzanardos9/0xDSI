// ---------------------------------------------------------------------------
// Insider Credential Selling -- Shared Types
// ---------------------------------------------------------------------------

export interface BehavioralFingerprint {
  operator_id: string;
  label: string;
  typing_wpm: number;
  click_velocity: number;
  mouse_pattern: 'organic' | 'semi-organic' | 'scripted' | 'bot';
  active_hours: [number, number];
  sessions_last_30d: number;
  scroll_depth?: number;
  navigation?: string[];
  first_seen?: string;
  last_seen?: string;
  api_usage_pattern?: string;
  endpoints_accessed?: string[];
}

export interface HandoffEvent {
  timestamp: string;
  event: string;
  detail: string;
}

export interface FinancialIndicator {
  type: 'crypto_receipt' | 'pix_incoming' | 'cash_deposit';
  amount_usd?: number;
  amount_brl?: number;
  timestamp: string;
  source?: string;
  detail: string;
}

export interface MultiOperatorEvidence {
  total_operators_detected: number;
  behavioral_divergence_score?: number;
  evidence_strength: 'weak' | 'moderate' | 'strong';
  session_handoff_pattern?: string;
  overlap_sessions?: number;
  distinct_ip_ranges?: number;
  distinct_device_fingerprints?: number;
  operator_switching_frequency?: string;
  external_ip_usage?: boolean;
  api_key_sharing_detected?: boolean;
  data_exfiltration_volume?: string;
  admin_endpoint_access_by_external?: boolean;
}

export interface CredentialRotationEvent {
  type: string;
  timestamp: string;
  initiated_by?: string;
  correlated_event?: string;
  detail?: string;
  count?: number;
  scope?: string;
  normal_rate?: string;
}

export interface NetworkConnection {
  entity: string;
  type: string;
  relationship: string;
  confidence: number;
}

export interface DarkWebIntel {
  marketplace?: string;
  seller_handle?: string;
  price_usd?: number;
  listing_active?: boolean;
  buyer_count?: number;
  listing_url?: string;
  listing_age_days?: number;
  includes_pix_keys?: boolean;
  seller_reputation?: number;
  includes_2fa_method?: string;
  channel?: string;
  listing_type?: string;
}

export interface PsychBehavioralSignal {
  signal: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'info';
  detail: string;
  confidence: number;
}

export interface PsychPredictiveFactor {
  factor: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
}

export interface PsychCrossPlatformPattern {
  pattern: string;
  source: string;
  correlation: number;
}

export interface PsychologicalAssessment {
  risk_score: number;
  risk_label: string;
  personality_profile: {
    big_five?: {
      openness: number;
      conscientiousness: number;
      extraversion: number;
      agreeableness: number;
      neuroticism: number;
    };
    dark_triad?: {
      narcissism: number;
      machiavellianism: number;
      psychopathy: number;
    };
    risk_indicators?: Record<string, number>;
  };
  behavioral_signals: PsychBehavioralSignal[];
  llm_narrative: string;
  predictive_factors: PsychPredictiveFactor[];
  recommended_interventions: string[];
  cross_platform_patterns: PsychCrossPlatformPattern[];
  confidence: number;
  assessed_at?: string;
  model_version?: string;
}

export interface CredentialSellingCase {
  id: string;
  case_id: string;
  entity_id: string;
  entity_name: string;
  account_type: 'banking' | 'api_key' | 'internal_access' | 'vpn' | 'email';
  seller_confidence: number;
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  status: 'monitoring' | 'suspected' | 'confirmed' | 'neutralized' | 'false_positive';
  detection_method: string;
  first_indicator_at: string | null;
  dark_web_intel: DarkWebIntel | null;
  behavioral_fingerprints: BehavioralFingerprint[] | null;
  handoff_timeline: HandoffEvent[] | null;
  financial_indicators: FinancialIndicator[] | null;
  multi_operator_evidence: MultiOperatorEvidence | null;
  credential_rotation_events: CredentialRotationEvent[] | null;
  network_connections: NetworkConnection[] | null;
  psychological_assessment: PsychologicalAssessment | null;
  investigation_notes: string | null;
  created_at: string;
}

export interface DarkWebHit {
  id: string;
  hit_id: string;
  marketplace: string;
  listing_type: string;
  entity_id: string;
  listing_price: number;
  currency: string;
  seller_handle: string;
  seller_reputation: number;
  listing_description: string;
  verification_status: string;
  credential_freshness: 'current' | 'recent' | 'stale' | 'unknown';
  includes_2fa_bypass: boolean;
  sample_data: Record<string, unknown> | null;
  discovered_at: string;
  last_checked_at: string;
}
