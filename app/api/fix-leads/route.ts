import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Read-only: list all non-archived cancellations so we can see what's there.
const SETUP_KEY = 'cancels-2026-06-22'

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 401 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data } = await supabase.from('cancellations')
    .select('id, member_name, site, stage, notice_date, effective_date, created_at')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  const list = (data ?? []).map(c => ({
    name: c.member_name,
    site: c.site,
    stage: c.stage,
    notice_date: c.notice_date,
    effective_date: c.effective_date,
    created: c.created_at ? new Date(c.created_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' }) : null,
  }))

  return NextResponse.json({ ok: true, count: list.length, cancellations: list })
}
