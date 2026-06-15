import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LeadsClient from './LeadsClient'
import type { AppUser, Lead, Guardian, Activity, Programme } from '@/types'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase.from('app_users').select('*').eq('id', authUser.id).single<AppUser>()
  if (!appUser) redirect('/login?error=no_profile')

  const siteFilter = appUser.site ?? null

  let leadsQ = supabase
    .from('leads')
    .select('*')
    .not('status', 'in', '("lost")')
    .is('archived_at', null)
    .order('received_at', { ascending: false })
  if (siteFilter) leadsQ = leadsQ.eq('site', siteFilter)
  const { data: leadsRaw } = await leadsQ
  const leads = (leadsRaw ?? []) as Lead[]

  const guardianIds = Array.from(new Set(leads.map(l => l.guardian_id).filter(Boolean)))
  const leadIds = leads.map(l => l.id)

  const [guardiansRes, activitiesRes, programmesRes, usersRes] = await Promise.all([
    guardianIds.length > 0
      ? supabase.from('guardians').select('*').in('id', guardianIds)
      : Promise.resolve({ data: [] }),
    leadIds.length > 0
      ? supabase.from('activities').select('id, lead_id, user_id, kind, body, created_at').in('lead_id', leadIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('programmes').select('*').eq('active', true).order('sort', { ascending: true }),
    supabase.from('app_users').select('id, name'),
  ])

  const userNames: Record<string, string> = {}
  for (const u of usersRes.data ?? []) userNames[(u as { id: string; name: string }).id] = (u as { id: string; name: string }).name

  return (
    <LeadsClient
      user={appUser}
      leads={leads}
      guardians={(guardiansRes.data ?? []) as Guardian[]}
      activities={(activitiesRes.data ?? []) as Activity[]}
      programmes={(programmesRes.data ?? []) as Programme[]}
      userNames={userNames}
    />
  )
}
