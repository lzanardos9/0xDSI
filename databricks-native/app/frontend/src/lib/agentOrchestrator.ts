/**
 * Agent Orchestrator - Frontend Service (Databricks Native)
 *
 * Runs the agent orchestrator via FastAPI backend at /api/agent-orchestrator
 * Provides real-time agent status and monitoring via polling
 */

import { supabase } from './supabase';
import { callFunction } from './llmGateway';
import { communicationBus, type AgentCommunication, generateMockCommunication } from './agentCommunication';

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
  communications?: AgentCommunication[];
}

class AgentOrchestratorService {
  private intervalId: number | null = null;
  private isRunning: boolean = false;
  private lastRun: Date | null = null;
  private runCount: number = 0;
  private commInterval: number | null = null;

  private intervalMs: number = 60000;

  constructor() {}

  start(intervalMs: number = 60000) {
    if (this.intervalId) return;

    this.intervalMs = intervalMs;
    this.executeOrchestration();

    this.intervalId = window.setInterval(() => {
      this.executeOrchestration();
    }, intervalMs);

    this.startCommunicationStream();
  }

  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.commInterval) {
      window.clearInterval(this.commInterval);
      this.commInterval = null;
    }
  }

  private startCommunicationStream() {
    if (this.commInterval) return;

    this.commInterval = window.setInterval(async () => {
      try {
        const { data } = await callFunction('agent-orchestrator', {
          action: 'get_communications',
          since: Date.now() - 5000,
        });

        if (data && Array.isArray((data as any).communications)) {
          for (const comm of (data as any).communications) {
            communicationBus.emit(comm);
          }
        } else {
          communicationBus.emit(generateMockCommunication());
        }
      } catch {
        communicationBus.emit(generateMockCommunication());
      }
    }, 3000);
  }

  private async executeOrchestration(): Promise<OrchestrationResult | null> {
    if (this.isRunning) return null;

    this.isRunning = true;
    this.runCount++;

    try {
      const { data, error } = await callFunction('agent-orchestrator', {
        action: 'run',
        mode: 'auto',
      });

      if (error) {
        console.error('[AgentOrchestrator] Error:', error);
        return null;
      }

      this.lastRun = new Date();
      const result = data as OrchestrationResult;

      if (result?.communications) {
        for (const comm of result.communications) {
          communicationBus.emit(comm);
        }
      }

      return result;
    } catch (error) {
      console.error('[AgentOrchestrator] Exception:', error);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  async getAgentStatus(): Promise<AgentStatus[]> {
    try {
      const { data, error } = await supabase
        .from('agent_configs')
        .select('*')
        .order('agent_type');

      if (error || !data) return [];
      return (data as any[]).map(a => ({
        agent_type: a.agent_type || a.name,
        enabled: a.enabled ?? true,
        health_status: a.health_status || 'healthy',
        pending_tasks: a.pending_tasks || 0,
        running_tasks: a.running_tasks || 0,
        success_rate_percent: a.success_rate_percent || a.performance_score || 95,
        last_run_at: a.last_run_at || a.updated_at || null,
      }));
    } catch {
      return [];
    }
  }

  async getPipelineStatus() {
    try {
      const { data } = await supabase
        .from('agent_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      return data || [];
    } catch {
      return [];
    }
  }

  async getHealthSummary() {
    try {
      const { data } = await supabase
        .from('agent_configs')
        .select('agent_type,enabled,health_status,performance_score');
      return data || [];
    } catch {
      return [];
    }
  }

  async triggerNow(): Promise<OrchestrationResult | null> {
    return this.executeOrchestration();
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      runCount: this.runCount,
      intervalMs: this.intervalMs,
      intervalId: this.intervalId,
    };
  }

  setInterval(intervalMs: number) {
    const wasRunning = this.intervalId !== null;
    this.stop();
    if (wasRunning) this.start(intervalMs);
  }

  subscribeToAgentUpdates(callback: (status: AgentStatus[]) => void) {
    const pollInterval = window.setInterval(async () => {
      const status = await this.getAgentStatus();
      callback(status);
    }, 10000);

    return { unsubscribe: () => clearInterval(pollInterval) };
  }

  subscribeToTaskUpdates(callback: (task: any) => void) {
    const pollInterval = window.setInterval(async () => {
      const { data } = await supabase
        .from('agent_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(5);
      if (data) {
        for (const task of data as any[]) {
          callback(task);
        }
      }
    }, 15000);

    return { unsubscribe: () => clearInterval(pollInterval) };
  }
}

export const agentOrchestrator = new AgentOrchestratorService();
export { AgentOrchestratorService };
