'use server'

import { createAdminClient } from '@/lib/supabase/server-admin'

export async function submitCancellation(formData: {
  memberName: string
  guardianName: string
  phone: string
  email: string
  site: 'coolaroo' | 'altona_north'
  level: string
  reasons: string[]
  feedback: string
  rating: number | null
  signatureName: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()

  const noticeDate = new Date().toISOString().split('T')[0]
  const effectiveDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { error } = await supabase.from('cancellations').insert({
    member_name: formData.memberName,
    guardian_name: formData.guardianName || null,
    phone: formData.phone || null,
    email: formData.email || null,
    site: formData.site,
    level: formData.level || null,
    reasons: formData.reasons,
    feedback: formData.feedback || null,
    rating: formData.rating,
    notice_date: noticeDate,
    effective_date: effectiveDate,
    stage: 'received',
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
