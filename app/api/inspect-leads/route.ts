import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Read-only inspection of specific leads by child name. Makes NO changes.
const SETUP_KEY = 'inspect-2026-06-22'
const NAMES: Array<[string, string]> = [
  ['Ayla', 'Demir'],
  ['Zahraa', 'Al Sawafi'],
  ['Francesco', 'Talarico'],
]

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

  const out: unknown[] = []

  for (const [first, last] of NAMES) {
    // Match the child name loosely (ignore archived filter so we see everything)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, child_first, child_last, status, trial_at, contacted, attempts, rebooks, next_action_at, received_at, archived_at')
      .ilike('child_first', first)
      .ilike('child_last', last)

    for (const lead of leads ?? []) {
      const { data: acts } = await supabase
        .from('activities')
        .select('kind, body, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      out.push({
        name: `${lead.child_first} ${lead.child_last}`,
        id: lead.id,
        received_at_melb: new Date(lead.received_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }),
        received_weekday: new Date(lead.received_at).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' }),
        status: lead.status,
        trial_at: lead.trial_at,
        contacted: lead.contacted,
        attempts: lead.attempts,
        archived: !!lead.archived_at,
        activities: (acts ?? []).map(a => `[${a.kind}] ${a.body}`),
      })
    }
  }

  return NextResponse.json({ ok: true, leads: out })
}
