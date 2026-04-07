import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AgentTask {
  id: string;
  agent_type: string;
  task_type: string;
  priority: string;
  status: string;
  parameters: any;
  created_at: string;
}

interface AgentConfig {
  name: string;
  enabled: boolean;
  auto_run: boolean;
  interval_seconds: number;
  max_concurrent_tasks: number;
}

// Main Agent Orchestrator
// Coordinates all agents and ensures they're processing tasks automatically

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { mode = 'auto' } = await req.json().catch(() => ({}));

    // Get agent configurations
    const { data: agents } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('enabled', true)
      .eq('auto_run', true);

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No agents configured for automatic execution',
          agents_configured: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      agents_executed: 0,
      tasks_created: 0,
      tasks_completed: 0,
      errors: [] as string[],
      agent_results: {} as Record<string, any>,
    };

    // Execute each agent
    for (const agent of agents) {
      try {
        let agentResult;

        switch (agent.agent_type) {
          case 'triage':
            agentResult = await runTriageAgent(supabase);
            break;
          case 'enrichment':
            agentResult = await runEnrichmentAgent(supabase);
            break;
          case 'investigation':
            agentResult = await runInvestigationAgent(supabase);
            break;
          case 'response':
            agentResult = await runResponseAgent(supabase);
            break;
          case 'pattern_discovery':
            agentResult = await runPatternDiscoveryAgent(supabase);
            break;
          default:
            console.log(`Unknown agent type: ${agent.agent_type}`);
            continue;
        }

        results.agents_executed++;
        results.agent_results[agent.agent_type] = agentResult;
        results.tasks_created += agentResult.tasks_created || 0;
        results.tasks_completed += agentResult.tasks_completed || 0;

        // Update agent metrics
        await supabase
          .from('agent_configs')
          .update({
            last_run_at: new Date().toISOString(),
            total_runs: agent.total_runs + 1,
            last_run_result: agentResult,
          })
          .eq('id', agent.id);

      } catch (error) {
        console.error(`Error executing agent ${agent.agent_type}:`, error);
        results.errors.push(`${agent.agent_type}: ${error.message}`);
      }
    }

    // Log orchestration run
    await supabase.from('agent_orchestration_logs').insert({
      mode,
      agents_executed: results.agents_executed,
      tasks_created: results.tasks_created,
      tasks_completed: results.tasks_completed,
      errors: results.errors,
      results: results.agent_results,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// TRIAGE AGENT - Automatically processes and prioritizes alerts
// ============================================================================
async function runTriageAgent(supabase: any) {
  console.log('Running Triage Agent...');

  // Get unprocessed alerts (status = 'new')
  const { data: newAlerts, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !newAlerts || newAlerts.length === 0) {
    return { tasks_created: 0, tasks_completed: 0, alerts_processed: 0 };
  }

  let processed = 0;
  let escalated = 0;
  let suppressed = 0;

  for (const alert of newAlerts) {
    try {
      // Calculate priority score based on multiple factors
      let priorityScore = 0;
      let autoAssignTo = null;
      let recommendedAction = 'investigate';

      // Factor 1: Severity
      const severityScores = { low: 1, medium: 3, high: 7, critical: 10 };
      priorityScore += severityScores[alert.severity] || 0;

      // Factor 2: Risk score
      if (alert.risk_score) {
        priorityScore += Math.floor(alert.risk_score / 10);
      }

      // Factor 3: Event count
      if (alert.event_count > 100) {
        priorityScore += 5;
      } else if (alert.event_count > 50) {
        priorityScore += 3;
      } else if (alert.event_count > 10) {
        priorityScore += 1;
      }

      // Factor 4: Check if source IP is in known threat lists
      if (alert.source_ip) {
        const { data: threatMatch } = await supabase
          .from('threat_feed_items')
          .select('threat_type, severity')
          .eq('ioc_value', alert.source_ip)
          .eq('ioc_type', 'ip')
          .single();

        if (threatMatch) {
          priorityScore += 5;
          recommendedAction = 'block_and_investigate';
        }
      }

      // Factor 5: Check for repeat offenders
      const { count: repeatCount } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('source_ip', alert.source_ip)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (repeatCount && repeatCount > 5) {
        priorityScore += 3;
      }

      // Determine final priority and assignment
      let finalPriority = 'medium';
      if (priorityScore >= 15) {
        finalPriority = 'critical';
        escalated++;
        // Auto-create case for critical alerts
        await supabase.from('cases').insert({
          title: alert.title,
          description: `Auto-escalated from alert: ${alert.description}`,
          severity: 'critical',
          status: 'new',
          case_type: 'incident',
          alert_id: alert.id,
          priority: 'critical',
        });
      } else if (priorityScore >= 10) {
        finalPriority = 'high';
      } else if (priorityScore >= 5) {
        finalPriority = 'medium';
      } else {
        finalPriority = 'low';
      }

      // Check for false positive patterns
      let isFalsePositive = false;
      if (alert.false_positive_score && alert.false_positive_score > 0.8) {
        isFalsePositive = true;
        suppressed++;
        finalPriority = 'low';
        recommendedAction = 'suppress';
      }

      // Update alert with triage results
      await supabase
        .from('alerts')
        .update({
          status: isFalsePositive ? 'false_positive' : 'triaged',
          priority: finalPriority,
          triage_score: priorityScore,
          triage_notes: `Auto-triaged by Triage Agent. Score: ${priorityScore}. Recommended: ${recommendedAction}`,
          triaged_at: new Date().toISOString(),
          triaged_by: 'system',
        })
        .eq('id', alert.id);

      // Create agent task for next steps
      if (!isFalsePositive) {
        await supabase.from('agent_tasks').insert({
          agent_type: recommendedAction === 'block_and_investigate' ? 'response' : 'enrichment',
          task_type: recommendedAction === 'block_and_investigate' ? 'block_ip' : 'enrich_alert',
          priority: finalPriority,
          status: 'pending',
          parameters: {
            alert_id: alert.id,
            source_ip: alert.source_ip,
            action: recommendedAction,
            triage_score: priorityScore,
          },
        });
      }

      processed++;
    } catch (error) {
      console.error(`Error triaging alert ${alert.id}:`, error);
    }
  }

  return {
    tasks_created: processed,
    tasks_completed: processed,
    alerts_processed: processed,
    escalated,
    suppressed,
  };
}

// ============================================================================
// ENRICHMENT AGENT - Enriches alerts with threat intelligence
// ============================================================================
async function runEnrichmentAgent(supabase: any) {
  console.log('Running Enrichment Agent...');

  // Get pending enrichment tasks
  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('agent_type', 'enrichment')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .limit(50);

  if (!tasks || tasks.length === 0) {
    // Also check for triaged alerts that need enrichment
    const { data: alerts } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'triaged')
      .is('enrichment_completed', null)
      .limit(50);

    if (!alerts || alerts.length === 0) {
      return { tasks_completed: 0, alerts_enriched: 0 };
    }

    // Create tasks for these alerts
    for (const alert of alerts) {
      await supabase.from('agent_tasks').insert({
        agent_type: 'enrichment',
        task_type: 'enrich_alert',
        priority: alert.priority || 'medium',
        status: 'pending',
        parameters: { alert_id: alert.id },
      });
    }

    return { tasks_created: alerts.length };
  }

  let completed = 0;

  for (const task of tasks) {
    try {
      const { alert_id } = task.parameters;

      // Mark task as running
      await supabase
        .from('agent_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task.id);

      // Get alert details
      const { data: alert } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', alert_id)
        .single();

      if (!alert) continue;

      const enrichmentData: any = {
        threat_intel: {},
        ioc_matches: [],
        reputation_scores: {},
      };

      // Enrich source IP
      if (alert.source_ip) {
        // Check threat feeds
        const { data: threatMatches } = await supabase
          .from('threat_feed_items')
          .select('*')
          .eq('ioc_value', alert.source_ip)
          .eq('ioc_type', 'ip');

        if (threatMatches && threatMatches.length > 0) {
          enrichmentData.ioc_matches.push({
            type: 'ip',
            value: alert.source_ip,
            matches: threatMatches.map((m: any) => ({
              feed: m.feed_name,
              threat_type: m.threat_type,
              severity: m.severity,
              first_seen: m.first_seen,
            })),
          });
        }

        // Check IOC embeddings for semantic similarity
        const { data: iocData } = await supabase
          .from('ioc_embeddings')
          .select('ioc_value, ioc_type, threat_type, severity, description')
          .eq('ioc_value', alert.source_ip)
          .single();

        if (iocData) {
          enrichmentData.threat_intel.source_ip = {
            known_threat: true,
            threat_type: iocData.threat_type,
            severity: iocData.severity,
            description: iocData.description,
          };
        }
      }

      // Enrich destination IP
      if (alert.dest_ip) {
        const { data: destThreat } = await supabase
          .from('ioc_embeddings')
          .select('*')
          .eq('ioc_value', alert.dest_ip)
          .single();

        if (destThreat) {
          enrichmentData.threat_intel.dest_ip = {
            known_threat: true,
            threat_type: destThreat.threat_type,
            severity: destThreat.severity,
          };
        }
      }

      // Enrich username (check for compromised credentials)
      if (alert.username) {
        const { data: userAnomaly } = await supabase
          .from('user_anomalies')
          .select('*')
          .eq('username', alert.username)
          .eq('is_active', true)
          .order('detected_at', { ascending: false })
          .limit(1)
          .single();

        if (userAnomaly) {
          enrichmentData.threat_intel.username = {
            has_anomalies: true,
            anomaly_type: userAnomaly.anomaly_type,
            risk_score: userAnomaly.risk_score,
          };
        }
      }

      // Calculate enriched risk score
      let enrichedRiskScore = alert.risk_score || 0;
      if (enrichmentData.ioc_matches.length > 0) {
        enrichedRiskScore += 30;
      }
      if (enrichmentData.threat_intel.source_ip?.known_threat) {
        enrichedRiskScore += 20;
      }
      if (enrichmentData.threat_intel.username?.has_anomalies) {
        enrichedRiskScore += 15;
      }

      // Update alert with enrichment data
      await supabase
        .from('alerts')
        .update({
          enrichment_data: enrichmentData,
          enriched_risk_score: Math.min(enrichedRiskScore, 100),
          enrichment_completed: true,
          enriched_at: new Date().toISOString(),
        })
        .eq('id', alert_id);

      // Mark task as completed
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: { enrichment_data: enrichmentData },
        })
        .eq('id', task.id);

      completed++;
    } catch (error) {
      console.error(`Error enriching task ${task.id}:`, error);
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error: error.message,
        })
        .eq('id', task.id);
    }
  }

  return { tasks_completed: completed, alerts_enriched: completed };
}

