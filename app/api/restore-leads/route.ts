import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-time fix: the earlier cleanup used the wrong cutoff and archived Friday
// and Saturday's real leads. Restore everything received from Friday 19 June
// 2026 00:00 Melbourne (= 2026-06-18T14:00:00Z) onward.
const SETUP_KEY = 'restore-2026-06-22'
const CUTOFF = '2026-06-18T14:00:00Z'

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 401 })
  }
  return runRestore()
}

export async function POST() {
  return runRestore()
}

async function runRestore() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Un-archive leads received from Friday onward
  const { data: restoredLeads, error: leadsErr } = await supabase
    .from('leads')
    .update({ archived_at: null })
    .gte('received_at', CUTOFF)
    .not('archived_at', 'is', null)
    .select('id, guardian_id')

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 })
  }

  // Restore the guardians attached to those leads
  const guardianIds = Array.from(new Set((restoredLeads ?? []).map(l => l.guardian_id).filter(Boolean)))
  let restoredGuardians = 0
  for (const gid of guardianIds) {
    const { error } = await supabase.from('guardians').update({ archived_at: null }).eq('id', gid).not('archived_at', 'is', null)
    if (!error) restoredGuardians++
  }

  return NextResponse.json({
    ok: true,
    restoredLeads: restoredLeads?.length ?? 0,
    restoredGuardians,
    cutoff: CUTOFF,
  })
}
