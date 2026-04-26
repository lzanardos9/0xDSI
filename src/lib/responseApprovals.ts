import { supabase } from './supabase';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';

export interface ResponseActionApproval {
  id: string;
  action_id: string;
  action_type: string;
  target_entity: string;
  scope_summary: Record<string, unknown>;
  requested_by: string | null;
  requested_at: string;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string;
  executed_at: string | null;
  execution_result: Record<string, unknown>;
  ttl_minutes: number;
  created_at: string;
}

export interface RequestApprovalInput {
  actionId: string;
  actionType: string;
  targetEntity: string;
  scopeSummary: Record<string, unknown>;
  ttlMinutes?: number;
}

export async function requestApproval(input: RequestApprovalInput): Promise<ResponseActionApproval | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error('Approval requests require authentication');
  }

  const { data, error } = await supabase
    .from('response_action_approvals')
    .insert({
      action_id: input.actionId,
      action_type: input.actionType,
      target_entity: input.targetEntity,
      scope_summary: input.scopeSummary,
      requested_by: userData.user.id,
      ttl_minutes: input.ttlMinutes ?? 60,
      status: 'pending',
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getApproval(actionId: string): Promise<ResponseActionApproval | null> {
  const { data, error } = await supabase
    .from('response_action_approvals')
    .select('*')
    .eq('action_id', actionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function approveAction(actionId: string): Promise<ResponseActionApproval | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error('Approval requires authentication');
  }

  const { data, error } = await supabase
    .from('response_action_approvals')
    .update({
      status: 'approved',
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('action_id', actionId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function rejectAction(actionId: string, reason: string): Promise<ResponseActionApproval | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error('Rejection requires authentication');
  }

  const { data, error } = await supabase
    .from('response_action_approvals')
    .update({
      status: 'rejected',
      approved_by: userData.user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('action_id', actionId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markExecuted(
  actionId: string,
  result: Record<string, unknown>,
): Promise<ResponseActionApproval | null> {
  const { data, error } = await supabase
    .from('response_action_approvals')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq('action_id', actionId)
    .eq('status', 'approved')
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Block until the action is approved, rejected, or its TTL expires.
 * Polls every 2 seconds (configurable).
 */
export async function waitForApproval(
  actionId: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<ResponseActionApproval> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const pollMs = options.pollMs ?? 2000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const current = await getApproval(actionId);
    if (current && current.status !== 'pending') {
      return current;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(`Approval for action ${actionId} timed out after ${timeoutMs}ms`);
}

export async function listPendingApprovals(): Promise<ResponseActionApproval[]> {
  const { data, error } = await supabase
    .from('response_action_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
