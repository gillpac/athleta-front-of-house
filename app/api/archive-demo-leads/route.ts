import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-time admin action: soft-archive all leads received before the live launch date (2026-06-21)
// Only callable with SUPABASE_SERVICE_ROLE_KEY — safe to expose as POST endpoint
export async function POST() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Melbourne midnight on 2026-06-21 = 2026-06-20T14:00:00Z
  const cutoff = '2026-06-20T14:00:00Z'
  const now = new Date().toISOString()

  // Archive leads received before the cutoff that aren't already archived
  const { data: archivedLeads, error: leadsErr } = await supabase
    .from('leads')
    .update({ archived_at: now })
    .lt('received_at', cutoff)
    .is('archived_at', null)
    .select('id, guardian_id')

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 })
  }

  const archivedCount = archivedLeads?.length ?? 0

  // Archive guardians who now have no active (non-archived) leads
  const guardianIds = Array.from(new Set((archivedLeads ?? []).map(l => l.guardian_id).filter(Boolean)))
  let archivedGuardians = 0

  for (const gid of guardianIds) {
    const { data: remaining } = await supabase
      .from('leads')
      .select('id')
      .eq('guardian_id', gid)
      .is('archived_at', null)
      .limit(1)

    if (!remaining || remaining.length === 0) {
      await supabase.from('guardians').update({ archived_at: now }).eq('id', gid).is('archived_at', null)
      archivedGuardians++
    }
  }

  // Normalise the programme list to the three live options. Deactivate everything,
  // rename the legacy Kinder Gym in place (keeps its UUID / FK refs), then ensure
  // the three core programmes exist and are active.
  await supabase.from('programmes').update({ active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('programmes').update({ name: 'KinderGym', sort: 1, active: true }).eq('name', 'Kinder Gym')

  const coreProgrammes = [
    { name: 'KinderGym', sort: 1 },
    { name: 'Principles Development', sort: 2 },
    { name: 'Other', sort: 99 },
  ]
  for (const cp of coreProgrammes) {
    const { data: existing } = await supabase.from('programmes').select('id').eq('name', cp.name).limit(1)
    if (existing && existing.length > 0) {
      await supabase.from('programmes').update({ active: true, sort: cp.sort }).eq('name', cp.name)
    } else {
      await supabase.from('programmes').insert({ name: cp.name, sort: cp.sort, active: true })
    }
  }

  const { data: activeProgrammes } = await supabase.from('programmes').select('name').eq('active', true).order('sort')

  return NextResponse.json({
    ok: true,
    archivedLeads: archivedCount,
    archivedGuardians,
    cutoff,
    activeProgrammes: (activeProgrammes ?? []).map(p => p.name),
  })
}
