import { supabase } from './supabase';

export type NotebookRunType = 'export' | 'manual' | 'scheduled' | 'api';
export type NotebookRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface NotebookRun {
  id: string;
  notebook_id: string;
  notebook_title: string;
  run_type: NotebookRunType;
  status: NotebookRunStatus;
  cluster_id: string;
  databricks_run_id: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number;
  rows_processed: number;
  error_message: string;
  triggered_by: string | null;
  output_summary: Record<string, unknown>;
  created_at: string;
}

export async function recordNotebookExport(
  notebookId: string,
  notebookTitle: string,
  format: 'py' | 'json' | 'ipynb',
): Promise<NotebookRun | null> {
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('databricks_notebook_runs')
    .insert({
      notebook_id: notebookId,
      notebook_title: notebookTitle,
      run_type: 'export',
      status: 'succeeded',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_seconds: 0,
      triggered_by: userData.user?.id ?? null,
      output_summary: { format },
    })
    .select()
    .maybeSingle();

  if (error) {
    // Non-fatal: exports should not be blocked by tracking failures
    console.warn('Failed to record notebook export:', error.message);
    return null;
  }
  return data;
}

export async function listRecentRuns(limit = 50): Promise<NotebookRun[]> {
  const { data, error } = await supabase
    .from('databricks_notebook_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listRunsForNotebook(notebookId: string, limit = 20): Promise<NotebookRun[]> {
  const { data, error } = await supabase
    .from('databricks_notebook_runs')
    .select('*')
    .eq('notebook_id', notebookId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
