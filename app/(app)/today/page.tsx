import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TodayClient from './TodayClient'
import type { TodayData } from './TodayClient'
import type { AppUser, Lead, Target, BlockoutDay, ChecklistItem, ChecklistCompletion, Programme, Guardian } from '@/types'

export default async function TodayPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', authUser.id)
    .single<AppUser>()

  if (!appUser) redirect('/login?error=no_profile')

  const site = appUser.site
  const isAdmin = appUser.role === 'admin' || appUser.role === 'management'

  // Date helpers
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // End of current week (Saturday)
  const dayOfWeek = now.getDay()
  const daysUntilSat = dayOfWeek === 6 ? 0 : 6 - dayOfWeek
  const endOfWeek = new Date(now)
  endOfWeek.setDate(now.getDate() + daysUntilSat)
  const endOfWeekStr = endOfWeek.toISOString().split('T')[0]

  const dayAfterTomorrow = new Date(tomorrow)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)
  const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0]

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const siteFilter = isAdmin ? null : site

  // Fetch target
  let targetData: Target | null = null
  if (siteFilter) {
    const { data } = await supabase
      .from('targets')
      .select('*')
      .eq('site', siteFilter)
      .eq('month', monthStart)
      .single<Target>()
    targetData = data
  } else {
    const { data } = await supabase
      .from('targets')
      .select('*')
      .eq('month', monthStart)
      .limit(1)
      .single<Target>()
    targetData = data
  }

  // Fetch new leads
  let newLeadsQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .is('archived_at', null)
    .order('received_at', { ascending: true })
  if (siteFilter) newLeadsQ = newLeadsQ.eq('site', siteFilter)
  const { data: newLeadsRaw } = await newLeadsQ
  const newLeads = (newLeadsRaw ?? []) as Lead[]

  // Fetch today's trials
  let todayTrialsQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'booked')
    .gte('trial_at', `${todayStr}T00:00:00`)
    .lte('trial_at', `${todayStr}T23:59:59`)
    .is('archived_at', null)
    .order('trial_at', { ascending: true })
  if (siteFilter) todayTrialsQ = todayTrialsQ.eq('site', siteFilter)
  const { data: todayTrialsRaw } = await todayTrialsQ
  const todayTrials = (todayTrialsRaw ?? []) as Lead[]

  // Fetch no-shows
  let noShowsQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'noshow')
    .is('archived_at', null)
    .order('received_at', { ascending: false })
  if (siteFilter) noShowsQ = noShowsQ.eq('site', siteFilter)
  const { data: noShowsRaw } = await noShowsQ
  const noShows = (noShowsRaw ?? []) as Lead[]

  // Fetch tomorrow's trials
  let tomorrowTrialsQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'booked')
    .gte('trial_at', `${tomorrowStr}T00:00:00`)
    .lte('trial_at', `${tomorrowStr}T23:59:59`)
    .is('archived_at', null)
    .order('trial_at', { ascending: true })
  if (siteFilter) tomorrowTrialsQ = tomorrowTrialsQ.eq('site', siteFilter)
  const { data: tomorrowTrialsRaw } = await tomorrowTrialsQ
  const tomorrowTrials = (tomorrowTrialsRaw ?? []) as Lead[]

  // Fetch this week's trials
  let weekTrialsQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'booked')
    .gte('trial_at', `${dayAfterTomorrowStr}T00:00:00`)
    .lte('trial_at', `${endOfWeekStr}T23:59:59`)
    .is('archived_at', null)
    .order('trial_at', { ascending: true })
  if (siteFilter) weekTrialsQ = weekTrialsQ.eq('site', siteFilter)
  const { data: weekTrialsRaw } = await weekTrialsQ
  const weekTrials = (weekTrialsRaw ?? []) as Lead[]

  // Fetch unverified sales
  let unverifiedSalesQ = supabase
    .from('leads')
    .select('*')
    .eq('status', 'won')
    .is('verified_at', null)
    .is('archived_at', null)
    .order('sold_at', { ascending: false })
  if (siteFilter) unverifiedSalesQ = unverifiedSalesQ.eq('site', siteFilter)
  const { data: unverifiedSalesRaw } = await unverifiedSalesQ
  const unverifiedSales = (unverifiedSalesRaw ?? []) as Lead[]

  // Fetch checklist items
  let checklistQ = supabase
    .from('checklist_items')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true })
  if (siteFilter) checklistQ = checklistQ.or(`site.eq.${siteFilter},site.is.null`)
  const { data: checklistItemsRaw } = await checklistQ
  const checklistItems = (checklistItemsRaw ?? []) as ChecklistItem[]

  // Fetch today's completions
  const { data: checklistCompletionsRaw } = await supabase
    .from('checklist_completions')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('day', todayStr)
  const checklistCompletions = (checklistCompletionsRaw ?? []) as ChecklistCompletion[]

  // Fetch blockout days
  let blockoutQ = supabase.from('blockout_days').select('*')
  if (siteFilter) blockoutQ = blockoutQ.eq('site', siteFilter)
  const { data: blockoutDaysRaw } = await blockoutQ
  const blockoutDays = (blockoutDaysRaw ?? []) as BlockoutDay[]

  // Collect all leads
  const allLeads = [...newLeads, ...todayTrials, ...noShows, ...tomorrowTrials, ...weekTrials, ...unverifiedSales]
  const guardianIds = Array.from(new Set(allLeads.map(l => l.guardian_id)))
  const leadIds = allLeads.map(l => l.id)

  // Fetch guardians
  let guardians: Guardian[] = []
  if (guardianIds.length > 0) {
    const { data: guardiansRaw } = await supabase
      .from('guardians')
      .select('*')
      .in('id', guardianIds)
    guardians = (guardiansRaw ?? []) as Guardian[]
  }

  // Fetch activities
  let activities: { id: string; lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }[] = []
  if (leadIds.length > 0) {
    const { data: activitiesRaw } = await supabase
      .from('activities')
      .select('id, lead_id, user_id, kind, body, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: true })
    activities = activitiesRaw ?? []
  }

  // Fetch programmes
  const { data: programmesRaw } = await supabase
    .from('programmes')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true })
  const programmes = (programmesRaw ?? []) as Programme[]

  const data: TodayData = {
    user: appUser,
    target: targetData,
    newLeads,
    todayTrials,
    noShows,
    tomorrowTrials,
    weekTrials,
    unverifiedSales,
    checklistItems,
    checklistCompletions,
    blockoutDays,
    guardians,
    programmes,
    activities,
  }

  return <TodayClient data={data} />
}
