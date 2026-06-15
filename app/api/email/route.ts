import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'

/**
 * Outbound email via Zapier → Gmail draft.
 *
 * Body:
 * {
 *   leadId:   string
 *   kind:     'confirmation' | 'adhoc'
 *   subject?: string   (adhoc only)
 *   body?:    string   (adhoc only)
 * }
 *
 * POSTs merge fields to ZAPIER_EMAIL_WEBHOOK_URL.
 * Zapier creates an HTML Gmail draft using the site template.
 */

const SITE_SIGNATURES: Record<string, string> = {
  coolaroo: `
<p style="color:#555;font-size:13px;margin-top:24px;">
  <strong>Athleta Gymnastics — Coolaroo</strong><br>
  📍 123 Example St, Coolaroo VIC 3048<br>
  📞 (03) 9999 0001<br>
  🌐 www.athletagymnastics.com.au
</p>`,
  altona_north: `
<p style="color:#555;font-size:13px;margin-top:24px;">
  <strong>Athleta Gymnastics — Altona North</strong><br>
  📍 456 Example Ave, Altona North VIC 3025<br>
  📞 (03) 9999 0002<br>
  🌐 www.athletagymnastics.com.au
</p>`,
}

function confirmationBody(
  guardianFirstName: string,
  childFirstName: string,
  trialDate: string,
  programmeName: string,
  site: string
): string {
  const sig = SITE_SIGNATURES[site] ?? SITE_SIGNATURES['coolaroo']
  return `
<p>Hi ${guardianFirstName},</p>

<p>Thanks for booking a trial for <strong>${childFirstName}</strong>! We're looking forward to meeting you.</p>

<p><strong>Trial details:</strong><br>
📅 ${trialDate}<br>
🤸 Programme: ${programmeName || 'To be confirmed'}</p>

<p>Please arrive 5 minutes early. ${childFirstName} will need to wear comfortable clothing and bare feet for gymnastics.</p>

<p>If you have any questions, don't hesitate to get in touch.</p>

<p>See you soon!</p>
${sig}
`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: { leadId: string; kind: 'confirmation' | 'adhoc'; subject?: string; body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch lead + guardian + programme
  const { data: lead } = await admin.from('leads').select('*, guardian:guardians(*), programme:programmes(name)').eq('id', body.leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const guardian = lead.guardian as Record<string, string> | null
  const guardianFirstName = guardian?.first_name ?? 'there'
  const guardianEmail = guardian?.email ?? null
  const childFirstName = lead.child_first
  const programmeName = (lead.programme as Record<string, string> | null)?.name ?? ''
  const trialDate = lead.trial_at
    ? new Date(lead.trial_at).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
    : 'TBC'

  const zapierUrl = process.env.ZAPIER_EMAIL_WEBHOOK_URL
  if (!zapierUrl) {
    return NextResponse.json({ error: 'ZAPIER_EMAIL_WEBHOOK_URL not configured' }, { status: 500 })
  }

  const subject = body.kind === 'confirmation'
    ? `Your trial booking — ${childFirstName} at Athleta Gymnastics`
    : (body.subject ?? `Message from Athleta Gymnastics`)

  const htmlBody = body.kind === 'confirmation'
    ? confirmationBody(guardianFirstName, childFirstName, trialDate, programmeName, lead.site)
    : (body.body ?? '')

  const mergeFields = {
    to: guardianEmail,
    subject,
    html_body: htmlBody,
    site: lead.site,
    guardian_name: `${guardian?.first_name ?? ''} ${guardian?.last_name ?? ''}`.trim(),
    guardian_email: guardianEmail,
    child_name: `${lead.child_first} ${lead.child_last}`,
    trial_date: trialDate,
    programme: programmeName,
    kind: body.kind,
  }

  const zapRes = await fetch(zapierUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mergeFields),
  })

  if (!zapRes.ok) {
    return NextResponse.json({ error: 'Zapier webhook failed', status: zapRes.status }, { status: 502 })
  }

  // Stamp confirmation_sent_at and log activity
  if (body.kind === 'confirmation') {
    await admin.from('leads').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', body.leadId)
  }

  await admin.from('activities').insert({
    lead_id: body.leadId,
    user_id: authUser.id,
    kind: 'comm',
    body: body.kind === 'confirmation' ? 'Confirmation email sent' : `Email sent — ${subject}`,
  })

  await logAudit({
    entity: 'leads',
    entity_id: body.leadId,
    user_id: authUser.id,
    action: body.kind === 'confirmation' ? 'send_confirmation_email' : 'send_adhoc_email',
    after: { subject, to: guardianEmail },
  })

  return NextResponse.json({ ok: true })
}
