'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
