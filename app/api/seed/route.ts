import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Only allow in non-production environments
export async function POST() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
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

  const testUsers = [
    { email: 'receptionist@athleta.test', password: 'Test1234!', name: 'Chiara Russo',    role: 'receptionist', site: 'coolaroo' },
    { email: 'sitelead@athleta.test',     password: 'Test1234!', name: 'Mustafa Demir',   role: 'site_lead',    site: 'altona_north' },
    { email: 'admin@athleta.test',        password: 'Test1234!', name: 'Admin User',       role: 'admin',        site: null },
    { email: 'management@athleta.test',   password: 'Test1234!', name: 'Management User',  role: 'management',   site: null },
  ]

  const results: Array<{ email: string; status: string; error?: string }> = []

  for (const u of testUsers) {
    // Check if auth user already exists
    const { data: existing } = await supabase.auth.admin.listUsers()
    const existingUser = existing?.users.find((au) => au.email === u.email)

    let authId: string

    if (existingUser) {
      authId = existingUser.id
      results.push({ email: u.email, status: 'auth already exists' })
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      })
      if (error || !created.user) {
        results.push({ email: u.email, status: 'error', error: error?.message })
        continue
      }
      authId = created.user.id
      results.push({ email: u.email, status: 'created' })
    }

    // Upsert app_users row
    await supabase.from('app_users').upsert({
      id: authId,
      name: u.name,
      email: u.email,
      role: u.role,
      site: u.site,
      active: true,
    })
  }

  return NextResponse.json({ ok: true, results })
}