// ============================================================================
// INVESTIGATION AGENT - Correlates events and finds attack patterns
// ============================================================================
async function runInvestigationAgent(supabase: any) {
  console.log('Running Investigation Agent...');

  // Get enriched alerts that need investigation
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('enrichment_completed', true)
    .is('investigation_completed', null)
    .order('enriched_risk_score', { ascending: false })
    .limit(20);

  if (!alerts || alerts.length === 0) {
    return { tasks_completed: 0, investigations_completed: 0 };
  }

  let completed = 0;

  for (const alert of alerts) {
    try {
      const investigation: any = {
        related_events: [],
        attack_patterns: [],
        timeline: [],
        indicators: [],
      };

      // Get correlated events
      if (alert.correlated_event_ids && alert.correlated_event_ids.length > 0) {
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .in('id', alert.correlated_event_ids)
          .order('timestamp', { ascending: true });

        investigation.related_events = events || [];

        // Build timeline
        investigation.timeline = (events || []).map((e: any) => ({
          timestamp: e.timestamp,
          event_type: e.event_type,
          description: e.description,
          severity: e.severity,
        }));
      }

      // Check for known attack patterns
      const { data: patterns } = await supabase
        .from('detected_attack_sequences')
        .select('*')
        .eq('is_ongoing', true)
        .or(`source_ip.eq.${alert.source_ip},dest_ip.eq.${alert.dest_ip}`)
        .limit(5);

      if (patterns && patterns.length > 0) {
        investigation.attack_patterns = patterns.map((p: any) => ({
          pattern_name: p.pattern_name,
          severity: p.severity,
          confidence: p.confidence,
          mitre_tactics: p.mitre_tactics,
        }));
      }

      // Extract indicators
      if (alert.source_ip) investigation.indicators.push({ type: 'ip', value: alert.source_ip });
      if (alert.dest_ip) investigation.indicators.push({ type: 'ip', value: alert.dest_ip });
      if (alert.username) investigation.indicators.push({ type: 'username', value: alert.username });

      // Determine if case should be created
      let shouldCreateCase = false;
      if (alert.enriched_risk_score >= 70) shouldCreateCase = true;
      if (investigation.attack_patterns.length > 0) shouldCreateCase = true;
      if (alert.severity === 'critical') shouldCreateCase = true;

      if (shouldCreateCase) {
        await supabase.from('cases').insert({
          title: `Investigation: ${alert.title}`,
          description: `Automated investigation of alert ${alert.id}`,
          severity: alert.severity,
          priority: alert.priority,
          status: 'investigating',
          case_type: 'incident',
          alert_id: alert.id,
          investigation_data: investigation,
        });
      }

      // Update alert
      await supabase
        .from('alerts')
        .update({
          investigation_data: investigation,
          investigation_completed: true,
          investigated_at: new Date().toISOString(),
          case_created: shouldCreateCase,
        })
        .eq('id', alert.id);

      completed++;
    } catch (error) {
      console.error(`Error investigating alert ${alert.id}:`, error);
    }
  }

  return { tasks_completed: completed, investigations_completed: completed };
}

