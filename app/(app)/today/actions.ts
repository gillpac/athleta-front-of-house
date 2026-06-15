'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'

async function insertActivity(leadId: string, userId: string, kind: string, body: string) {
  const admin = createAdminClient()
  await admin.from('activities').insert({ lead_id: leadId, user_id: userId, kind, body })
}

export async function logCallOutcome(leadId: string, outcome: string, userId: string) {
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('attempts, contacted').eq('id', leadId).single()
  const isUnreached = outcome === 'No answer' || outcome === 'Left voicemail'
  await supabase.from('leads').update({
    contacted: true,
    last_outcome: outcome,
    attempts: isUnreached ? (lead?.attempts ?? 0) + 1 : (lead?.attempts ?? 0),
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'comm', `Called — ${outcome.toLowerCase()}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'call_outcome', after: { outcome } })
  revalidatePath('/today')
}

export async function bookTrial(leadId: string, trialAt: string, programmeId: string | null, programmeName: string, userId: string) {
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('status, rebooks').eq('id', leadId).single()
  const wasNoShow = lead?.status === 'noshow'
  await supabase.from('leads').update({
    status: 'booked',
    trial_at: trialAt,
    programme_id: programmeId,
    next_action_at: trialAt,
    rebooks: wasNoShow ? (lead?.rebooks ?? 0) + 1 : (lead?.rebooks ?? 0),
  }).eq('id', leadId)
  const dateStr = new Date(trialAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const timeStr = new Date(trialAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  await insertActivity(leadId, userId, 'status', `Trial ${wasNoShow ? 're-booked' : 'booked'} — ${dateStr} ${timeStr}, ${programmeName}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'book_trial', after: { trialAt, programmeName } })
  revalidatePath('/today')
}

export async function markArrived(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'status', 'Marked arrived ✓')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_arrived' })
  revalidatePath('/today')
}

export async function undoArrived(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'undo', 'Undid: marked arrived')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'undo_arrived' })
  revalidatePath('/today')
}

