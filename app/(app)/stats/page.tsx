import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import StatsClient from './StatsClient'
import type { AppUser, Lead, Target, BlockoutDay, Cancellation, SiteSettings } from '@/types'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase.from('app_users').select('*').eq('id', authUser.id).single<AppUser>()
  if (!appUser) redirect('/login?error=no_profile')

  const isAdmin = appUser.role === 'admin' || appUser.role === 'management'
  const siteFilter = isAdmin ? null : appUser.site

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const todayStr = now.toISOString().split('T')[0]

  // Leads this month
  let leadsQ = supabase.from('leads').select('id, status, source, utm_source, utm_medium, utm_campaign, sold_at, sold_by, verified_at, payment_taken, received_at, contacted, attempts, site')
    .gte('received_at', monthStart)
    .is('archived_at', null)
  if (siteFilter) leadsQ = leadsQ.eq('site', siteFilter)
  const { data: leadsRaw } = await leadsQ
  const leads = (leadsRaw ?? []) as Lead[]

  // Verified cancellations this month (effective date in month)
  let cancelQ = supabase.from('cancellations').select('id, site, effective_date, stage, outcome, verified_at')
    .eq('stage', 'verified')
    .gte('effective_date', monthStart)
    .lte('effective_date', monthEnd)
    .is('archived_at', null)
  if (siteFilter) cancelQ = cancelQ.eq('site', siteFilter)
  const { data: cancelRaw } = await cancelQ
  const cancellations = (cancelRaw ?? []) as Cancellation[]

  // Targets
  let targetsQ = supabase.from('targets').select('*').eq('month', monthStart)
  if (siteFilter) targetsQ = targetsQ.eq('site', siteFilter)
  const { data: targetsRaw } = await targetsQ
  const targets = (targetsRaw ?? []) as Target[]

  // All time leads for source breakdown (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  let sourceQ = supabase.from('leads').select('source, utm_source, utm_medium, utm_campaign, received_at').gte('received_at', ninetyDaysAgo).is('archived_at', null)
  if (siteFilter) sourceQ = sourceQ.eq('site', siteFilter)
  const { data: sourceLeads } = await sourceQ

  // Staff users for "My Sales" section
  const { data: staffRaw } = await supabase.from('app_users').select('id, name, role, site').eq('active', true)
  const staff = staffRaw ?? []

  // Blockout days for pace calc
  let blockoutQ = supabase.from('blockout_days').select('*')
  if (siteFilter) blockoutQ = blockoutQ.eq('site', siteFilter)
  const { data: blockoutRaw } = await blockoutQ
  const blockoutDays = (blockoutRaw ?? []) as BlockoutDay[]

  // Site settings (member baseline for debit schedule)
  const { data: siteSettingsRaw } = await supabase.from('site_settings').select('*')
  const siteSettings = (siteSettingsRaw ?? []) as SiteSettings[]

  return (
    <StatsClient
      user={appUser}
      leads={leads}
      cancellations={cancellations}
      targets={targets}
      sourceLeads={sourceLeads ?? []}
      staff={staff as AppUser[]}
      blockoutDays={blockoutDays}
      monthStart={monthStart}
      todayStr={todayStr}
      siteSettings={siteSettings}
    />
  )
}
