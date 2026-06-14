'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function logCallOutcome(
  leadId: string,
  outcome: string,
  userId: string
) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const updates = {
    contacted: true,
    last_outcome: outcome,
    attempts: (before?.attempts ?? 0) + 1,
    next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'comm',
    body: `Called — ${outcome.toLowerCase()}`,
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'log_call_outcome',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function bookTrial(
  leadId: string,
  trialAt: string,
  programmeId: string | null,
  userId: string
) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const wasNoShow = before?.status === 'noshow'

  const updates: Record<string, unknown> = {
    status: 'booked',
    trial_at: trialAt,
    programme_id: programmeId,
    next_action_at: trialAt,
  }

  if (wasNoShow) {
    updates.rebooks = (before?.rebooks ?? 0) + 1
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  const trialDate = new Date(trialAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'status',
    body: `Trial ${wasNoShow ? 're-booked' : 'booked'} — ${trialDate}`,
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'book_trial',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function markArrived(leadId: string, userId: string) {
  const supabase = await createClient()

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'status',
    body: 'Marked arrived ✓',
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'mark_arrived',
    after: { arrived_at: new Date().toISOString() },
  })

  revalidatePath('/today')
}

export async function undoArrived(leadId: string, userId: string) {
  const supabase = await createClient()

  const { data: acts } = await supabase
    .from('activities')
    .select('id')
    .eq('lead_id', leadId)
    .eq('body', 'Marked arrived ✓')
    .order('created_at', { ascending: false })
    .limit(1)

  if (acts && acts.length > 0) {
    await supabase.from('activities').delete().eq('id', acts[0].id)
  }

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'undo',
    body: 'Undid: marked arrived',
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'undo_arrived',
  })

  revalidatePath('/today')
}

export async function markNoShow(leadId: string, userId: string) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const updates = {
    status: 'noshow',
    trial_at: null,
    next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'status',
    body: 'Marked no-show',
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'mark_no_show',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function makeSale(
  leadId: string,
  firstClassDate: string,
  firstClass: string,
  paymentTaken: boolean,
  userId: string
) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const updates = {
    status: 'won',
    sold_at: new Date().toISOString(),
    sold_by: userId,
    payment_taken: paymentTaken,
    first_class_date: firstClassDate,
    first_class: firstClass,
    next_action_at: null,
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'status',
    body: `SALE 🎉 enrolled — first class ${firstClass}${paymentTaken ? '. Rego & insurance paid' : ''}`,
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'make_sale',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function markDidntEnrol(
  leadId: string,
  reason: string,
  userId: string
) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const nurtureDate = new Date()
  nurtureDate.setDate(nurtureDate.getDate() + 7)

  const updates = {
    status: 'nurture',
    lost_reason: reason,
    nurture_followup_at: nurtureDate.toISOString().split('T')[0],
    next_action_at: null,
    prev_state: { status: before?.status, trial_at: before?.trial_at },
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'status',
    body: `Didn't enrol — ${reason}. Moved to nurture`,
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'mark_didnt_enrol',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function sendConfirmation(leadId: string, userId: string) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const updates = {
    confirmation_sent_at: new Date().toISOString(),
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'comm',
    body: 'Confirmation email sent',
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'send_confirmation',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}

export async function toggleChecklist(
  itemId: string,
  userId: string,
  completed: boolean
) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  if (completed) {
    await supabase.from('checklist_completions').insert({
      item_id: itemId,
      user_id: userId,
      day: today,
    })
  } else {
    await supabase
      .from('checklist_completions')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId)
      .eq('day', today)
  }

  revalidatePath('/today')
}

export async function verifyLead(leadId: string, userId: string) {
  const supabase = await createClient()

  const { data: before } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  const updates = {
    verified_at: new Date().toISOString(),
    verified_by: userId,
  }

  await supabase.from('leads').update(updates).eq('id', leadId)

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: userId,
    kind: 'verify',
    body: 'Admin verified the sale ✓',
  })

  await logAudit({
    entity: 'leads',
    entity_id: leadId,
    user_id: userId,
    action: 'verify_sale',
    before,
    after: { ...before, ...updates },
  })

  revalidatePath('/today')
}
