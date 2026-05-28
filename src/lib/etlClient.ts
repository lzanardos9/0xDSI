import { supabase } from './supabase';
import { callFunction } from './llmGateway';

export class ETLClient {
  private static instance: ETLClient;
  private processingInterval: number | null = null;

  private constructor() {}

  static getInstance(): ETLClient {
    if (!ETLClient.instance) {
      ETLClient.instance = new ETLClient();
    }
    return ETLClient.instance;
  }

  async ingestEvent(sourceId: string, sourceType: string, rawData: any, sourceIp?: string) {
    try {
      const { data, error } = await callFunction('etl-ingest', {
        source_id: sourceId,
        source_type: sourceType,
        raw_data: rawData,
        source_ip: sourceIp
      });

      if (error) {
        throw new Error(`Ingestion failed: ${error}`);
      }

      return data;
    } catch (error) {
      console.error('ETL ingestion error:', error);
      throw error;
    }
  }

  async processEvents() {
    try {
      const { data, error } = await callFunction('etl-orchestrator', {});

      if (error) {
        throw new Error(`Processing failed: ${error}`);
      }

      return data;
    } catch (error) {
      console.error('ETL processing error:', error);
      throw error;
    }
  }

  async getQueueDepths() {
    try {
      const { data, error } = await supabase
        .rpc('get_queue_depths');

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching queue depths:', error);
      return null;
    }
  }

  async getProcessingStats(limit: number = 20) {
    try {
      const { data, error } = await supabase
        .from('processing_stats')
        .select('*')
        .order('stat_timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching processing stats:', error);
      return [];
    }
  }

  startAutomaticProcessing(intervalMs: number = 5000) {
    if (this.processingInterval) {
      console.warn('Automatic processing already running');
      return;
    }

    console.log(`Starting automatic ETL processing every ${intervalMs}ms`);

    this.processingInterval = window.setInterval(async () => {
      try {
        await this.processEvents();
      } catch (error) {
        console.error('Automatic processing error:', error);
      }
    }, intervalMs);
  }

  stopAutomaticProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Automatic ETL processing stopped');
    }
  }

  subscribeToRawBuffer(callback: (event: any) => void) {
    return supabase
      .channel('raw_buffer_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'raw_event_buffer'
      }, (payload) => {
        callback(payload.new);
      })
      .subscribe();
  }

  subscribeToEvents(callback: (event: any) => void) {
    return supabase
      .channel('events_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events'
      }, (payload) => {
        callback(payload.new);
      })
      .subscribe();
  }

  subscribeToAlerts(callback: (alert: any) => void) {
    return supabase
      .channel('alerts_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alerts'
      }, (payload) => {
        callback(payload.new);
      })
      .subscribe();
  }

  async ingestSampleEvents() {
    const sampleEvents = [
      {
        source_id: 'firewall-01',
        source_type: 'firewall',
        raw_data: {
          timestamp: new Date().toISOString(),
          event_type: 'connection_blocked',
          severity: 'high',
          source_ip: '192.168.1.100',
          dest_ip: '10.0.0.5',
          dest_port: 22,
          message: 'SSH connection blocked from suspicious IP'
        }
      },
      {
        source_id: 'web-server-01',
        source_type: 'web_server',
        raw_data: {
          timestamp: new Date().toISOString(),
          event_type: 'http_403',
          severity: 'medium',
          source_ip: '203.0.113.42',
          dest_ip: '10.0.0.10',
          username: 'john.doe',
          message: 'Access denied to /admin'
        }
      },
      {
        source_id: 'ids-01',
        source_type: 'ids',
        raw_data: {
          timestamp: new Date().toISOString(),
          event_type: 'malware_detected',
          severity: 'critical',
          source_ip: '172.16.0.50',
          message: 'Malware signature detected: Trojan.Generic'
        }
      },
      {
        source_id: 'auth-server',
        source_type: 'authentication',
        raw_data: {
          timestamp: new Date().toISOString(),
          event_type: 'authentication_failure',
          severity: 'medium',
          source_ip: '198.51.100.25',
          username: 'admin',
          message: 'Failed login attempt'
        }
      },
      {
        source_id: 'database-01',
        source_type: 'database',
        raw_data: {
          timestamp: new Date().toISOString(),
          event_type: 'database_query',
          severity: 'info',
          source_ip: '10.0.1.20',
          username: 'app_user',
          message: 'SELECT query executed on users table'
        }
      }
    ];

    const results = [];
    for (const event of sampleEvents) {
      try {
        const result = await this.ingestEvent(
          event.source_id,
          event.source_type,
          event.raw_data
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to ingest sample event from ${event.source_id}:`, error);
      }
    }

    return results;
  }
}

export const etlClient = ETLClient.getInstance();
