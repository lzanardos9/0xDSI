export interface ThreatEscalationInput {
  initialSeverity: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  targetAssetIp?: string;
  targetAssetHostname?: string;
  sourceIp?: string;
  eventPort?: number;
  vulnerabilities?: string[];
}

export interface PriorityCalculation {
  severityScore: number;
  modelConfidence: number;
  relevanceScore: number;
  mcrFactor: number;
  threatWeight: number;
  assetCriticality: number;
  finalPriority: number;
  priorityLevel: string;
  details: {
    severityExplanation: string;
    mcrExplanation: string;
    threatExplanation: string;
    assetExplanation: string;
  };
}

const SEVERITY_SCORES: Record<string, number> = {
  very_low: 2,
  low: 4,
  medium: 6,
  high: 8,
  very_high: 10,
};

const CRITICALITY_SCORES: Record<string, number> = {
  very_low: 0.5,
  low: 0.75,
  medium: 1.0,
  high: 1.5,
  very_high: 2.0,
};

export class ThreatEscalationEngine {
  static calculatePriority(
    input: ThreatEscalationInput,
    assetData?: any,
    threatIntelData?: any,
    formula?: any
  ): PriorityCalculation {
    const severityScore = SEVERITY_SCORES[input.initialSeverity] || 6;

    const { modelConfidence, relevanceScore } = this.calculateMCR(
      input,
      assetData
    );

    const mcrFactor = (modelConfidence / 10.0) * relevanceScore;

    const threatWeight = this.calculateThreatWeight(
      input.sourceIp,
      threatIntelData
    );

    const assetCriticality = assetData
      ? assetData.criticality_score
      : CRITICALITY_SCORES.medium;

    const severityWeight = formula?.severity_weight || 1.0;
    const mcrWeight = formula?.mcr_weight || 1.0;
    const threatMultiplier = formula?.threat_weight_multiplier || 0.03;
    const assetWeight = formula?.asset_weight || 1.0;

    const finalPriority =
      (severityScore * severityWeight) *
      (mcrFactor * mcrWeight) *
      (threatWeight * (1 + (threatMultiplier * 100))) *
      (assetCriticality * assetWeight);

    const priorityLevel = this.getPriorityLevel(finalPriority);

    return {
      severityScore,
      modelConfidence,
      relevanceScore,
      mcrFactor,
      threatWeight,
      assetCriticality,
      finalPriority: Math.round(finalPriority * 100) / 100,
      priorityLevel,
      details: {
        severityExplanation: `Initial severity: ${input.initialSeverity} (score: ${severityScore}/10)`,
        mcrExplanation: `Model Confidence: ${modelConfidence}/10, Relevance: ${relevanceScore}, Combined MCR: ${mcrFactor.toFixed(2)}`,
        threatExplanation: `Threat intelligence weight: ${threatWeight.toFixed(2)}`,
        assetExplanation: `Asset criticality: ${assetCriticality}x multiplier`,
      },
    };
  }

  private static calculateMCR(
    input: ThreatEscalationInput,
    assetData?: any
  ): { modelConfidence: number; relevanceScore: number } {
    let modelConfidence = 5.0;
    let relevanceScore = 0.5;

    if (assetData) {
      modelConfidence = assetData.model_confidence || 5.0;

      if (assetData.discovery_method === 'manual') {
        modelConfidence = Math.min(modelConfidence + 2, 10);
      } else if (assetData.discovery_method === 'agent') {
        modelConfidence = Math.min(modelConfidence + 1, 10);
      }

      if (input.eventPort && assetData.exposed_ports) {
        const portExposed = assetData.exposed_ports.includes(input.eventPort);
        if (portExposed) {
          relevanceScore += 0.3;
        }
      }

      if (input.vulnerabilities && assetData.known_vulnerabilities) {
        const hasMatchingVuln = input.vulnerabilities.some((vuln: string) =>
          assetData.known_vulnerabilities.some((assetVuln: any) =>
            assetVuln.cve === vuln || assetVuln.id === vuln
          )
        );
        if (hasMatchingVuln) {
          relevanceScore += 0.4;
        }
      }

      relevanceScore = Math.min(relevanceScore, 1.0);
    } else {
      modelConfidence = 3.0;
      relevanceScore = 0.3;
    }

    return { modelConfidence, relevanceScore };
  }

  private static calculateThreatWeight(
    sourceIp?: string,
    threatIntelData?: any
  ): number {
    if (!sourceIp || !threatIntelData) {
      return 1.0;
    }

    const matchingThreats = threatIntelData.filter(
      (threat: any) =>
        threat.indicator_value === sourceIp && threat.is_active
    );

    if (matchingThreats.length === 0) {
      return 1.0;
    }

    const avgThreatSeverity =
      matchingThreats.reduce(
        (sum: number, t: any) => sum + (t.threat_severity || 5),
        0
      ) / matchingThreats.length;

    const weight = 1 + (avgThreatSeverity * 3) / 100;

    return weight;
  }

  private static getPriorityLevel(score: number): string {
    if (score >= 9.0) return 'critical';
    if (score >= 7.0) return 'very_high';
    if (score >= 5.0) return 'high';
    if (score >= 3.0) return 'medium';
    if (score >= 1.0) return 'low';
    return 'very_low';
  }

  static getSeverityColor(level: string): string {
    switch (level) {
      case 'critical':
        return 'bg-red-600/20 text-red-400 border-red-500/50';
      case 'very_high':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'very_low':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  }

  static async calculateAndStore(
    eventId: string,
    input: ThreatEscalationInput,
    supabase: any
  ): Promise<PriorityCalculation | null> {
    try {
      const [formulaResult, assetResult, threatIntelResult] = await Promise.all([
        supabase
          .from('threat_escalation_formulas')
          .select('*')
          .eq('is_active', true)
          .single(),
        input.targetAssetIp
          ? supabase
              .from('asset_registry')
              .select('*')
              .eq('ip_address', input.targetAssetIp)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        input.sourceIp
          ? supabase
              .from('threat_intelligence_sources')
              .select('*')
              .eq('indicator_value', input.sourceIp)
              .eq('is_active', true)
          : Promise.resolve({ data: [] }),
      ]);

      const formula = formulaResult.data;
      const assetData = assetResult.data;
      const threatIntelData = threatIntelResult.data || [];

      const calculation = this.calculatePriority(
        input,
        assetData,
        threatIntelData,
        formula
      );

      await supabase.from('event_priority_calculations').insert({
        event_id: eventId,
        formula_id: formula?.id,
        initial_severity: input.initialSeverity,
        severity_score: calculation.severityScore,
        model_confidence: calculation.modelConfidence,
        relevance_score: calculation.relevanceScore,
        mcr_factor: calculation.mcrFactor,
        threat_weight: calculation.threatWeight,
        asset_criticality: calculation.assetCriticality,
        final_priority: calculation.finalPriority,
        priority_level: calculation.priorityLevel,
        calculation_details: calculation.details,
      });

      return calculation;
    } catch (error) {
      console.error('Error calculating priority:', error);
      return null;
    }
  }
}
