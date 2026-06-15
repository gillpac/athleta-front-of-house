'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'
import { buildAddress, buildJotformUrl, postToZapier, runtimeEnv } from '@/lib/email-helpers'

async function insertActivity(leadId: string, userId: string, kind: string, body: string) {
  const admin = createAdminClient()
  await admin.from('activities').insert({ lead_id: leadId, user_id: userId, kind, body })
}

export async function logCallOutcome(leadId: string, outcome: string, userId: string, followUpAt?: string) {
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('attempts, contacted').eq('id', leadId).single()
  const isUnreached = outcome === 'No answer' || outcome === 'Left voicemail'
  await supabase.from('leads').update({
    contacted: true,
    last_outcome: outcome,
    attempts: isUnreached ? (lead?.attempts ?? 0) + 1 : (lead?.attempts ?? 0),
    ...(followUpAt ? { next_action_at: followUpAt } : {}),
  }).eq('id', leadId)
  const followUpStr = followUpAt
    ? ` — follow up ${new Date(followUpAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' })}`
    : ''
  await insertActivity(leadId, userId, 'comm', `Called — ${outcome.toLowerCase()}${followUpStr}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'call_outcome', after: { outcome, followUpAt } })
  revalidatePath('/today')
  revalidatePath('/leads')
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
  const dateStr = new Date(trialAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' })
  const timeStr = new Date(trialAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }).toLowerCase()
  await insertActivity(leadId, userId, 'status', `Trial ${wasNoShow ? 're-booked' : 'booked'} — ${dateStr} ${timeStr}, ${programmeName}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'book_trial', after: { trialAt, programmeName } })
  revalidatePath('/today')
  revalidatePath('/leads')
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
  revalidatePath('/leads')
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
  const [yr, mo, dy] = firstClassDate.split('-')
  const firstClassAU = `${dy}/${mo}/${yr}`
  await insertActivity(leadId, userId, 'status', `SALE 🎉 enrolled — first class ${firstClassAU}, ${firstClass}${paymentTaken ? '. Rego & insurance paid' : ''}. Enter in iClassPro`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'sale', after: { firstClassDate, firstClass, paymentTaken } })
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function markDidntEnrol(leadId: string, reason: string, userId: string, followupDate?: string) {
  const supabase = await createClient()
  const followup = followupDate ? new Date(followupDate + 'T12:00:00') : new Date()
  if (!followupDate) followup.setDate(followup.getDate() + 7)
  const followupStr = followup.toISOString().split('T')[0]
  const followupAU = `${String(followup.getDate()).padStart(2, '0')}/${String(followup.getMonth() + 1).padStart(2, '0')}/${followup.getFullYear()}`
  await supabase.from('leads').update({
    status: 'nurture',
    lost_reason: reason,
    nurture_followup_at: followupStr,
    next_action_at: followup.toISOString(),
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `Didn't enrol — ${reason}. Moved to nurture (follow up ${followupAU})`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'didnt_enrol', after: { reason, followupStr } })
  revalidatePath('/today')
  revalidatePath('/leads')
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
  revalidatePath('/leads')
}

export async function markUnreachable(leadId: string, userId: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('leads').select('*').eq('id', leadId).single()
  const attempts = before?.attempts ?? 0
  const reason = `Unreachable after ${attempts} attempts`
  await supabase.from('leads').update({
    status: 'lost',
    lost_reason: reason,
    next_action_at: null,
    prev_state: { status: before?.status, trial_at: before?.trial_at },
  }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `Marked unreachable — no contact after ${attempts} attempts`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_unreachable', before, after: { status: 'lost', reason } })
  revalidatePath('/today')
  revalidatePath('/leads')
}


export async function sendConfirmation(leadId: string, userId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: lead } = await admin
    .from('leads')
    .select('*, guardian:guardians(*)')
    .eq('id', leadId)
    .single()

  if (lead) {
    const guardian = lead.guardian as Record<string, string> | null
    const trialDateStr = lead.trial_at
      ? new Date(lead.trial_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' })
      : 'TBC'
    const trialTimeStr = lead.trial_at
      ? new Date(lead.trial_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }).toLowerCase()
      : 'TBC'
    const guardianFirstName = guardian?.first_name ?? 'there'
    const jotformUrl = buildJotformUrl(lead.site, lead, guardian as Record<string, string> | null)
    const jotformLine = jotformUrl
      ? `👉 Complete form: <a href="${jotformUrl}" style="color:#000;font-weight:600;text-decoration:underline;">Click here to complete</a><br><br>`
      : ''
    const htmlBody = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:'Onest',Arial,Helvetica,sans-serif;color:#333333;line-height:1.5;"><tr><td style="padding:0;font-size:14px;">Hi ${guardianFirstName},<br><br>Thanks for booking a trial class with Athleta Gymnastics — we're looking forward to welcoming ${lead.child_first}.<br><br><strong>Trial Date:</strong> ${trialDateStr}<br><strong>Time:</strong> ${trialTimeStr}<br><strong>Address:</strong> ${buildAddress(lead.site)}<br><br>Before attending, please complete this short form using the link below. It covers medical and emergency details and must be completed prior to the trial.<br><br>${jotformLine}If you have any questions, just reply to this email.<br><br>Kind Regards,</td></tr></table>`

    await postToZapier({
      to: guardian?.email ?? null,
      subject: `Your trial booking for ${lead.child_first}`,
      html_body: htmlBody,
      site: lead.site,
      kind: 'confirmation',
    })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { confirmation_sent_at: now }
  const jotformConfigured = !!(lead?.site === 'altona_north' ? runtimeEnv('JOTFORM_URL_ALTONA_NORTH') : runtimeEnv('JOTFORM_URL_COOLAROO'))
  if (jotformConfigured) updates.form_sent_at = now
  await supabase.from('leads').update(updates).eq('id', leadId)
  const activityMsg = jotformConfigured
    ? 'Confirmation email sent (Jotform link included)'
    : 'Confirmation email sent'
  await insertActivity(leadId, userId, 'comm', activityMsg)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'confirmation_sent' })
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function verifySale(leadId: string, userId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ verified_at: new Date().toISOString(), verified_by: userId }).eq('id', leadId)
  await insertActivity(leadId, userId, 'verify', 'Admin verified the sale ✓')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'verify_sale' })
  revalidatePath('/today')
  revalidatePath('/leads')
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
  revalidatePath('/leads')
}

