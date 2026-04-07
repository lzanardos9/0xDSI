export interface RawSecurityEvent {
  event_timestamp: string;
  raw_payload: any;
  source_system?: string;
  source_ip?: string;
  destination_ip?: string;
}

export interface SemanticSearchResult {
  event_id: string;
  similarity: number;
  event_summary: string;
  event_timestamp: string;
  raw_payload: any;
}

export interface CorrelationMatch {
  rule_id: string;
  rule_name: string;
  similarity: number;
  description: string;
}

export class VectorEmbeddingEngine {
  private static mockEmbeddings: Map<string, number[]> = new Map();

  static generateMockEmbedding(dimension: number = 1536): number[] {
    const embedding = new Array(dimension);
    for (let i = 0; i < dimension; i++) {
      embedding[i] = Math.random() * 2 - 1;
    }
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  static async generateEmbedding(text: string): Promise<number[]> {
    if (this.mockEmbeddings.has(text)) {
      return this.mockEmbeddings.get(text)!;
    }

    const embedding = this.generateMockEmbedding();
    this.mockEmbeddings.set(text, embedding);
    return embedding;
  }

  static formatEventForEmbedding(event: RawSecurityEvent): string {
    const parts = [
      `Timestamp: ${event.event_timestamp}`,
      event.source_system ? `Source: ${event.source_system}` : '',
      event.source_ip ? `From IP: ${event.source_ip}` : '',
      event.destination_ip ? `To IP: ${event.destination_ip}` : '',
      `Event Data: ${JSON.stringify(event.raw_payload)}`,
    ].filter(Boolean);

    return parts.join(' | ');
  }

  static async generateEventSummary(event: RawSecurityEvent): Promise<string> {
    const payload = event.raw_payload;

    if (payload.action) {
      return `${payload.action} from ${event.source_ip || 'unknown'} to ${event.destination_ip || 'unknown'}`;
    }

    if (payload.event_type) {
      return `${payload.event_type} event detected on ${event.source_system || 'system'}`;
    }

    return `Security event from ${event.source_ip || 'unknown source'}`;
  }

  static async processRawEvent(
    event: RawSecurityEvent,
    supabase: any
  ): Promise<string> {
    const eventText = this.formatEventForEmbedding(event);
    const embedding = await this.generateEmbedding(eventText);
    const summary = await this.generateEventSummary(event);

    const { data, error } = await supabase
      .from('raw_security_events')
      .insert({
        event_timestamp: event.event_timestamp,
        raw_payload: event.raw_payload,
        event_embedding: `[${embedding.join(',')}]`,
        event_summary: summary,
        source_system: event.source_system,
        source_ip: event.source_ip,
        destination_ip: event.destination_ip,
        event_type_detected: this.detectEventType(event),
        threat_indicators: this.extractThreatIndicators(event),
      })
      .select('id')
      .single();

    if (error) throw error;

    await this.checkCorrelationRules(data.id, embedding, supabase);

    return data.id;
  }

  private static detectEventType(event: RawSecurityEvent): string {
    const payload = event.raw_payload;

    if (payload.authentication || payload.login) return 'authentication';
    if (payload.network || payload.connection) return 'network';
    if (payload.file || payload.filesystem) return 'file_access';
    if (payload.process || payload.execution) return 'process';
    if (payload.malware || payload.threat) return 'malware';

    return 'unknown';
  }

  private static extractThreatIndicators(event: RawSecurityEvent): any[] {
    const indicators = [];
    const payload = event.raw_payload;

    if (event.source_ip) {
      indicators.push({ type: 'ip', value: event.source_ip });
    }

    if (payload.hash || payload.md5 || payload.sha256) {
      indicators.push({
        type: 'hash',
        value: payload.hash || payload.md5 || payload.sha256,
      });
    }

    if (payload.domain || payload.url) {
      indicators.push({
        type: 'domain',
        value: payload.domain || payload.url,
      });
    }

    return indicators;
  }

  private static async checkCorrelationRules(
    eventId: string,
    embedding: number[],
    supabase: any
  ): Promise<void> {
    try {
      const { data: rules } = await supabase.rpc('match_correlation_rules', {
        event_embedding: `[${embedding.join(',')}]`,
      });

      if (rules && rules.length > 0) {
        for (const rule of rules) {
          await supabase.from('vector_correlations').insert({
            rule_id: rule.rule_id,
            event_ids: [eventId],
            correlation_type: 'similarity_match',
            similarity_score: rule.similarity,
            threat_narrative: `Matched rule "${rule.rule_name}" with ${(rule.similarity * 100).toFixed(1)}% similarity`,
            severity: rule.similarity > 0.9 ? 'high' : 'medium',
          });
        }
      }
    } catch (error) {
      console.error('Error checking correlation rules:', error);
    }
  }

  static async semanticSearch(
    query: string,
    supabase: any,
    threshold: number = 0.8,
    limit: number = 10
  ): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const { data, error } = await supabase.rpc('search_similar_events', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Semantic search error:', error);
      return [];
    }

    return data || [];
  }