export async function markNoShow(leadId: string, userId: string) {
  const supabase = await createClient()
  const nextAction = new Date(); nextAction.setDate(nextAction.getDate() + 2)
  await supabase.from('leads').update({
    status: 'noshow',
    trial_at: null,
    next_action_at: nextAction.toISOString(),
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', 'Marked no-show')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'no_show' })
  revalidatePath('/today')
}

export async function makeSale(leadId: string, firstClassDate: string, firstClass: string, paymentTaken: boolean, userId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({
    status: 'won',
    sold_at: new Date().toISOString(),
    sold_by: userId,
    payment_taken: paymentTaken,
    first_class_date: firstClassDate,
    first_class: firstClass,
    next_action_at: null,
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `SALE 🎉 enrolled — first class ${firstClassDate}, ${firstClass}${paymentTaken ? '. Rego & insurance paid' : ''}. Enter in iClassPro`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'sale', after: { firstClassDate, firstClass, paymentTaken } })
  revalidatePath('/today')
}

export async function markDidntEnrol(leadId: string, reason: string, userId: string, followupDate?: string) {
  const supabase = await createClient()
  const followup = followupDate ? new Date(followupDate + 'T12:00:00') : new Date()
  if (!followupDate) followup.setDate(followup.getDate() + 7)
  const followupStr = followup.toISOString().split('T')[0]
  await supabase.from('leads').update({
    status: 'nurture',
    lost_reason: reason,
    nurture_followup_at: followupStr,
    next_action_at: followup.toISOString(),
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `Didn't enrol — ${reason}. Moved to nurture (follow up ${followupStr})`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'didnt_enrol', after: { reason, followupStr } })
  revalidatePath('/today')
}

export async function markLost(leadId: string, reason: string, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('leads').select('*').eq('id', leadId).single()
  await supabase.from('leads').update({
    status: 'lost',
    lost_reason: reason,
    next_action_at: null,
    prev_state: { status: before?.status, trial_at: before?.trial_at },
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `Marked lost — ${reason}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_lost', before, after: { status: 'lost', reason } })
  revalidatePath('/today')
}

export async function sendConfirmation(leadId: string, userId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  // If Zapier webhook is configured, send via email API
  if (process.env.ZAPIER_EMAIL_WEBHOOK_URL) {
    const { data: lead } = await admin
      .from('leads')
      .select('*, guardian:guardians(*), programme:programmes(name)')
      .eq('id', leadId)
      .single()

    if (lead) {
      const guardian = lead.guardian as Record<string, string> | null
      const programmeName = (lead.programme as Record<string, string> | null)?.name ?? ''
      const trialDate = lead.trial_at
        ? new Date(lead.trial_at).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
        : 'TBC'
      const guardianFirstName = guardian?.first_name ?? 'there'
      const sig = lead.site === 'altona_north'
        ? `<p style="color:#555;font-size:13px;margin-top:24px;"><strong>Athleta Gymnastics — Altona North</strong><br>📞 (03) 9999 0002<br>🌐 www.athletagymnastics.com.au</p>`
        : `<p style="color:#555;font-size:13px;margin-top:24px;"><strong>Athleta Gymnastics — Coolaroo</strong><br>📞 (03) 9999 0001<br>🌐 www.athletagymnastics.com.au</p>`
      const htmlBody = `<p>Hi ${guardianFirstName},</p><p>Thanks for booking a trial for <strong>${lead.child_first}</strong>! We're looking forward to meeting you.</p><p><strong>Trial details:</strong><br>📅 ${trialDate}<br>🤸 Programme: ${programmeName || 'To be confirmed'}</p><p>Please arrive 5 minutes early. Wear comfortable clothing and bare feet for gymnastics.</p><p>See you soon!</p>${sig}`

      await fetch(process.env.ZAPIER_EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: guardian?.email ?? null,
          subject: `Your trial booking — ${lead.child_first} at Athleta Gymnastics`,
          html_body: htmlBody,
          site: lead.site,
          guardian_email: guardian?.email,
          child_name: `${lead.child_first} ${lead.child_last}`,
          trial_date: trialDate,
          programme: programmeName,
          kind: 'confirmation',
        }),
      }).catch(() => null) // don't fail if Zapier is down
    }
  }

  await supabase.from('leads').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', leadId)
  await insertActivity(leadId, userId, 'comm', 'Confirmation email sent')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'confirmation_sent' })
  revalidatePath('/today')
}

export async function verifySale(leadId: string, userId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ verified_at: new Date().toISOString(), verified_by: userId }).eq('id', leadId)
  await insertActivity(leadId, userId, 'verify', 'Admin verified the sale ✓')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'verify_sale' })
  revalidatePath('/today')
}

// Alias matching the spec name
export const verifyLead = verifySale

export async function toggleChecklist(itemId: string, userId: string, completed: boolean) {
  const admin = createAdminClient()
  const todayStr = new Date().toISOString().split('T')[0]
  if (completed) {
    await admin.from('checklist_completions').upsert({ item_id: itemId, user_id: userId, day: todayStr })
  } else {
    await admin.from('checklist_completions').delete().eq('item_id', itemId).eq('user_id', userId).eq('day', todayStr)
  }
  revalidatePath('/today')
}

export async function logNote(leadId: string, note: string, userId: string) {
  await insertActivity(leadId, userId, 'note', note)
  revalidatePath('/today')
}

export async function logText(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'comm', 'Text sent')
  revalidatePath('/today')
}

export async function logEmail(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'comm', 'Email sent')
  revalidatePath('/today')
}

export async function resendForm(leadId: string, userId: string) {
  await insertActivity(leadId, userId, 'comm', 'Jotform re-sent to parent')
  revalidatePath('/today')
}

export async function markFormReceived(leadId: string, userId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ form_received: true }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', 'Jotform received ✓')
  revalidatePath('/today')
}
