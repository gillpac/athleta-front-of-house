'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import type { Lead } from '@/types'

/** Fetch a lead's current row (for before/after audit snapshots). */
async function getLead(leadId: string): Promise<Lead | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single<Lead>()
  return data ?? null
}

async function insertActivity(
  leadId: string,
  userId: string | null,
  kind: string,
  body: string
) {
  const supabase = await createClient()
  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind,
    body,
  })
}

/**
 * Log a call outcome. "Contacted" = any logged call including voicemail,
 * so contacted is always set true here.
 */
export async function logCallOutcome(
  leadId: string,
  outcome: string,
  userId: string
) {
  const supabase = await createClient()
  const before = await getLead(leadId)
  const attempts = (before?.attempts ?? 0) + 1

  const { error } = await supabase
    .from('leads')
    .update({ contacted: true, last_outcome: outcome, attempts })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(leadId, userId, 'comm', `Called — ${outcome.toLowerCase()}`)
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'log_call_outcome',
      before: { contacted: before?.contacted, last_outcome: before?.last_outcome, attempts: before?.attempts },
      after: { contacted: true, last_outcome: outcome, attempts },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/**
 * Book (or re-book) a trial. Sets status='booked', the trial time, the
 * programme, and — per the mandatory next-action rule — next_action_at = trial_at.
 */
export async function bookTrial(
  leadId: string,
  trialAt: string,
  programme: string | null,
  userId: string
) {
  const supabase = await createClient()
  const before = await getLead(leadId)
  const wasNoShow = before?.status === 'noshow'
  const rebooks = wasNoShow ? (before?.rebooks ?? 0) + 1 : before?.rebooks ?? 0

  const update: Record<string, unknown> = {
    status: 'booked',
    trial_at: trialAt,
    next_action_at: trialAt,
    rebooks,
  }
  if (programme) update.programme_id = programme

  const { error } = await supabase.from('leads').update(update).eq('id', leadId)

  if (!error) {
    await insertActivity(
      leadId,
      userId,
      'status',
      `Trial ${wasNoShow ? 're-booked' : 'booked'} — ${new Date(trialAt).toLocaleString('en-AU')}`
    )
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'book_trial',
      before: { status: before?.status, trial_at: before?.trial_at },
      after: { status: 'booked', trial_at: trialAt },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/** Mark a trial as arrived (logged on the timeline only). */
export async function markArrived(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'status', 'Marked arrived ✓')
  await logAudit({
    entity: 'lead',
    entity_id: leadId,
    user_id: userId,
    action: 'mark_arrived',
    after: { arrived: true },
  })
  revalidatePath('/today')
  return { error: null }
}

/** Mark a trial as a no-show. Clears trial_at and moves to noshow status. */
export async function markNoShow(leadId: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(leadId)

  const { error } = await supabase
    .from('leads')
    .update({ status: 'noshow', trial_at: null })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(leadId, userId, 'status', 'Marked no-show')
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'mark_noshow',
      before: { status: before?.status, trial_at: before?.trial_at },
      after: { status: 'noshow', trial_at: null },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/** Make the sale. Enrols the child; the sale awaits admin verification. */
export async function makeSale(
  leadId: string,
  firstClassDate: string,
  firstClass: string,
  paymentTaken: boolean,
  userId: string
) {
  const supabase = await createClient()
  const before = await getLead(leadId)

  const { error } = await supabase
    .from('leads')
    .update({
      status: 'won',
      sold_at: new Date().toISOString(),
      sold_by: userId,
      payment_taken: paymentTaken,
      first_class_date: firstClassDate,
      first_class: firstClass,
      next_action_at: null,
    })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(
      leadId,
      userId,
      'status',
      `SALE 🎉 enrolled — first class ${firstClassDate}, ${firstClass}${paymentTaken ? '. Rego & insurance paid' : ''}`
    )
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'make_sale',
      before: { status: before?.status },
      after: { status: 'won', first_class_date: firstClassDate, first_class: firstClass },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/** Trial attended but didn't enrol — moves to nurture with a 7-day follow-up. */
export async function markDidntEnrol(
  leadId: string,
  reason: string,
  userId: string
) {
  const supabase = await createClient()
  const before = await getLead(leadId)
  const followup = new Date()
  followup.setDate(followup.getDate() + 7)
  const followupDate = followup.toISOString().slice(0, 10)

  const { error } = await supabase
    .from('leads')
    .update({ status: 'nurture', nurture_followup_at: followupDate })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(
      leadId,
      userId,
      'status',
      `Didn't enrol — ${reason}. Moved to nurture`
    )
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'didnt_enrol',
      before: { status: before?.status },
      after: { status: 'nurture', nurture_followup_at: followupDate, reason },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/** Send (log) the trial confirmation email. */
export async function sendConfirmation(leadId: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(leadId)

  const { error } = await supabase
    .from('leads')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(leadId, userId, 'comm', 'Confirmation email sent')
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'send_confirmation',
      before: { confirmation_sent_at: before?.confirmation_sent_at },
      after: { confirmation_sent_at: 'now' },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}

/**
 * Tick / untick a daily checklist item for the current user, for today.
 * Completions are per-day rows; unticking removes today's row only.
 */
export async function toggleChecklist(
  itemId: string,
  userId: string,
  completed: boolean
) {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  if (completed) {
    await supabase
      .from('checklist_completions')
      .upsert(
        { item_id: itemId, user_id: userId, day: today },
        { onConflict: 'item_id,user_id,day' }
      )
  } else {
    await supabase
      .from('checklist_completions')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId)
      .eq('day', today)
  }

  revalidatePath('/today')
  return { error: null }
}

/** Admin verification of a sale. Only verified sales count toward targets. */
export async function verifyLead(leadId: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(leadId)

  const { error } = await supabase
    .from('leads')
    .update({ verified_at: new Date().toISOString(), verified_by: userId })
    .eq('id', leadId)

  if (!error) {
    await insertActivity(leadId, userId, 'verify', 'Admin verified the sale ✓')
    await logAudit({
      entity: 'lead',
      entity_id: leadId,
      user_id: userId,
      action: 'verify_sale',
      before: { verified_at: before?.verified_at },
      after: { verified_at: 'now', verified_by: userId },
    })
  }

  revalidatePath('/today')
  return { error: error?.message ?? null }
}
