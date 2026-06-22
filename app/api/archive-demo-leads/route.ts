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

  // Create the live staff logins (idempotent — skips any auth user that already exists,
  // and always upserts the app_users profile so role/site stay correct).
  const staff: Array<{ name: string; email: string; password: string; role: string; site: string | null }> = [
    { name: 'Mustafa Hamdan',  email: 'coolaroo.lead@athg.com.au', password: 'musty3048',       role: 'site_lead',   site: 'coolaroo' },
    { name: 'Elaina Black',    email: 'altona.lead@athg.com.au',   password: 'elaina33c',       role: 'site_lead',   site: 'altona_north' },
    { name: 'Naz Zaven',       email: 'naz@nazco.com.au',          password: 'nazcoportmelb',   role: 'management',  site: null },
    { name: 'Nicholas Packou', email: 'nicholas@athg.com.au',      password: 'Navarre1',        role: 'management',  site: null },
    { name: 'Nick Gillies',    email: 'n@athg.com.au',             password: 'Q8mb&12^Y#rRH7c', role: 'management',  site: null },
    { name: 'Daryl Ramos',     email: 'office@athg.com.au',        password: 'sXESZqphUNWrv4%', role: 'admin',       site: null },
  ]

  const staffResults: Array<{ email: string; status: string; error?: string }> = []
  const { data: existingUsers } = await supabase.auth.admin.listUsers()

  for (const s of staff) {
    let authId: string
    const existing = existingUsers?.users.find(au => au.email === s.email)
    if (existing) {
      authId = existing.id
      // Refresh the password so the listed credentials are guaranteed to work
      await supabase.auth.admin.updateUserById(authId, { password: s.password })
      staffResults.push({ email: s.email, status: 'updated' })
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: s.email,
        password: s.password,
        email_confirm: true,
      })
      if (error || !created.user) {
        staffResults.push({ email: s.email, status: 'error', error: error?.message })
        continue
      }
      authId = created.user.id
      staffResults.push({ email: s.email, status: 'created' })
    }

    const { error: upsertErr } = await supabase.from('app_users').upsert({
      id: authId,
      name: s.name,
      email: s.email,
      role: s.role,
      site: s.site,
      active: true,
    })
    if (upsertErr) staffResults.push({ email: s.email, status: 'app_users upsert failed', error: upsertErr.message })
  }

  return NextResponse.json({
    ok: true,
    archivedLeads: archivedCount,
    archivedGuardians,
    cutoff,
    activeProgrammes: (activeProgrammes ?? []).map(p => p.name),
    staff: staffResults,
  })
}
