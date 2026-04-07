import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CorrelationRule {
  id: string;
  name: string;
  conditions: any;
  time_window_minutes: number;
  threshold: number;
  severity: string;
  actions: any;
}

interface Event {
  id: string;
  event_type: string;
  severity: string;
  source_ip?: string;
  dest_ip?: string;
  username?: string;
  created_at: string;
  raw_data: any;
}

async function evaluateRule(rule: CorrelationRule, events: Event[], supabase: any): Promise<boolean> {
  const conditions = rule.conditions;
  const timeWindowStart = new Date(Date.now() - rule.time_window_minutes * 60 * 1000).toISOString();

  let query = supabase
    .from('events')
    .select('*')
    .gte('created_at', timeWindowStart)
    .order('created_at', { ascending: false });

  if (conditions.event_types && conditions.event_types.length > 0) {
    query = query.in('event_type', conditions.event_types);
  }

  if (conditions.severity) {
    query = query.eq('severity', conditions.severity);
  }

  if (conditions.source_ip) {
    query = query.eq('source_ip', conditions.source_ip);
  }

  if (conditions.username) {
    query = query.eq('username', conditions.username);
  }

  const { data: matchedEvents, error } = await query;

  if (error || !matchedEvents) {
    return false;
  }

  if (conditions.group_by) {
    const grouped = new Map<string, Event[]>();
    
    for (const event of matchedEvents) {
      const key = conditions.group_by.map((field: string) => event[field]).join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(event);
    }

    for (const [, groupEvents] of grouped) {
      if (groupEvents.length >= rule.threshold) {
        await createAlert(rule, groupEvents, supabase);
        return true;
      }
    }
  } else {
    if (matchedEvents.length >= rule.threshold) {
      await createAlert(rule, matchedEvents, supabase);
      return true;
    }
  }

  return false;
}

async function createAlert(rule: CorrelationRule, events: Event[], supabase: any) {
  const eventIds = events.map(e => e.id);
  const primaryEvent = events[0];

  const alertData = {
    title: `${rule.name} - ${events.length} events correlated`,
    description: `Correlation rule "${rule.name}" triggered with ${events.length} matching events`,
    severity: rule.severity,
    status: 'new',
    source: 'correlation_engine',
    source_ip: primaryEvent.source_ip,
    dest_ip: primaryEvent.dest_ip,
    username: primaryEvent.username,
    event_count: events.length,
    correlated_event_ids: eventIds,
    correlation_rule_id: rule.id,
    metadata: {
      rule_name: rule.name,
      time_window_minutes: rule.time_window_minutes,
      threshold: rule.threshold,
      matched_events: events.length
    }
  };

  const { data: alert, error: alertError } = await supabase
    .from('alerts')
    .insert(alertData)
    .select()
    .single();

  if (alertError) {
    console.error('Failed to create alert:', alertError);
    return;
  }

  if (rule.actions) {
    await executeActions(rule.actions, alert, events, supabase);
  }
}

async function executeActions(actions: any, alert: any, events: Event[], supabase: any) {
  if (actions.create_case) {
    await supabase.from('cases').insert({
      title: alert.title,
      description: alert.description,
      priority: alert.severity,
      status: 'open',
      alert_id: alert.id,
      assigned_to: actions.assign_to
    });
  }

  if (actions.block_ip && alert.source_ip) {
    await supabase.from('active_lists').insert({
      list_name: 'blocked_ips',
      value: alert.source_ip,
      list_type: 'blocklist',
      category: 'ip',
      reason: `Auto-blocked by correlation rule: ${alert.title}`,
      severity: 'high',
      auto_added: true
    });
  }

  if (actions.trigger_workflow && actions.workflow_id) {
    await supabase.from('agent_tasks').insert({
      task_type: 'execute_workflow',
      priority: 'high',
      status: 'pending',
      parameters: {
        workflow_id: actions.workflow_id,
        alert_id: alert.id,
        context: { events: events.map(e => e.id) }
      }
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: activeRules } = await supabase
      .from('correlation_rules')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (!activeRules || activeRules.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No active correlation rules' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: recentEvents } = await supabase
      .from('events')
      .select('*')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    let rulesTriggered = 0;
    const triggeredRules: string[] = [];

    for (const rule of activeRules) {
      try {
        const triggered = await evaluateRule(rule, recentEvents || [], supabase);
        if (triggered) {
          rulesTriggered++;
          triggeredRules.push(rule.name);
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
      }
    }

    await supabase.from('processing_stats').insert({
      pipeline_stage: 'correlation',
      events_processed: recentEvents?.length || 0,
      metadata: {
        rules_evaluated: activeRules.length,
        rules_triggered: rulesTriggered,
        triggered_rules: triggeredRules
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        rules_evaluated: activeRules.length,
        rules_triggered: rulesTriggered,
        triggered_rules: triggeredRules,
        events_analyzed: recentEvents?.length || 0
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