// ============================================================================
// RESPONSE AGENT - Executes automated response actions
// ============================================================================
async function runResponseAgent(supabase: any) {
  console.log('Running Response Agent...');

  // Get pending response tasks
  const { data: tasks } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('agent_type', 'response')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .limit(20);

  if (!tasks || tasks.length === 0) {
    return { tasks_completed: 0, responses_executed: 0 };
  }

  let completed = 0;

  for (const task of tasks) {
    try {
      const { alert_id, source_ip, action } = task.parameters;

      // Mark as running
      await supabase
        .from('agent_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task.id);

      const actionsExecuted = [];

      // Execute block_ip action
      if (action === 'block_ip' || action === 'block_and_investigate') {
        if (source_ip) {
          // Add to blocklist
          await supabase.from('active_lists').insert({
            list_name: 'auto_blocked_ips',
            value: source_ip,
            list_type: 'blocklist',
            category: 'ip',
            reason: `Auto-blocked by Response Agent for alert ${alert_id}`,
            severity: 'high',
            auto_added: true,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          });

          actionsExecuted.push({
            action: 'block_ip',
            target: source_ip,
            success: true,
          });

          // Log response action
          await supabase.from('response_actions').insert({
            alert_id,
            action_type: 'block_ip',
            target: source_ip,
            status: 'executed',
            executed_by: 'system',
            executed_at: new Date().toISOString(),
            details: { automated: true, duration_hours: 24 },
          });
        }
      }

      // Execute isolate_host action
      if (action === 'isolate_host' && task.parameters.hostname) {
        await supabase.from('response_actions').insert({
          alert_id,
          action_type: 'isolate_host',
          target: task.parameters.hostname,
          status: 'executed',
          executed_by: 'system',
          executed_at: new Date().toISOString(),
        });

        actionsExecuted.push({
          action: 'isolate_host',
          target: task.parameters.hostname,
          success: true,
        });
      }

      // Execute disable_user action
      if (action === 'disable_user' && task.parameters.username) {
        await supabase.from('response_actions').insert({
          alert_id,
          action_type: 'disable_user',
          target: task.parameters.username,
          status: 'executed',
          executed_by: 'system',
          executed_at: new Date().toISOString(),
        });

        actionsExecuted.push({
          action: 'disable_user',
          target: task.parameters.username,
          success: true,
        });
      }

      // Mark task as completed
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: { actions_executed: actionsExecuted },
        })
        .eq('id', task.id);

      completed++;
    } catch (error) {
      console.error(`Error executing response task ${task.id}:`, error);
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error: error.message,
        })
        .eq('id', task.id);
    }
  }

  return { tasks_completed: completed, responses_executed: completed };
}

