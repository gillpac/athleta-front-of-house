'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'
import { buildAddress, buildJotformUrl, postToZapier, runtimeEnv } from '@/lib/email-helpers'

function revalidate() {
  revalidatePath('/leads')
  revalidatePath('/today')
}

async function getLead(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string) {
  const { data } = await supabase.from('leads').select('*').eq('id', leadId).single()
  return data
}

export async function logCallOutcome(leadId: string, outcome: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = {
    contacted: true,
    last_outcome: outcome,
    attempts: (before?.attempts ?? 0) + 1,
    next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'comm', body: `Called — ${outcome.toLowerCase()}` })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'log_call_outcome', before, after: { ...before, ...updates } })
  revalidate()
}

export async function bookTrial(leadId: string, trialAt: string, programmeId: string | null, userId: string, otherProgramme?: string | null) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const wasNoShow = before?.status === 'noshow'
  const updates: Record<string, unknown> = {
    status: 'booked',
    trial_at: trialAt,
    programme_id: programmeId,
    next_action_at: trialAt,
  }
  if (wasNoShow) updates.rebooks = (before?.rebooks ?? 0) + 1
  await supabase.from('leads').update(updates).eq('id', leadId)
  const trialDate = new Date(trialAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' })
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: `Trial ${wasNoShow ? 're-booked' : 'booked'} — ${trialDate}` })
  if (otherProgramme?.trim()) {
    await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'note', body: `Programme (Other): ${otherProgramme.trim()}` })
  }
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'book_trial', before, after: { ...before, ...updates } })
  revalidate()
}

export async function markNoShow(leadId: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = { status: 'noshow', trial_at: null, next_action_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: 'Marked no-show' })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_no_show', before, after: { ...before, ...updates } })
  revalidate()
}

export async function makeSale(leadId: string, firstClassDate: string, firstClass: string, paymentTaken: boolean, userId: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = { status: 'won', sold_at: new Date().toISOString(), sold_by: userId, payment_taken: paymentTaken, first_class_date: firstClassDate, first_class: firstClass, next_action_at: null }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: `SALE 🎉 enrolled — first class ${firstClass}${paymentTaken ? '. Rego & insurance paid' : ''}` })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'make_sale', before, after: { ...before, ...updates } })
  revalidate()
}

export async function markDidntEnrol(leadId: string, reason: string, userId: string, followupDate?: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const followup = followupDate ? new Date(followupDate + 'T12:00:00') : new Date()
  if (!followupDate) followup.setDate(followup.getDate() + 7)
  const followupStr = followup.toISOString().split('T')[0]
  const followupAU = `${String(followup.getDate()).padStart(2, '0')}/${String(followup.getMonth() + 1).padStart(2, '0')}/${followup.getFullYear()}`
  const updates = { status: 'nurture', lost_reason: reason, nurture_followup_at: followupStr, next_action_at: followup.toISOString(), prev_state: { status: before?.status, trial_at: before?.trial_at } }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: `Didn't enrol — ${reason}. Moved to nurture (follow up ${followupAU})` })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_didnt_enrol', before, after: { ...before, ...updates } })
  revalidate()
}

export async function markLost(leadId: string, reason: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = { status: 'lost', lost_reason: reason, next_action_at: null, prev_state: { status: before?.status, trial_at: before?.trial_at } }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: `Marked lost — ${reason}` })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'mark_lost', before, after: { ...before, ...updates } })
  revalidate()
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
    const guardianFirstName = guardian?.first_name ?? 'there'
    const trialDateStr = lead.trial_at
      ? new Date(lead.trial_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' })
      : 'TBC'
    const trialTimeStr = lead.trial_at
      ? new Date(lead.trial_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }).toLowerCase()
      : 'TBC'
    const jotformUrl = buildJotformUrl(lead.site, lead, guardian)
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
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'comm', body: activityMsg })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'send_confirmation' })
  revalidate()
}

export async function verifyLead(leadId: string, userId: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = { verified_at: new Date().toISOString(), verified_by: userId }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'verify', body: 'Admin verified the sale ✓' })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'verify_sale', before, after: { ...before, ...updates } })
  revalidate()
}

export async function addNote(leadId: string, userId: string, body: string) {
  const supabase = await createClient()
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'note', body })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'add_note', after: { body } })
  revalidate()
}

export async function archiveLead(leadId: string, userId: string, reason: string) {
  const supabase = await createClient()
  const before = await getLead(supabase, leadId)
  const updates = { archived_at: new Date().toISOString(), archived_by: userId }
  await supabase.from('leads').update(updates).eq('id', leadId)
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'status', body: `Archived — ${reason}` })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'archive_lead', before, after: { ...before, ...updates, reason } })
  revalidate()
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
  await supabase.from('activities').insert({ lead_id: leadId, user_id: userId, kind: 'note', body: 'Profile updated' })
  await logAudit({ entity: 'leads', entity_id: leadId, user_id: userId, action: 'update_profile', after: { ...leadFields, ...guardianFields } })
  revalidate()
}

export async function createLead(data: {
  childFirst: string
  childLast: string
  dob: string | null
  gender: string | null
  programmeId: string | null
  site: string
  source: string
  referrerName: string | null
  notes: string | null
  guardianFirst: string
  guardianLast: string
  phone: string
  email: string | null
  relationship: string | null
}, userId: string) {
  const admin = createAdminClient()

  // Dedup guardian by phone
  let guardianId: string | null = null
  if (data.phone) {
    const norm = data.phone.replace(/\D/g, '').replace(/^0/, '+61').replace(/^61/, '+61')
    const { data: existing } = await admin.from('guardians').select('id').eq('phone', norm).is('archived_at', null).single()
    if (existing) guardianId = existing.id
    const gPayload = { first_name: data.guardianFirst.trim() || 'Unknown', last_name: data.guardianLast.trim(), phone: norm, email: data.email || null, preferred_contact: null }
    if (guardianId) {
      await admin.from('guardians').update(gPayload).eq('id', guardianId)
    } else {
      const { data: g } = await admin.from('guardians').insert(gPayload).select('id').single()
      guardianId = g?.id ?? null
    }
  }
  if (!guardianId) return { error: 'Could not create guardian' }

  const leadPayload = {
    guardian_id: guardianId,
    relationship: data.relationship || null,
    child_first: data.childFirst.trim(),
    child_last: data.childLast.trim() || data.childFirst.trim(),
    dob: data.dob || null,
    gender: data.gender || null,
    site: data.site,
    programme_id: data.programmeId || null,
    source: data.source || 'walk-in',
    referrer_name: data.referrerName || null,
    status: 'new',
    contacted: false,
    attempts: 0,
    rebooks: 0,
    payment_taken: false,
    form_received: false,
    form_sent_at: null,
    next_action_at: new Date().toISOString(),
    created_by: userId,
    enquiry_raw: null,
  }

  const { data: lead, error } = await admin.from('leads').insert(leadPayload).select('id').single()
  if (error || !lead) return { error: error?.message ?? 'Failed to create lead' }

  await admin.from('activities').insert({ lead_id: lead.id, user_id: userId, kind: 'system', body: `Lead created manually by staff (${data.source || 'walk-in'})` })
  if (data.notes?.trim()) {
    await admin.from('activities').insert({ lead_id: lead.id, user_id: userId, kind: 'note', body: data.notes.trim() })
  }
  await logAudit({ entity: 'leads', entity_id: lead.id, user_id: userId, action: 'manual_create', after: leadPayload })
  revalidate()
  return { leadId: lead.id }
}
