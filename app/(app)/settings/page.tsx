import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from './SettingsClient'
import type { AppUser, Programme, BlockoutDay, ChecklistItem } from '@/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase.from('app_users').select('*').eq('id', authUser.id).single<AppUser>()
  if (!appUser) redirect('/login?error=no_profile')
  if (!['admin', 'management'].includes(appUser.role)) redirect('/today')

  const [programmesRes, blockoutRes, checklistRes, usersRes] = await Promise.all([
    supabase.from('programmes').select('*').order('sort', { ascending: true }),
    supabase.from('blockout_days').select('*').order('day', { ascending: true }),
    supabase.from('checklist_items').select('*').order('sort', { ascending: true }),
    supabase.from('app_users').select('*').order('name', { ascending: true }),
  ])

  return (
    <SettingsClient
      user={appUser}
      programmes={(programmesRes.data ?? []) as Programme[]}
      blockoutDays={(blockoutRes.data ?? []) as BlockoutDay[]}
      checklistItems={(checklistRes.data ?? []) as ChecklistItem[]}
      allUsers={(usersRes.data ?? []) as AppUser[]}
    />
  )
}
