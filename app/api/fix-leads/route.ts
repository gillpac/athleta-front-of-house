import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-time sweep: reset EVERY non-archived lead to a clean enquiry — status
// 'new', trial/followups/notes cleared, keeping only the original
// "Enquiry received" timeline entry.
const SETUP_KEY = 'sweep-2026-06-22'

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

  const { data: leads } = await supabase.from('leads')
    .select('id, child_first, child_last')
    .is('archived_at', null)

  const log: string[] = []

  for (const lead of leads ?? []) {
    await supabase.from('leads').update({
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
      lost_reason: null,
      nurture_followup_at: null,
      next_action_at: new Date().toISOString(),
    }).eq('id', lead.id)

    const { data: acts } = await supabase.from('activities').select('id, kind, body').eq('lead_id', lead.id)
    const toDelete = (acts ?? []).filter(a => !(a.kind === 'system' && a.body.startsWith('Enquiry received'))).map(a => a.id)
    if (toDelete.length > 0) await supabase.from('activities').delete().in('id', toDelete)

    if (toDelete.length > 0) log.push(`${lead.child_first} ${lead.child_last}: cleared ${toDelete.length} entries`)
  }

  return NextResponse.json({ ok: true, totalLeads: leads?.length ?? 0, cleared: log })
}
