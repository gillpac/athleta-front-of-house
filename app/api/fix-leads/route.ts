import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-time: delete two Friday test leads, reset Ayla Demir to fresh (keep
// enquiry), and return a full listing of remaining leads for review.
const SETUP_KEY = 'fix-2026-06-22'

const DELETE_IDS = [
  'b96beda6-939f-43ce-b320-f2d24296320b', // Zahraa Al sawafi (Friday test)
  'bbec00e0-dce1-4dc1-879d-9555288f4d3f', // Francesco Talarico (Friday test)
]
const RESET_ID = 'a84bb465-8ee9-4fb0-8acb-6163f59af290' // Ayla Demir (Monday — keep)

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 401 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const log: string[] = []

  // ── Delete the two test leads (activities first, then lead, then orphan guardian) ──
  for (const id of DELETE_IDS) {
    const { data: lead } = await supabase.from('leads').select('id, guardian_id, child_first, child_last').eq('id', id).single()
    if (!lead) { log.push(`delete ${id}: not found`); continue }

    await supabase.from('activities').delete().eq('lead_id', id)
    await supabase.from('leads').delete().eq('id', id)

    // Remove the guardian only if no other leads reference them
    if (lead.guardian_id) {
      const { data: others } = await supabase.from('leads').select('id').eq('guardian_id', lead.guardian_id).limit(1)
      if (!others || others.length === 0) {
        await supabase.from('guardians').delete().eq('id', lead.guardian_id)
      }
    }
    log.push(`deleted ${lead.child_first} ${lead.child_last}`)
  }

  // Resolve Mahira Khan (Coolaroo) by name so she gets the same clean reset
  const resetIds = [RESET_ID]
  {
    const { data: mahira } = await supabase.from('leads')
      .select('id').ilike('child_first', 'Mahira').ilike('child_last', 'Khan').eq('site', 'coolaroo').is('archived_at', null)
    for (const m of mahira ?? []) resetIds.push(m.id)
  }

  // ── Reset each kept lead to fresh, keeping the original enquiry-received entry ──
  for (const RESET_ID of resetIds) {
    const { error: updErr } = await supabase.from('leads').update({
      status: 'new',
      contacted: false,
      last_outcome: null,
      attempts: 0,
      rebooks: 0,
      trial_at: null,
      confirmation_sent_at: null,
      form_received: false,
      form_sent_at: null,
      programme_id: null,
      sold_at: null,
      sold_by: null,
      payment_taken: false,
      verified_at: null,
      verified_by: null,
      next_action_at: new Date().toISOString(),
    }).eq('id', RESET_ID)

    // Remove all activities except the original system "Enquiry received" entry
    const { data: acts } = await supabase.from('activities').select('id, kind, body').eq('lead_id', RESET_ID)
    const toDelete = (acts ?? []).filter(a => !(a.kind === 'system' && a.body.startsWith('Enquiry received'))).map(a => a.id)
    if (toDelete.length > 0) {
      await supabase.from('activities').delete().in('id', toDelete)
    }
    log.push(updErr ? `reset ${RESET_ID}: ${updErr.message}` : `reset ${RESET_ID} (removed ${toDelete.length} timeline entries)`)
  }

  // ── Full listing of remaining (non-archived) leads for review ──
  const { data: remaining } = await supabase
    .from('leads')
    .select('child_first, child_last, site, status, received_at')
    .is('archived_at', null)
    .order('received_at', { ascending: true })

  const list = (remaining ?? []).map(l => ({
    name: `${l.child_first} ${l.child_last}`,
    site: l.site,
    status: l.status,
    received: new Date(l.received_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }),
  }))

  return NextResponse.json({ ok: true, log, remainingCount: list.length, remaining: list })
}