  static async createHuntQuery(
    queryName: string,
    naturalLanguageQuery: string,
    supabase: any,
    timeRange?: { start: string; end: string }
  ): Promise<string> {
    const queryEmbedding = await this.generateEmbedding(naturalLanguageQuery);

    const { data, error } = await supabase
      .from('threat_hunt_queries')
      .insert({
        query_name: queryName,
        natural_language_query: naturalLanguageQuery,
        query_embedding: `[${queryEmbedding.join(',')}]`,
        hunt_type: 'semantic_search',
        time_range_start: timeRange?.start,
        time_range_end: timeRange?.end,
        hunter: 'current_user',
        status: 'running',
      })
      .select('id')
      .single();

    if (error) throw error;

    setTimeout(async () => {
      const results = await this.semanticSearch(
        naturalLanguageQuery,
        supabase,
        0.75,
        20
      );

      await supabase
        .from('threat_hunt_queries')
        .update({
          status: 'completed',
          results_count: results.length,
          findings: results,
          completed_at: new Date().toISOString(),
        })
        .eq('id', data.id);
    }, 1000);

    return data.id;
  }

  static async createVectorCorrelationRule(
    ruleName: string,
    description: string,
    examplePatterns: string[],
    ruleType: string,
    threshold: number,
    supabase: any
  ): Promise<string> {
    const combinedText = `${description} Examples: ${examplePatterns.join('; ')}`;
    const patternEmbedding = await this.generateEmbedding(combinedText);

    const { data, error } = await supabase
      .from('vector_correlation_rules')
      .insert({
        rule_name: ruleName,
        description,
        rule_type: ruleType,
        pattern_embedding: `[${patternEmbedding.join(',')}]`,
        similarity_threshold: threshold,
        example_patterns: examplePatterns,
        confidence_score: 75.0,
        enabled: true,
        tags: ['user-created', 'ml-based'],
        created_by: 'current_user',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }

  static async findSimilarEvents(
    eventId: string,
    supabase: any,
    threshold: number = 0.85
  ): Promise<any[]> {
    const { data: targetEvent } = await supabase
      .from('raw_security_events')
      .select('event_embedding, event_summary')
      .eq('id', eventId)
      .single();

    if (!targetEvent || !targetEvent.event_embedding) return [];

    const { data: similarEvents } = await supabase.rpc('search_similar_events', {
      query_embedding: targetEvent.event_embedding,
      match_threshold: threshold,
      match_count: 20,
    });

    return similarEvents || [];
  }
}

export class AICorrelationEngine {
  static async analyzeAttackChain(
    eventIds: string[],
    supabase: any
  ): Promise<{
    chain: any[];
    narrative: string;
    severity: string;
  }> {
    const { data: events } = await supabase
      .from('raw_security_events')
      .select('*')
      .in('id', eventIds)
      .order('event_timestamp', { ascending: true });

    if (!events || events.length === 0) {
      return { chain: [], narrative: '', severity: 'low' };
    }

    const chain = events.map((event: any, index: number) => ({
      step: index + 1,
      timestamp: event.event_timestamp,
      action: event.event_type_detected,
      summary: event.event_summary,
      indicators: event.threat_indicators,
    }));

    const narrative = this.generateThreatNarrative(chain);
    const severity = this.calculateChainSeverity(chain);

    return { chain, narrative, severity };
  }

  private static generateThreatNarrative(chain: any[]): string {
    if (chain.length === 0) return 'No events in chain';

    const steps = chain.map((step, i) => `${i + 1}. ${step.summary}`).join('; ');

    return `Detected ${chain.length}-step attack sequence: ${steps}. This pattern suggests a coordinated threat activity requiring investigation.`;
  }

  private static calculateChainSeverity(chain: any[]): string {
    if (chain.length >= 5) return 'critical';
    if (chain.length >= 3) return 'high';
    if (chain.length >= 2) return 'medium';
    return 'low';
  }

  static async clusterEvents(
    supabase: any,
    threshold: number = 0.9
  ): Promise<number> {
    try {
      await supabase.rpc('cluster_similar_events', {
        cluster_threshold: threshold,
        min_cluster_size: 3,
      });

      const { count } = await supabase
        .from('raw_security_events')
        .select('similarity_cluster', { count: 'exact', head: true })
        .not('similarity_cluster', 'is', null);

      return count || 0;
    } catch (error) {
      console.error('Error clustering events:', error);
      return 0;
    }
  }
}
