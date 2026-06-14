import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TodayClient from './TodayClient'
import type {
  AppUser,
  Lead,
  Guardian,
  Programme,
  Target,
  BlockoutDay,
  ChecklistItem,
} from '@/types'

export const dynamic = 'force-dynamic'

export interface LeadWithGuardian extends Lead {
  guardian: Guardian | null
}

/** Start (inclusive) and end (exclusive) of the local day for an offset in days. */
function dayBounds(offset: number) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + offset)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default async function TodayPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .single<AppUser>()
  if (!appUser) redirect('/login?error=no_profile')

  // Admin / management see both sites; receptionists & site leads see their own.
  const seesAllSites = appUser.role === 'admin' || appUser.role === 'management'
  const site = appUser.site
  const scoped = site && !seesAllSites

  const leadSelect = '*, guardian:guardians(*)'

  // ---- Target for the current month ----
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthKey = monthStart.toISOString().slice(0, 10)

  let targetQuery = supabase.from('targets').select('*').eq('month', monthKey)
  if (scoped) targetQuery = targetQuery.eq('site', site)
  const { data: targetRows } = await targetQuery
  const target: Target | null = ((targetRows?.[0] as Target) ?? null)

  // ---- Date windows ----
  const today = dayBounds(0)
  const tomorrow = dayBounds(1)
  const weekStart = dayBounds(2).start
  const weekEndDate = new Date()
  weekEndDate.setHours(23, 59, 59, 999)
  const dow = weekEndDate.getDay() // 0 Sun .. 6 Sat
  const daysToSat = (6 - dow + 7) % 7
  weekEndDate.setDate(weekEndDate.getDate() + daysToSat)
  const weekEnd = weekEndDate.toISOString()

  // ---- Lead queries ----
  let qNew = supabase.from('leads').select(leadSelect).eq('status', 'new').is('archived_at', null)
  let qToday = supabase.from('leads').select(leadSelect).eq('status', 'booked').is('archived_at', null).gte('trial_at', today.start).lt('trial_at', today.end)
  let qNoShow = supabase.from('leads').select(leadSelect).eq('status', 'noshow').is('archived_at', null)
  let qTomorrow = supabase.from('leads').select(leadSelect).eq('status', 'booked').is('archived_at', null).gte('trial_at', tomorrow.start).lt('trial_at', tomorrow.end)
  let qWeek = supabase.from('leads').select(leadSelect).eq('status', 'booked').is('archived_at', null).gte('trial_at', weekStart).lte('trial_at', weekEnd)
  let qSales = supabase.from('leads').select(leadSelect).eq('status', 'won').is('archived_at', null).is('verified_at', null)

  if (scoped) {
    qNew = qNew.eq('site', site)
    qToday = qToday.eq('site', site)
    qNoShow = qNoShow.eq('site', site)
    qTomorrow = qTomorrow.eq('site', site)
    qWeek = qWeek.eq('site', site)
    qSales = qSales.eq('site', site)
  }

  const [
    { data: newLeadsRaw },
    { data: todayTrialsRaw },
    { data: noShowsRaw },
    { data: tomorrowTrialsRaw },
    { data: weekTrialsRaw },
    { data: unverifiedSalesRaw },
  ] = await Promise.all([
    qNew.order('received_at', { ascending: true }),
    qToday.order('trial_at', { ascending: true }),
    qNoShow.order('received_at', { ascending: true }),
    qTomorrow.order('trial_at', { ascending: true }),
    qWeek.order('trial_at', { ascending: true }),
    qSales.order('sold_at', { ascending: true }),
  ])

  // ---- Programmes ----
  const { data: programmesRaw } = await supabase
    .from('programmes')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true })

  // ---- Checklist items for this site (null = all sites) ----
  let checklistQuery = supabase
    .from('checklist_items')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true })
  if (scoped) checklistQuery = checklistQuery.or(`site.is.null,site.eq.${site}`)
  const { data: checklistRaw } = await checklistQuery

  // ---- Today's completions for this user ----
  const todayDate = new Date().toISOString().slice(0, 10)
  const { data: completionsRaw } = await supabase
    .from('checklist_completions')
    .select('item_id')
    .eq('user_id', appUser.id)
    .eq('day', todayDate)
  const completedItemIds = (completionsRaw ?? []).map(
    (c: { item_id: string }) => c.item_id
  )

  // ---- Blockout days ----
  let blockoutQuery = supabase.from('blockout_days').select('*')
  if (scoped) blockoutQuery = blockoutQuery.eq('site', site)
  const { data: blockoutRaw } = await blockoutQuery

  return (
    <TodayClient
      user={appUser}
      target={target}
      newLeads={(newLeadsRaw ?? []) as unknown as LeadWithGuardian[]}
      todayTrials={(todayTrialsRaw ?? []) as unknown as LeadWithGuardian[]}
      noShows={(noShowsRaw ?? []) as unknown as LeadWithGuardian[]}
      tomorrowTrials={(tomorrowTrialsRaw ?? []) as unknown as LeadWithGuardian[]}
      weekTrials={(weekTrialsRaw ?? []) as unknown as LeadWithGuardian[]}
      unverifiedSales={(unverifiedSalesRaw ?? []) as unknown as LeadWithGuardian[]}
      programmes={(programmesRaw ?? []) as Programme[]}
      checklistItems={(checklistRaw ?? []) as ChecklistItem[]}
      completedItemIds={completedItemIds}
      blockoutDays={(blockoutRaw ?? []) as BlockoutDay[]}
    />
  )
}
