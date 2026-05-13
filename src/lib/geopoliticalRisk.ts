import { supabase } from './supabase';

export interface GeopoliticalEvent {
  id: string;
  external_id: string;
  source: string;
  category: string;
  severity: number;
  headline: string;
  summary: string;
  country_code: string;
  country_name: string;
  region: string;
  lat: number;
  lon: number;
  url: string;
  tone: number;
  acmeco_exposure_score: number;
  exposure_assets: { name: string; distance_km: number; criticality: number }[];
  occurred_at: string;
  fetched_at: string;
}

export interface ExposureZone {
  id: string;
  name: string;
  asset_type: string;
  criticality: number;
  country_code: string;
  country_name: string;
  city: string;
  lat: number;
  lon: number;
  headcount: number;
  revenue_share_pct: number;
  notes: string;
}

export const RISK_CATEGORIES = [
  { id: 'armed_conflict',   label: 'Armed Conflict',   color: '#dc2626', hex: 0xdc2626 },
  { id: 'civil_unrest',     label: 'Civil Unrest',     color: '#ea580c', hex: 0xea580c },
  { id: 'protest',          label: 'Protests',         color: '#f59e0b', hex: 0xf59e0b },
  { id: 'strike',           label: 'Strikes',          color: '#eab308', hex: 0xeab308 },
  { id: 'sanctions',        label: 'Sanctions',        color: '#0ea5e9', hex: 0x0ea5e9 },
  { id: 'political',        label: 'Political',        color: '#06b6d4', hex: 0x06b6d4 },
  { id: 'natural_disaster', label: 'Natural Disaster', color: '#10b981', hex: 0x10b981 },
  { id: 'seismic',          label: 'Seismic',          color: '#84cc16', hex: 0x84cc16 },
  { id: 'wildfire',         label: 'Wildfire',         color: '#f97316', hex: 0xf97316 },
  { id: 'cyber_state',      label: 'State Cyber',      color: '#e11d48', hex: 0xe11d48 },
  { id: 'financial_risk',   label: 'Financial Risk',   color: '#fb7185', hex: 0xfb7185 },
] as const;

export type RiskCategoryId = (typeof RISK_CATEGORIES)[number]['id'];

export function categoryMeta(id: string) {
  return RISK_CATEGORIES.find((c) => c.id === id) ?? { id, label: id, color: '#94a3b8', hex: 0x94a3b8 };
}

export async function fetchGeopoliticalEvents(limit = 200): Promise<GeopoliticalEvent[]> {
  const { data, error } = await supabase
    .from('geopolitical_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GeopoliticalEvent[];
}

export async function fetchExposureZones(): Promise<ExposureZone[]> {
  const { data, error } = await supabase
    .from('acmeco_exposure_zones')
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return (data ?? []) as ExposureZone[];
}

export interface CyberGeoCorrelation {
  id: string;
  geo_event_id: string;
  geo_event_headline: string;
  cyber_attack_type: string;
  cyber_threat_actor: string;
  cyber_source_country: string;
  cyber_source_lat: number;
  cyber_source_lon: number;
  target_lat: number;
  target_lon: number;
  severity: number;
  confidence_score: number;
  correlation_narrative: string;
  detected_iocs: string[];
  acmeco_impact: string;
  recommended_action: string;
  occurred_at: string;
}

export async function fetchCyberGeoCorrelations(): Promise<CyberGeoCorrelation[]> {
  const { data, error } = await supabase
    .from('cyber_geo_correlations')
    .select('*')
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CyberGeoCorrelation[];
}

export async function refreshFeeds(): Promise<{ ok: boolean; total_ingested: number }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geopolitical-risk-fetch`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  return resp.json();
}
