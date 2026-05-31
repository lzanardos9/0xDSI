import { useState, useEffect, useCallback, useRef } from 'react';

type DefconLevel = 1 | 2 | 3 | 4 | 5;
type Trending = 'up' | 'down' | 'flat';

interface Metric {
  label: string;
  value: number;
  weight: number;
}

interface SharedThreatState {
  defconLevel: DefconLevel;
  compositeRiskScore: number;
  metrics: Metric[];
  trending: Trending;
  setDefconLevel: (level: DefconLevel) => void;
}

const DEFCON_RISK_RANGES: Record<DefconLevel, [number, number]> = {
  5: [0, 25],
  4: [25, 50],
  3: [50, 70],
  2: [70, 85],
  1: [85, 100],
};

const INITIAL_METRICS: Metric[] = [
  { label: 'Network Perimeter', value: 58, weight: 0.25 },
  { label: 'Endpoint Hygiene', value: 52, weight: 0.20 },
  { label: 'Identity Risk', value: 44, weight: 0.20 },
  { label: 'Data Exposure', value: 61, weight: 0.20 },
  { label: 'Cloud Posture', value: 50, weight: 0.15 },
];

const computeComposite = (metrics: Metric[]): number => {
  let total = 0;
  for (const m of metrics) {
    total += m.value * m.weight;
  }
  return Math.round(total * 10) / 10;
};

const scoreToDefcon = (score: number): DefconLevel => {
  if (score >= 85) return 1;
  if (score >= 70) return 2;
  if (score >= 50) return 3;
  if (score >= 25) return 4;
  return 5;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const nudgeMetricsToRange = (
  metrics: Metric[],
  targetMin: number,
  targetMax: number
): Metric[] => {
  const current = computeComposite(metrics);
  const targetMid = (targetMin + targetMax) / 2;
  const diff = targetMid - current;
  if (Math.abs(diff) < 2) return metrics;

  const nudgeFactor = diff * 0.6;
  return metrics.map(m => ({
    ...m,
    value: Math.round(clamp(m.value + nudgeFactor * (0.7 + Math.random() * 0.6), 0, 100) * 10) / 10,
  }));
};

const useSharedThreatState = (): SharedThreatState => {
  const [defconLevel, setDefconLevelRaw] = useState<DefconLevel>(3);
  const [metrics, setMetrics] = useState<Metric[]>(INITIAL_METRICS);
  const [compositeRiskScore, setCompositeRiskScore] = useState(() => computeComposite(INITIAL_METRICS));
  const [trending, setTrending] = useState<Trending>('flat');
  const prevScoreRef = useRef(computeComposite(INITIAL_METRICS));

  const setDefconLevel = useCallback((level: DefconLevel) => {
    setDefconLevelRaw(level);
    const [min, max] = DEFCON_RISK_RANGES[level];
    setMetrics(prev => {
      const nudged = nudgeMetricsToRange(prev, min, max);
      const newScore = computeComposite(nudged);
      const clamped = clamp(newScore, min, max);
      if (Math.abs(clamped - newScore) > 0.5) {
        const adjusted = nudged.map(m => ({
          ...m,
          value: Math.round(clamp(m.value + (clamped - newScore) * m.weight * 2, 0, 100) * 10) / 10,
        }));
        return adjusted;
      }
      return nudged;
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(prev => {
        const next = prev.map(m => ({ ...m }));
        const indices = Array.from({ length: 5 }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const count = 2 + (Math.random() > 0.5 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const idx = indices[i];
          const delta = Math.random() * 8 - 4;
          next[idx].value = Math.round(clamp(next[idx].value + delta, 0, 100) * 10) / 10;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const newScore = computeComposite(metrics);
    const diff = newScore - prevScoreRef.current;
    if (Math.abs(diff) < 0.3) setTrending('flat');
    else if (diff > 0) setTrending('up');
    else setTrending('down');
    prevScoreRef.current = compositeRiskScore;
    setCompositeRiskScore(newScore);

    const implied = scoreToDefcon(newScore);
    setDefconLevelRaw(prev => {
      if (implied !== prev) return implied;
      return prev;
    });
  }, [metrics]);

  useEffect(() => {
    const id = setInterval(() => {
      setDefconLevelRaw(prev => {
        const roll = Math.random();
        if (roll > 0.55) return prev;
        const delta = roll > 0.3 ? -1 : 1;
        const next = clamp(prev + delta, 1, 5) as DefconLevel;
        if (next !== prev) {
          const [min, max] = DEFCON_RISK_RANGES[next];
          setMetrics(prevMetrics => nudgeMetricsToRange(prevMetrics, min, max));
        }
        return next;
      });
    }, 8000);
    return () => clearInterval(id);
  }, []);

  return {
    defconLevel,
    compositeRiskScore,
    metrics,
    trending,
    setDefconLevel,
  };
};

export default useSharedThreatState;
