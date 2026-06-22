import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// One-time: archive all test/demo cancellations (Lucas Romano, Billy, John)
// ahead of go-live. Soft-delete only — recoverable.
const SETUP_KEY = 'cancels-archive-2026-06-22'

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

  const { data: archived, error } = await supabase.from('cancellations')
    .update({ archived_at: new Date().toISOString() })
    .is('archived_at', null)
    .select('member_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    archivedCount: archived?.length ?? 0,
    archived: (archived ?? []).map(c => c.member_name),
  })
}
