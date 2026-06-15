import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AppShell from './AppShell'
import type { AppUser } from '@/types'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .single<AppUser>()

  if (!appUser) {
    redirect('/login?error=no_profile')
  }

  const cookieStore = await cookies()
  const preferredSite = cookieStore.get('preferred_site')?.value ?? 'all'

  return <AppShell user={appUser as AppUser} preferredSite={preferredSite}>{children}</AppShell>
}
