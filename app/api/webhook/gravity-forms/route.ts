import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'

/**
 * Inbound webhook from Gravity Forms via Zapier.
 *
 * Expected body (all fields optional except site):
 * {
 *   // Guardian
 *   parent_first:   string
 *   parent_last:    string
 *   phone:          string   (used for dedup)
 *   email?:         string   (fallback dedup key)
 *   preferred_contact?: 'call' | 'sms' | 'email'
 *   relationship?:  string   (mother/father/carer)
 *
 *   // Site routing
 *   site:           'coolaroo' | 'altona_north'
 *
 *   // UTM
 *   utm_source?:    string
 *   utm_medium?:    string
 *   utm_campaign?:  string
 *   source?:        string   (lead source label, default 'website')
 *   referrer_name?: string
 *
 *   // Up to 4 children — child_first_1 … child_first_4
 *   child_first_1:  string
 *   child_last_1?:  string
 *   dob_1?:         string   (ISO date)
 *   gender_1?:      string
 *   programme_name_1?: string
 *   interest_1?:    string
 *
 *   child_first_2?: string
 *   ... (same pattern for _2, _3, _4)
 *
 *   // Raw form data stored verbatim
 *   [key: string]:  unknown
 * }
 */

const SITE_VALUES = ['coolaroo', 'altona_north'] as const
type SiteT = typeof SITE_VALUES[number]

function normalisePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0/, '+61').replace(/^61/, '+61')
}

export async function POST(req: NextRequest) {
  // Verify webhook secret if configured
  const secret = process.env.WEBHOOK_SECRET
  if (secret) {
    const authHeader = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
    if (authHeader !== secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const site = (body.site as string | undefined)?.toLowerCase()
  if (!site || !SITE_VALUES.includes(site as SiteT)) {
    return NextResponse.json({ error: 'Missing or invalid site field' }, { status: 400 })
  }

  const phone = body.phone ? normalisePhone(String(body.phone)) : null
  const email = (body.email as string | undefined) ?? null

  if (!phone && !email) {
    return NextResponse.json({ error: 'Need at least phone or email to identify guardian' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── Deduplicate guardian by phone then email ──────────────────────────────
  let guardianId: string | null = null

  if (phone) {
    const { data } = await admin.from('guardians').select('id').eq('phone', phone).is('archived_at', null).single()
    if (data) guardianId = data.id
  }
  if (!guardianId && email) {
    const { data } = await admin.from('guardians').select('id').eq('email', email).is('archived_at', null).single()
    if (data) guardianId = data.id
  }

  const guardianPayload = {
    first_name: String(body.parent_first ?? '').trim() || 'Unknown',
    last_name: String(body.parent_last ?? '').trim() || '',
    phone: phone ?? '',
    email: email ?? null,
    preferred_contact: (body.preferred_contact as string | undefined) ?? null,
  }

  if (guardianId) {
    // Update contact details in case they changed
    await admin.from('guardians').update(guardianPayload).eq('id', guardianId)
  } else {
    const { data, error } = await admin.from('guardians').insert(guardianPayload).select('id').single()
    if (error || !data) {
      return NextResponse.json({ error: 'Failed to create guardian', detail: error?.message }, { status: 500 })
    }
    guardianId = data.id
  }

  // ── Process up to 4 children ─────────────────────────────────────────────
  const createdLeads: string[] = []
  const skippedLeads: string[] = []

  for (let i = 1; i <= 4; i++) {
    const childFirst = String(body[`child_first_${i}`] ?? '').trim()
    if (!childFirst) continue

    const childLast = String(body[`child_last_${i}`] ?? '').trim()
    const dob = (body[`dob_${i}`] as string | undefined) ?? null
    const gender = (body[`gender_${i}`] as string | undefined) ?? null
    const programmeName = (body[`programme_name_${i}`] as string | undefined) ?? null

    // Find programme by name if provided
    let programmeId: string | null = null
    if (programmeName) {
      const { data: prog } = await admin.from('programmes').select('id').ilike('name', programmeName).single()
      if (prog) programmeId = prog.id
    }

    // Check for duplicate lead: same guardian + same child name
    const { data: existing } = await admin.from('leads')
      .select('id')
      .eq('guardian_id', guardianId)
      .ilike('child_first', childFirst)
      .ilike('child_last', childLast || '')
      .is('archived_at', null)
      .single()

    if (existing) {
      skippedLeads.push(existing.id)
      continue
    }

    const leadPayload = {
      guardian_id: guardianId,
      relationship: (body.relationship as string | undefined) ?? null,
      child_first: childFirst,
      child_last: childLast || childFirst,
      dob: dob ?? null,
      gender: gender ?? null,
      site: site as SiteT,
      programme_id: programmeId,
      source: (body.source as string | undefined) ?? 'website',
      referrer_name: (body.referrer_name as string | undefined) ?? null,
      utm_source: (body.utm_source as string | undefined) ?? null,
      utm_medium: (body.utm_medium as string | undefined) ?? null,
      utm_campaign: (body.utm_campaign as string | undefined) ?? null,
      status: 'new',
      contacted: false,
      attempts: 0,
      rebooks: 0,
      payment_taken: false,
      form_received: false,
      // Always stamp arrival time on the server — never trust a date from the form.
      received_at: new Date().toISOString(),
      next_action_at: new Date().toISOString(),
      enquiry_raw: body,
    }

    const { data: lead, error: leadError } = await admin.from('leads').insert(leadPayload).select('id').single()
    if (leadError || !lead) {
      return NextResponse.json({ error: 'Failed to create lead', detail: leadError?.message }, { status: 500 })
    }

    createdLeads.push(lead.id)

    await admin.from('activities').insert({
      lead_id: lead.id,
      user_id: null,
      kind: 'system',
      body: `Enquiry received${body.utm_source ? ` via ${body.utm_source}${body.utm_medium ? `/${body.utm_medium}` : ''}` : ` via ${(body.source as string | undefined) ?? 'website'}`}`,
    })

    await logAudit({
      entity: 'leads',
      entity_id: lead.id,
      user_id: null,
      action: 'webhook_create',
      after: leadPayload,
    })
  }

  return NextResponse.json({
    ok: true,
    guardian_id: guardianId,
    leads_created: createdLeads,
    leads_skipped: skippedLeads,
  })
}
