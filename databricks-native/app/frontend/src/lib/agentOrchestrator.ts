/**
 * Agent Orchestrator - Frontend Service
 *
 * Automatically runs the agent orchestrator at regular intervals
 * Provides real-time agent status and monitoring
 */

import { supabase } from './supabase';

interface AgentStatus {
  agent_type: string;
  enabled: boolean;
  health_status: string;
  pending_tasks: number;
  running_tasks: number;
  success_rate_percent: number;
  last_run_at: string | null;
}

interface OrchestrationResult {
  success: boolean;
  agents_executed: number;
  tasks_created: number;
  tasks_completed: number;
  agent_results: Record<string, any>;
  errors: string[];
}

class AgentOrchestratorService {
  private intervalId: number | null = null;
  private isRunning: boolean = false;
  private lastRun: Date | null = null;
  private runCount: number = 0;

  // Configuration
  private intervalMs: number = 60000; // 1 minute default
  private autoStart: boolean = false; // Disabled by default

  constructor() {
    // Do not auto-start
  }

  /**
   * Start the agent orchestrator
   */
  start(intervalMs: number = 60000) {
    if (this.intervalId) {
      console.log('[AgentOrchestrator] Already running');
      return;
    }

    this.intervalMs = intervalMs;
    console.log(`[AgentOrchestrator] Starting with ${intervalMs}ms interval`);

    // Run immediately on start
    this.executeOrchestration();

    // Then run at regular intervals
    this.intervalId = window.setInterval(() => {
      this.executeOrchestration();
    }, intervalMs);
  }

  /**
   * Stop the agent orchestrator
   */
  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[AgentOrchestrator] Stopped');
    }
  }

  /**
   * Execute the agent orchestration
   */
  private async executeOrchestration(): Promise<OrchestrationResult | null> {
    if (this.isRunning) {
      console.log('[AgentOrchestrator] Already running, skipping this cycle');
      return null;
    }

    this.isRunning = true;
    this.runCount++;

    try {
      console.log(`[AgentOrchestrator] Run #${this.runCount} started at ${new Date().toISOString()}`);

      const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
        body: { mode: 'auto' },
      });

      if (error) {
        console.error('[AgentOrchestrator] Error:', error);
        return null;
      }

      this.lastRun = new Date();

      console.log('[AgentOrchestrator] Results:', {
        agents_executed: data.agents_executed,
        tasks_created: data.tasks_created,
        tasks_completed: data.tasks_completed,
        errors: data.errors,
      });

      return data;
    } catch (error) {
      console.error('[AgentOrchestrator] Exception:', error);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get current agent status
   */
  async getAgentStatus(): Promise<AgentStatus[]> {
    try {
      const { data, error } = await supabase
        .from('agent_dashboard_summary')
        .select('*')
        .order('agent_type');

      if (error) {
        console.error('[AgentOrchestrator] Error fetching agent status:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[AgentOrchestrator] Exception fetching status:', error);
      return [];
    }
  }

  /**
   * Get agent pipeline status (counts at each stage)
   */
  async getPipelineStatus() {
    try {
      const { data, error } = await supabase.rpc('get_agent_pipeline_status');

      if (error) {
        console.error('[AgentOrchestrator] Error fetching pipeline status:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[AgentOrchestrator] Exception fetching pipeline status:', error);
      return [];
    }
  }

  /**
   * Get agent health summary
   */
  async getHealthSummary() {
    try {
      const { data, error } = await supabase.rpc('get_agent_health_summary');

      if (error) {
        console.error('[AgentOrchestrator] Error fetching health summary:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[AgentOrchestrator] Exception fetching health summary:', error);
      return [];
    }
  }

  /**
   * Manually trigger agent execution
   */
  async triggerNow(): Promise<OrchestrationResult | null> {
    console.log('[AgentOrchestrator] Manual trigger requested');
    return this.executeOrchestration();
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      runCount: this.runCount,
      intervalMs: this.intervalMs,
      intervalId: this.intervalId,
    };
  }

  /**
   * Change interval (stop and restart with new interval)
   */
  setInterval(intervalMs: number) {
    const wasRunning = this.intervalId !== null;
    this.stop();
    if (wasRunning) {
      this.start(intervalMs);
    }
  }

  /**
   * Subscribe to real-time agent updates
   */
  subscribeToAgentUpdates(callback: (status: AgentStatus[]) => void) {
    // Subscribe to agent_configs changes
    const subscription = supabase
      .channel('agent_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_configs',
        },
        async () => {
          const status = await this.getAgentStatus();
          callback(status);
        }
      )
      .subscribe();

    return subscription;
  }

  /**
   * Subscribe to task updates
   */
  subscribeToTaskUpdates(callback: (task: any) => void) {
    const subscription = supabase
      .channel('task_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_tasks',
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    return subscription;
  }
}

// Export singleton instance
export const agentOrchestrator = new AgentOrchestratorService();

// Export class for multiple instances if needed
export { AgentOrchestratorService };

// Auto-start on import (for immediate background processing)
console.log('[AgentOrchestrator] Service initialized and started');
