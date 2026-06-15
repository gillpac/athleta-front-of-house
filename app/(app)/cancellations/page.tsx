import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CancellationsClient from './CancellationsClient'
import type { AppUser, Cancellation } from '@/types'

export default async function CancellationsPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: appUser } = await supabase.from('app_users').select('*').eq('id', authUser.id).single<AppUser>()
  if (!appUser) redirect('/login?error=no_profile')

  const siteFilter = appUser.site ?? null

  let q = supabase
    .from('cancellations')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (siteFilter) q = q.eq('site', siteFilter)

  const { data: raw } = await q
  const cancellations = (raw ?? []) as Cancellation[]

  return <CancellationsClient user={appUser} cancellations={cancellations} />
}
