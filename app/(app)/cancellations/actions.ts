'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type { CancelStage, CancelOutcome } from '@/types'

function revalidate() {
  revalidatePath('/cancellations')
}

export async function advanceStage(id: string, stage: CancelStage, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('cancellations').select('*').eq('id', id).single()
  const updates: Record<string, unknown> = { stage }
  if (stage === 'processed') updates.processed_by = userId
  if (stage === 'verified') {
    updates.verified_at = new Date().toISOString()
    updates.verified_by = userId
  }
  await supabase.from('cancellations').update(updates).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: `stage_${stage}`, before, after: { ...before, ...updates } })
  revalidate()
}

export async function setSaveOutcome(
  id: string,
  outcome: CancelOutcome,
  saveOutcome: string,
  userId: string
) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('cancellations').select('*').eq('id', id).single()
  // Recording the outcome of a save conversation must NOT advance the cancellation
  // into the iClassPro-processed / verified stages — those are deliberate later steps
  // (scope rule 8: departures only count once admin-verified). Keep it at save_attempt.
  const updates = { outcome, save_outcome: saveOutcome, stage: 'save_attempt' as CancelStage }
  await supabase.from('cancellations').update(updates).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: 'save_outcome', before, after: { ...before, ...updates } })
  revalidate()
}

export async function toggleFeesFlag(id: string, flag: boolean, userId: string) {
  const supabase = await createClient()
  await supabase.from('cancellations').update({ outstanding_fees_flag: flag }).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: 'toggle_fees_flag', after: { flag } })
  revalidate()
}

export async function updateEffectiveDate(id: string, date: string, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('cancellations').select('effective_date').eq('id', id).single()
  await supabase.from('cancellations').update({ effective_date: date }).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: 'update_effective_date', before, after: { effective_date: date } })
  revalidate()
}

export async function undoStage(id: string, prevStage: CancelStage, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('cancellations').select('*').eq('id', id).single()
  const updates: Record<string, unknown> = { stage: prevStage, outcome: null, save_outcome: null }
  if (prevStage !== 'processed') updates.processed_by = null
  if (prevStage !== 'verified') { updates.verified_at = null; updates.verified_by = null }
  await supabase.from('cancellations').update(updates).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: 'undo_stage', before, after: { ...before, ...updates } })
  revalidate()
}

export async function archiveCancellation(id: string, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('cancellations').select('*').eq('id', id).single()
  await supabase.from('cancellations').update({ archived_at: new Date().toISOString(), archived_by: userId }).eq('id', id)
  await logAudit({ entity: 'cancellations', entity_id: id, user_id: userId, action: 'archive', before })
  revalidate()
}
