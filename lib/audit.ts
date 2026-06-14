import { createAdminClient } from './supabase/server-admin'

export interface AuditParams {
  entity: string
  entity_id: string
  user_id: string | null
  action: string
  before?: unknown
  after?: unknown
}

/**
 * Write an entry to the audit_log table.
 * Uses the admin client so it bypasses RLS — safe to call from
 * server actions and API routes only.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('audit_log').insert({
    entity: params.entity,
    entity_id: params.entity_id,
    user_id: params.user_id ?? null,
    action: params.action,
    before: params.before ?? null,
    after: params.after ?? null,
  })
  if (error) {
    // Log to console but don't throw — audit failures must never break
    // the primary operation.
    console.error('[audit] failed to write audit log:', error.message, params)
  }
}