export async function logText(leadId: string, userId: string, message?: string) {
  await insertActivity(leadId, userId, 'comm', message ? `Text sent — ${message}` : 'Text sent')
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function logEmail(leadId: string, userId: string, message?: string) {
  await insertActivity(leadId, userId, 'comm', message ? `Email sent — ${message}` : 'Email sent')
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function sendJotform(leadId: string, userId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: lead } = await admin
    .from('leads')
    .select('*, guardian:guardians(*)')
    .eq('id', leadId)
    .single()

  if (lead) {
    const guardian = lead.guardian as Record<string, string> | null
    const jotformUrl = buildJotformUrl(lead.site, lead, guardian)
    if (jotformUrl) {
      const guardianFirstName = guardian?.first_name ?? 'there'
      const htmlBody = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:'Onest',Arial,Helvetica,sans-serif;color:#333333;line-height:1.5;"><tr><td style="padding:0;font-size:14px;">Hi ${guardianFirstName},<br><br>Please complete the enrolment form for <strong>${lead.child_first}</strong> before your trial. It covers medical and emergency details and must be completed prior to attending.<br><br>👉 Complete form: <a href="${jotformUrl}" style="color:#000;font-weight:600;text-decoration:underline;">Click here to complete</a><br><br>If you have any questions, just reply to this email.<br><br>Kind Regards,</td></tr></table>`
      await postToZapier({
        to: guardian?.email ?? null,
        subject: `Enrolment form for ${lead.child_first}`,
        html_body: htmlBody,
        site: lead.site,
        kind: 'jotform',
      })
    }
  }

  await supabase.from('leads').update({ form_sent_at: new Date().toISOString() }).eq('id', leadId)
  await insertActivity(leadId, userId, 'comm', 'Jotform sent to parent')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'form_sent' })
  revalidatePath('/today')
  revalidatePath('/leads')
}

/** Returns the pre-filled Jotform link for a lead, so staff can copy it
 *  and paste into a text message. Does not change any data. */
export async function getJotformLink(leadId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('*, guardian:guardians(*)')
    .eq('id', leadId)
    .single()
  if (!lead) return null
  return buildJotformUrl(lead.site, lead, lead.guardian as Record<string, string> | null)
}

export async function resendForm(leadId: string, userId: string) {
  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('*, guardian:guardians(*)')
    .eq('id', leadId)
    .single()

  if (lead) {
    const guardian = lead.guardian as Record<string, string> | null
    const jotformUrl = buildJotformUrl(lead.site, lead, guardian)
    if (jotformUrl) {
      const guardianFirstName = guardian?.first_name ?? 'there'
      const htmlBody = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:'Onest',Arial,Helvetica,sans-serif;color:#333333;line-height:1.5;"><tr><td style="padding:0;font-size:14px;">Hi ${guardianFirstName},<br><br>Just a reminder to complete the enrolment form for <strong>${lead.child_first}</strong> before the trial. It covers medical and emergency details and must be completed prior to attending.<br><br>👉 Complete form: <a href="${jotformUrl}" style="color:#000;font-weight:600;text-decoration:underline;">Click here to complete</a><br><br>If you have any questions, just reply to this email.<br><br>Kind Regards,</td></tr></table>`
      await postToZapier({
        to: guardian?.email ?? null,
        subject: `Reminder: Enrolment form for ${lead.child_first}`,
        html_body: htmlBody,
        site: lead.site,
        kind: 'jotform',
      })
    }
  }

  await insertActivity(leadId, userId, 'comm', 'Jotform re-sent to parent')
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function markFormReceived(leadId: string, userId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ form_received: true }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', 'Jotform received ✓')
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function updateLeadProfile(
  leadId: string,
  guardianId: string,
  userId: string,
  leadFields: { child_first: string; child_last: string; dob: string | null; gender: string | null; programme_id: string | null },
  guardianFields: { first_name: string; last_name: string; phone: string; email: string | null; preferred_contact: string | null; secondary_contact_note: string | null },
) {
  const supabase = await createClient()
  await supabase.from('leads').update(leadFields).eq('id', leadId)
  await supabase.from('guardians').update(guardianFields).eq('id', guardianId)
  await insertActivity(leadId, userId, 'note', 'Profile updated')
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'update_profile', after: { ...leadFields, ...guardianFields } })
  revalidatePath('/today')
  revalidatePath('/leads')
}

export async function archiveLeadWithReason(leadId: string, userId: string, reason: string) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('leads').select('*').eq('id', leadId).single()
  await supabase.from('leads').update({ archived_at: new Date().toISOString(), archived_by: userId }).eq('id', leadId)
  await insertActivity(leadId, userId, 'status', `Archived — ${reason}`)
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'archive', before, after: { reason } })
  revalidatePath('/today')
  revalidatePath('/leads')
}
