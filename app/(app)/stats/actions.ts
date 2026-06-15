'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { logAudit } from '@/lib/audit'
import type { SiteT } from '@/types'

export async function upsertTarget(
  site: SiteT,
  month: string,
  netGrowthGoal: number,
  salesGoal: number | null,
  userId: string
) {
  const supabase = await createClient()
  const { data: before } = await supabase.from('targets').select('*').eq('site', site).eq('month', month).single()
  await supabase.from('targets').upsert({ site, month, net_growth_goal: netGrowthGoal, sales_goal: salesGoal }, { onConflict: 'site,month' })
  await logAudit({ entity: 'targets', entity_id: `${site}-${month}`, user_id: userId, action: 'upsert_target', before, after: { site, month, netGrowthGoal, salesGoal } })
  revalidatePath('/stats')
}

export async function updateSiteMembers(site: SiteT, currentMembers: number, userId: string) {
  const admin = createAdminClient()
  await admin.from('site_settings').upsert({ site, current_members: currentMembers, updated_at: new Date().toISOString(), updated_by: userId })
  await logAudit({ entity: 'site_settings', entity_id: site, user_id: userId, action: 'update_site_members', after: { currentMembers } })
  revalidatePath('/stats')
}