// ============================================================================
// PATTERN DISCOVERY AGENT - Discovers new attack patterns
// ============================================================================
async function runPatternDiscoveryAgent(supabase: any) {
  console.log('Running Pattern Discovery Agent...');

  // Get discovered patterns with high confidence
  const { data: patterns } = await supabase
    .from('discovered_patterns')
    .select('*')
    .gte('confidence_score', 60)
    .eq('converted_to_rule', false)
    .order('confidence_score', { ascending: false })
    .limit(10);

  if (!patterns || patterns.length === 0) {
    return { tasks_completed: 0, rules_created: 0 };
  }

  let rulesCreated = 0;

  for (const pattern of patterns) {
    try {
      // Convert pattern to correlation rule
      const ruleName = `AI-Generated: ${pattern.pattern_name}`;
      const ruleDescription = `Auto-generated from discovered pattern with ${pattern.confidence_score}% confidence`;

      // Build rule conditions from pattern
      const conditions: any = {};

      if (pattern.event_types && pattern.event_types.length > 0) {
        conditions.event_types = pattern.event_types;
      }

      if (pattern.common_features) {
        Object.assign(conditions, pattern.common_features);
      }

      // Create correlation rule
      await supabase.from('correlation_rules').insert({
        name: ruleName,
        description: ruleDescription,
        rule_type: 'ai_generated',
        conditions,
        time_window_minutes: 15,
        threshold: pattern.occurrence_count > 10 ? 5 : 3,
        severity: pattern.severity || 'medium',
        enabled: true,
        auto_response_enabled: false, // Require manual review before auto-response
        confidence_score: pattern.confidence_score,
        source_pattern_id: pattern.id,
      });

      // Mark pattern as converted
      await supabase
        .from('discovered_patterns')
        .update({ converted_to_rule: true, converted_at: new Date().toISOString() })
        .eq('id', pattern.id);

      rulesCreated++;
    } catch (error) {
      console.error(`Error converting pattern ${pattern.id} to rule:`, error);
    }
  }

  return { tasks_completed: rulesCreated, rules_created: rulesCreated };
}
