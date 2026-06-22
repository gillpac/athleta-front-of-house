import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppUser, Lead, Target, BlockoutDay, ChecklistItem, ChecklistCompletion, Programme, Guardian } from '@/types'
import TodayClient from './TodayClient'

export default async function TodayPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .single<AppUser>()

  if (!appUser) redirect('/login?error=no_profile')

  // Use Melbourne local date (not the server's UTC date) so "today" matches
  // what reception sees on the clock. en-CA formats as YYYY-MM-DD.
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const [yr, mo] = todayStr.split('-').map(Number)

  // First and last day of current month (Melbourne)
  const firstOfMonth = `${todayStr.slice(0, 7)}-01`
  const lastDay = new Date(yr, mo, 0).getDate()
  const endOfMonth = `${todayStr.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`

  // Site filter — receptionist/site_lead are locked to their site; admin/management see all
  const siteFilter = appUser.site ?? null

  // Build leads query
  let leadsQuery = supabase
    .from('leads')
    .select('*, guardians(*)')
    .is('archived_at', null)
    .in('status', ['new', 'booked', 'noshow', 'won'])

  if (siteFilter) {
    leadsQuery = leadsQuery.eq('site', siteFilter)
  }

  const { data: allLeads } = await leadsQuery.order('received_at', { ascending: true })

  const leads = (allLeads ?? []) as (Lead & { guardians: Guardian })[]

  // Compare next_action_at (UTC ISO) against Melbourne date — avoids DST timezone bugs
  const toMelbDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const newLeads = leads.filter(l => {
    if (l.status !== 'new') return false
    if (!l.next_action_at) return true
    return toMelbDate(l.next_action_at) <= todayStr
  })
  const upcomingNewLeads = leads
    .filter(l => l.status === 'new' && l.next_action_at && toMelbDate(l.next_action_at) > todayStr)
    .sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? ''))
  const todayTrials = leads.filter(l =>
    l.status === 'booked' &&
    l.trial_at != null &&
    l.trial_at.startsWith(todayStr)
  )
  const bookedLeads = leads
    .filter(l => l.status === 'booked')
    .sort((a, b) => (a.trial_at ?? '').localeCompare(b.trial_at ?? ''))
  const noShows = leads.filter(l => l.status === 'noshow')
  const unverifiedSales = leads.filter(l => l.status === 'won' && l.verified_at == null)

  // Target — load for the user's site (or combined for admin/management)
  let targetData: Target | null = null
  let perSiteTargets: Record<string, Target> = {}
  if (siteFilter) {
    const { data } = await supabase
      .from('targets')
      .select('*')
      .eq('month', firstOfMonth)
      .eq('site', siteFilter)
      .single<Target>()
    targetData = data
  } else {
    // Admin/management: fetch all sites and build combined + per-site
    const { data: allTargets } = await supabase
      .from('targets')
      .select('*')
      .eq('month', firstOfMonth)
    if (allTargets && allTargets.length > 0) {
      for (const t of allTargets) perSiteTargets[t.site] = t
      const combined = allTargets.reduce((acc, t) => ({
        id: 'combined',
        site: 'coolaroo' as const,
        month: firstOfMonth,
        net_growth_goal: acc.net_growth_goal + t.net_growth_goal,
        sales_goal: (acc.sales_goal ?? 0) + (t.sales_goal ?? 0),
      }), { id: 'combined', site: 'coolaroo' as const, month: firstOfMonth, net_growth_goal: 0, sales_goal: 0 })
      targetData = combined
    }
  }

  // Verified sales this month (for progress)
  let verifiedQuery = supabase
    .from('leads')
    .select('id, site')
    .eq('status', 'won')
    .not('verified_at', 'is', null)
    .gte('sold_at', firstOfMonth + 'T00:00:00.000Z')
    .is('archived_at', null)

  if (siteFilter) {
    verifiedQuery = verifiedQuery.eq('site', siteFilter)
  }

  const { data: verifiedSales } = await verifiedQuery
  const verifiedCount = verifiedSales?.length ?? 0
  // Per-site verified counts for admin rail toggle
  const verifiedBySite: Record<string, number> = {}
  for (const v of verifiedSales ?? []) {
    if (v.site) verifiedBySite[v.site] = (verifiedBySite[v.site] ?? 0) + 1
  }

  // Verified sales this week (for "sales this week" rail widget)
  const weekStart = (() => {
    const d = new Date(todayStr + 'T12:00:00')
    const dow = d.getDay()
    const daysBack = dow === 0 ? 6 : dow - 1
    d.setDate(d.getDate() - daysBack)
    return d.toISOString().split('T')[0]
  })()
  // Notified sales this week (status won) — updates immediately when a sale is
  // logged, before admin verification. Verified count shown alongside for clarity.
  let weekSalesQuery = supabase
    .from('leads')
    .select('id, verified_at')
    .eq('status', 'won')
    .gte('sold_at', weekStart + 'T00:00:00.000Z')
    .is('archived_at', null)
  if (siteFilter) weekSalesQuery = weekSalesQuery.eq('site', siteFilter)
  const { data: weekSalesData } = await weekSalesQuery
  const weekSalesCount = weekSalesData?.length ?? 0
  const weekVerifiedCount = (weekSalesData ?? []).filter(s => s.verified_at != null).length

  // Blockout days for month
  let blockoutQuery = supabase
    .from('blockout_days')
    .select('*')
    .gte('day', todayStr)
    .lte('day', endOfMonth)

  if (siteFilter) {
    blockoutQuery = blockoutQuery.eq('site', siteFilter)
  }

  const { data: blockoutDays } = await blockoutQuery

  // Checklist items
  let checklistQuery = supabase
    .from('checklist_items')
    .select('*')
    .eq('active', true)
    .order('sort')

  if (siteFilter) {
    checklistQuery = checklistQuery.or(`site.is.null,site.eq.${siteFilter}`)
  } else {
    checklistQuery = checklistQuery.is('site', null)
  }

  const { data: checklistItems } = await checklistQuery

  // Today's completions for current user
  const { data: completions } = await supabase
    .from('checklist_completions')
    .select('*')
    .eq('user_id', appUser.id)
    .eq('day', todayStr)

  // Activities for all visible leads (arrived state + profile timeline)
  const allVisibleIds = Array.from(new Set([
    ...newLeads.map(l => l.id),
    ...upcomingNewLeads.map(l => l.id),
    ...bookedLeads.map(l => l.id),
    ...noShows.map(l => l.id),
  ]))
  let activitiesData: Array<{ lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }> = []
  if (allVisibleIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('lead_id, user_id, kind, body, created_at')
      .in('lead_id', allVisibleIds)
      .order('created_at', { ascending: false })
    activitiesData = acts ?? []
  }

  // User name map for timeline attribution
  const { data: allUsers } = await supabase.from('app_users').select('id, name')
  const userNames: Record<string, string> = {}
  for (const u of allUsers ?? []) userNames[u.id] = u.name

  // Programmes
  const { data: programmes } = await supabase
    .from('programmes')
    .select('*')
    .eq('active', true)
    .order('sort')

  return (
    <TodayClient
      appUser={appUser}
      newLeads={newLeads}
      upcomingNewLeads={upcomingNewLeads}
      todayTrials={todayTrials}
      bookedLeads={bookedLeads}
      noShows={noShows}
      unverifiedSales={unverifiedSales}
      target={targetData}
      perSiteTargets={perSiteTargets}
      verifiedCount={verifiedCount}
      verifiedBySite={verifiedBySite}
      blockoutDays={(blockoutDays ?? []) as BlockoutDay[]}
      checklistItems={(checklistItems ?? []) as ChecklistItem[]}
      completions={(completions ?? []) as ChecklistCompletion[]}
      todayActivities={activitiesData}
      userNames={userNames}
      programmes={(programmes ?? []) as Programme[]}
      todayStr={todayStr}
      weekSalesCount={weekSalesCount}
      weekVerifiedCount={weekVerifiedCount}
    />
  )
}
